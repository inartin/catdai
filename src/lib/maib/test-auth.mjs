import crypto from 'node:crypto';

export const MAIB_TEST_USERNAME = 'maib-test';
export const MAIB_TEST_EMAIL = 'maib-verification@auth.catdai.md';

export function maibTestAuthConfig(env = process.env) {
  if (env.NODE_ENV !== 'development') return null;
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(env.MAIB_TEST_USER_ID || '') || (env.MAIB_TEST_PASSWORD || '').length < 16) return null;
  return { userId: env.MAIB_TEST_USER_ID, password: env.MAIB_TEST_PASSWORD };
}

export function validMaibTestCredentials(body, config) {
  if (!config || body?.username !== MAIB_TEST_USERNAME || typeof body.password !== 'string' || body.password.length > 1024) return false;
  const digest = value => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(body.password), digest(config.password));
}

export function isMaibTestUser(user, userId) {
  return user?.id === userId && user.email === MAIB_TEST_EMAIL && user.app_metadata?.maib_verification === true;
}
