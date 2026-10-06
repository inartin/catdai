// Isolated auth boundary tests: no live users, mail or sessions.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as testAuth from '../src/lib/maib/test-auth.mjs';

const userId = '00000000-0000-0000-0000-000000000001';
const environment = { NODE_ENV: 'development', MAIB_TEST_USER_ID: userId, MAIB_TEST_PASSWORD: 'test-password-with-32-characters' };
const account = { id: userId, email: testAuth.MAIB_TEST_EMAIL, app_metadata: { maib_verification: true } };
let allowed = true, accountUser = account, linkedUser = account, sessionUser = account, providerError = false;
let lookups = 0, links = 0, verifications = 0;
const admin = { auth: { admin: {
  async getUserById(id) { lookups++; assert.equal(id, userId); return { data: { user: accountUser } }; },
  async generateLink(input) { links++; assert.equal(input.type, 'magiclink'); assert.equal(input.email, account.email); return { data: { user: linkedUser, properties: { hashed_token: 'internal-token-hash' } } }; },
} } };
const createClient = (_url, _key, options) => {
  assert.equal(options.auth.persistSession, false);
  return { auth: { async verifyOtp(input) { verifications++; assert.equal(input.type, 'email'); assert.equal(input.token_hash, 'internal-token-hash'); return providerError ? { error: Error('provider unavailable') } : { data: { user: sessionUser, session: { access_token: 'access', refresh_token: 'refresh', other: 'hidden' } } }; } } };
};
const mocks = {
  '@supabase/supabase-js': { createClient }, 'next/server': { NextResponse: { json: Response.json } },
  '@/lib/supabase-admin': { supabaseAdmin: admin }, '@/lib/rate-limit': { rateLimit: () => ({ check: () => ({ allowed }) }) },
  '@/lib/maib/test-auth.mjs': { ...testAuth, maibTestAuthConfig: () => testAuth.maibTestAuthConfig(environment) },
};
const context = vm.createContext({ process: { env: environment }, Response, Request, URL });
const route = new vm.SourceTextModule(await fs.readFile('src/app/api/auth/maib-test/route.js', 'utf8'), { context });
await route.link(name => {
  assert.ok(mocks[name], name);
  const exports = mocks[name];
  return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key,value] of Object.entries(exports)) this.setExport(key,value); }, { context });
});
await route.evaluate();
const request = (body = { username: 'maib-test', password: environment.MAIB_TEST_PASSWORD }, origin = 'https://dev.catdai.md') => new Request('http://localhost:3000/api/auth/maib-test', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
for (const mode of ['production','test',undefined]) {
  environment.NODE_ENV = mode;
  assert.equal((await route.namespace.POST(request())).status,404);
}
assert.equal(lookups,0,'non-development requests never touch Supabase');
environment.NODE_ENV = 'development';
assert.equal((await route.namespace.POST(request({},'https://evil.test'))).status,403);
allowed=false; assert.equal((await route.namespace.POST(request())).status,429); allowed=true;
for (const body of [null,{}, { username:'other',password:environment.MAIB_TEST_PASSWORD }, { username:'maib-test',password:'wrong' }, { username:'maib-test',password:123 }, { username:'maib-test',password:'x'.repeat(1025) }]) assert.equal((await route.namespace.POST(request(body))).status,401);
assert.equal(lookups,0,'invalid credentials never look up or provision users');
assert.equal((await route.namespace.POST(request({username:'other',password:environment.MAIB_TEST_PASSWORD},'http://127.0.0.1:3000'))).status,401,'loopback origin survives Next.js localhost normalization');
const password=environment.MAIB_TEST_PASSWORD; delete environment.MAIB_TEST_PASSWORD;
assert.equal((await route.namespace.POST(request())).status,503); environment.MAIB_TEST_PASSWORD=password;
accountUser={...account,app_metadata:{},user_metadata:{maib_verification:true}};
assert.equal((await route.namespace.POST(request())).status,503,'user-editable metadata cannot authorize test account');
accountUser=account;
linkedUser={...account,id:'other'};
assert.equal((await route.namespace.POST(request())).status,502); assert.equal(verifications,0);
linkedUser=account; sessionUser={...account,id:'other'};
assert.equal((await route.namespace.POST(request())).status,502,'different session user is never returned');
sessionUser=account;providerError=true;
assert.equal((await route.namespace.POST(request())).status,502);providerError=false;
const response=await route.namespace.POST(request());
assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
assert.deepEqual(await response.json(),{session:{access_token:'access',refresh_token:'refresh'}});
assert.ok(links>0 && verifications>0);
assert.equal(testAuth.maibTestAuthConfig({...environment,NODE_ENV:'production'}),null);
assert.equal(testAuth.maibTestAuthConfig({...environment,MAIB_TEST_USER_ID:'invalid'}),null);
console.log('MAIB test login checks passed: development gate, single account, credentials, origin, rate limit, trusted metadata and session identity.');
