"use client";

import { useRef, useState } from "react";

export default function AdminUserCredits({ user, disabled = false, onUpdate, onBusyChange }) {
  const [amount, setAmount] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const pending = useRef(false);
  const paid = user.sharedCredits;
  const free = user.freeMonthlyCredit;
  const count = Number(amount);
  const valid = Number.isInteger(count) && count >= 1 && count <= 1000;
  const busy = disabled || saving;

  async function adjust(action) {
    if (pending.current || busy || !valid) return;
    pending.current = true;
    setSaving(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/credits`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, amount: count }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nu s-au putut modifica creditele.");
      onUpdate(user.id, data.sharedCredits);
    } catch (err) {
      setError(err.message || "Nu s-au putut modifica creditele.");
    } finally {
      pending.current = false;
      setSaving(false);
      onBusyChange?.(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <h3 className="text-base font-semibold text-gray-900">Credite universale</h3>
      <p className="mt-1 text-sm text-gray-500">Un credit poate fi folosit pentru orice funcție.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Credite disponibile</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{paid?.remainingUses ?? "—"}</p>
          <p className="mt-1 text-xs text-gray-500">{paid?.totalUsed ?? "—"} utilizate · {paid?.totalGranted ?? "—"} acordate</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Credit gratuit lunar</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{free?.remainingUses ?? "—"} / 1</p>
          <p className="mt-1 text-xs text-gray-500">Comun tuturor funcțiilor</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-gray-600">
          Număr de credite
          <input type="number" min="1" max="1000" step="1" value={amount}
            onChange={event => setAmount(event.target.value)} disabled={busy}
            className="mt-1 block w-28 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
        </label>
        <button type="button" onClick={() => adjust("add")} disabled={busy || !valid || !paid}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-40">Adaugă</button>
        <button type="button" onClick={() => adjust("remove")} disabled={busy || !valid || !paid || count > paid.remainingUses}
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">Retrage</button>
      </div>
      <p className="mt-2 text-xs text-gray-500">Adăugarea și retragerea modifică doar creditele disponibile, fără creditul gratuit lunar.</p>
      {saving && <p role="status" className="mt-2 text-xs text-gray-500">Se salvează...</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
