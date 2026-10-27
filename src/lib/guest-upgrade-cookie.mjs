import crypto from 'node:crypto';

export const GUEST_UPGRADE_COOKIE = 'catdai-guest-upgrade';
export const GUEST_UPGRADE_MAX_AGE = 30 * 24 * 60 * 60;

function signature(value) {
  if (!process.env.SUPABASE_SERVICE_KEY) throw new Error('Guest upgrade signing is not configured.');
  return crypto.createHmac('sha256', process.env.SUPABASE_SERVICE_KEY).update(`catdai:guest-upgrade:${value}`).digest('base64url');
}

export function createGuestUpgradeCookie(userId, now = Date.now()) {
  const value = `${userId}.${Math.floor(now / 1000) + GUEST_UPGRADE_MAX_AGE}`;
  return `${value}.${signature(value)}`;
}

export function readGuestUpgradeCookie(token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 200) return null;
  const [id, expires, supplied, extra] = token.split('.');
  if (extra || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)
    || !/^\d{10}$/.test(expires) || Number(expires) <= now / 1000 || !/^[\w-]{43}$/.test(supplied)) return null;
  const expected = Buffer.from(signature(`${id}.${expires}`));
  const actual = Buffer.from(supplied);
  return crypto.timingSafeEqual(actual, expected) ? id : null;
}
