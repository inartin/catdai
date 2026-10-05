// PM2 owns this worker. No HTTP endpoint or additional credential is needed.
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
const { supabaseAdmin: db } = await import('../src/lib/supabase-admin.js');
const { checked, reconcileOrder } = await import('../src/lib/maib/service.mjs');
const { environment } = await import('../src/lib/maib/client.mjs');
let stopped = false;
let wake;
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => { stopped = true; wake?.(); });
while (!stopped) {
  try {
    for (let index = 0; index < 10; index++) {
      const orders = await checked(db.rpc('claim_maib_orders', { p_environment: environment(), p_limit: 1 }));
      const order = orders?.[0];
      if (!order) break;
      if (stopped) break;
      let lastError = null;
      let delay = 60_000;
      try {
        const result = await reconcileOrder(order);
        const pendingRefund = await checked(db.from('maib_refund_attempts').select('id').eq('order_id', order.id).in('status', ['submitting','unknown','Created','Requested','Manual']).limit(1));
        if (['paid','partially_refunded'].includes(result.status) && !pendingRefund?.length) delay = 900_000;
        if (result.status === 'creation_unknown' && Date.now() - Date.parse(result.created_at) > 86400000) delay = 900_000;
      } catch { lastError = 'MAIB reconciliation failed; retry scheduled.'; }
      await checked(db.from('maib_payment_orders').update({ last_error: lastError, next_check_at: new Date(Date.now() + delay).toISOString(), lease_until: null, lease_token: null }).eq('id', order.id).eq('lease_token', order.lease_token));
    }
  } catch (error) { console.error('[maib-worker]', error.code || error.name || 'reconciliation_failed'); }
  if (process.argv.includes('--once')) break;
  if (!stopped) await new Promise(resolve => { const timer = setTimeout(resolve, 60_000); wake = () => { clearTimeout(timer); resolve(); }; });
}
