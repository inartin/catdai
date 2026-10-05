export const ORDER_COLUMNS = 'id,provider,environment,product_key,status,transaction_id,subscription_id,amount_minor,currency_code,paid_at,created_at,refunded_minor,refund_status';
export function normalizePaymentOrder(row) {
  return { id: row.id, provider: row.provider, environment: row.environment, productKey: row.product_key,
    status: row.status, transactionId: row.transaction_id, subscriptionId: row.subscription_id,
    amountMinor: row.amount_minor, currencyCode: row.currency_code, paidAt: row.paid_at,
    createdAt: row.created_at, refundedMinor: row.refunded_minor, refundStatus: row.refund_status };
}
export function encodePaymentCursor(row) {
  return Buffer.from(JSON.stringify({ at: row.created_at, id: row.id, provider: row.provider })).toString('base64url');
}
export function decodePaymentCursor(value) {
  if (!value) return null;
  const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  if (!/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(cursor.at) || !Number.isFinite(Date.parse(cursor.at)) ||
    !/^[\da-f]{8}-[\da-f-]{27}$/i.test(cursor.id) || !['maib','paddle'].includes(cursor.provider)) throw new Error('Invalid cursor');
  return cursor;
}
export function applyPaymentCursor(query, cursor) {
  if (!cursor) return query;
  return query.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id}),and(created_at.eq.${cursor.at},id.eq.${cursor.id},provider.lt.${cursor.provider})`);
}
