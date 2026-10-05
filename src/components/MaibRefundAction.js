'use client';
import { useState } from 'react';
export default function MaibRefundAction({ order, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(order.refundStatus);
  const open = ['submitting','unknown','Created','Requested','Manual'].includes(status);
  async function act(refund) {
    let reason;
    if (refund) {
      reason = window.prompt('Motivul rambursării integrale (max. 500 caractere):');
      if (!reason?.trim() || reason.trim().length > 500) return;
      if (!window.confirm(`Rambursezi ${(order.amountMinor - (order.refundedMinor || 0)) / 100} ${order.currencyCode}? Creditele neutilizate ale acestei plăți vor fi retrase după confirmarea maib.`)) return;
    }
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/payments/maib/${order.id}/refund`, refund ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) } : { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Rambursarea nu a putut fi verificată.');
      const latest = data.refund?.status || data.refunds?.[0]?.status;
      setStatus(latest); setMessage(latest === 'unknown' || latest === 'Manual' ? 'Necesită verificare în maib. Nu retrimite rambursarea.' : (latest || data.order?.status));
      onUpdate?.();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <div className="mt-2 space-y-2 text-xs">
    {['paid','partially_refunded'].includes(order.status) && !open && status !== 'Accepted' && <button disabled={busy} onClick={() => act(true)} className="rounded border border-red-300 px-2 py-1 text-red-500 disabled:opacity-50">Rambursare integrală</button>}
    <button disabled={busy} onClick={() => act(false)} className="ml-2 rounded border px-2 py-1 disabled:opacity-50">Verifică maib</button>
    {(message || status) && <p role="status" className="max-w-64 whitespace-normal">{message || status}</p>}
  </div>;
}
