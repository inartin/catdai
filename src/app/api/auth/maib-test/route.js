import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { maibTestAuthConfig, validMaibTestCredentials, isMaibTestUser } from '@/lib/maib/test-auth.mjs';

const limiter = rateLimit({ interval: 60_000, limit: 5, namespace: 'maib-test-auth' });
const json = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request) {
  // Both UI and server enforce development-only access, including configured production deployments.
  if (process.env.NODE_ENV !== 'development') return json({ error: 'Not found.' }, 404);
  const config = maibTestAuthConfig();
  if (!config) return json({ error: 'MAIB test login is not configured.' }, 503);
  const origin = request.headers.get('origin');
  const requestUrl = new URL(request.url);
  const allowedOrigins = [requestUrl.origin, 'https://dev.catdai.md'];
  // Next.js normalizes loopback request URLs to localhost, including requests to 127.0.0.1.
  if (['localhost','127.0.0.1'].includes(requestUrl.hostname)) {
    for (const host of ['localhost','127.0.0.1']) allowedOrigins.push(`${requestUrl.protocol}//${host}${requestUrl.port ? `:${requestUrl.port}` : ''}`);
  }
  if (!origin || !allowedOrigins.includes(origin)) return json({ error: 'Invalid origin.' }, 403);
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  if (!limiter.check(ip).allowed) return json({ error: 'Too many login attempts. Try again in a minute.' }, 429);
  const body = await request.json().catch(() => null);
  if (!validMaibTestCredentials(body, config)) return json({ error: 'Invalid username or password.' }, 401);

  try {
    const { data: account, error: accountError } = await supabaseAdmin.auth.admin.getUserById(config.userId);
    if (accountError || !isMaibTestUser(account?.user, config.userId)) return json({ error: 'MAIB test login is not configured.' }, 503);
    // No email is sent and no public password/signup flow is added to Supabase.
    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: account.user.email });
    if (linkError || !link?.properties?.hashed_token || link.user?.id !== config.userId) throw new Error('Test session link failed');
    const auth = createClient(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await auth.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' });
    if (error || !data?.session || !isMaibTestUser(data.user, config.userId)) throw new Error('Test session failed');
    return json({ session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } });
  } catch {
    return json({ error: 'MAIB test login failed. Try again later.' }, 502);
  }
}
