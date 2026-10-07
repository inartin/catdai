// Provision one ordinary Supabase account; keep the review password outside source control.
import nextEnv from '@next/env';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { MAIB_TEST_USERNAME, MAIB_TEST_EMAIL, maibTestAuthConfig, isMaibTestUser } from '../src/lib/maib/test-auth.mjs';

if (process.env.NODE_ENV !== 'development') throw new Error('Run only with NODE_ENV=development.');
nextEnv.loadEnvConfig(process.cwd(), true);
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let config = maibTestAuthConfig();
if (config) {
  const { data, error } = await admin.auth.admin.getUserById(config.userId);
  if (error || !isMaibTestUser(data?.user, config.userId)) throw new Error('Configured account does not match the MAIB test user.');
} else {
  if (process.env.MAIB_TEST_USER_ID || process.env.MAIB_TEST_PASSWORD) throw new Error('Incomplete MAIB test settings; fix them before provisioning.');
  const password = crypto.randomBytes(24).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({
    email: MAIB_TEST_EMAIL, email_confirm: true,
    app_metadata: { maib_verification: true }, user_metadata: { name: 'MAIB Verification' },
  });
  if (error || !data?.user?.id) throw new Error(`Could not provision the dedicated MAIB user: ${error?.code || 'unknown'}`);
  config = { userId: data.user.id, password };
  await fs.appendFile('.env.development.local', `\n# Single MAIB verification account; server-only development settings.\nMAIB_TEST_USER_ID=${config.userId}\nMAIB_TEST_PASSWORD=${password}\n`, { mode: 0o600 });
  await fs.chmod('.env.development.local', 0o600);
}
await fs.mkdir('tmp', { recursive: true });
await fs.writeFile('tmp/maib-test-credentials.txt', `Website: https://dev.catdai.md\nOpen Login → MAIB test login\nUsername: ${MAIB_TEST_USERNAME}\nPassword: ${config.password}\n`, { mode: 0o600 });
await fs.chmod('tmp/maib-test-credentials.txt', 0o600);
console.log(`MAIB test user ready (${config.userId}). Credentials saved in tmp/maib-test-credentials.txt; restart the development server.`);
