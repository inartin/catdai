"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { normalizeVisitorId } from "@/lib/visitor";

export function VisitorTags({ visitor, deviceId }) {
  const id = normalizeVisitorId(visitor?.device_id) || normalizeVisitorId(deviceId);
  const tags = [
    [id ? `#${id.replaceAll("-", "").slice(0, 8).toUpperCase()}` : null, "bg-slate-100 text-slate-600", "Browser ID"],
    [visitor?.device_type, "bg-blue-50 text-blue-700", "Device type"],
    [visitor?.os, "bg-emerald-50 text-emerald-700", "Operating system"],
    [visitor?.browser, "bg-violet-50 text-violet-700", "Browser"],
  ].filter(([value]) => value);
  if (!tags.length) return null;
  return <span className="admin-visitor-tags mt-1 flex flex-wrap gap-1 font-normal">
    {tags.map(([value, color, label]) => <span key={label} title={label === "Browser ID" ? `Browser ID: ${id}` : label}
      className={`inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] leading-4 ${color}`}>{value}</span>)}
  </span>;
}

function VisitorHistory({ id, onClose }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dialog = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/visitors/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load visitor history");
        setResult(await response.json());
      }).catch((error) => { if (error.name !== "AbortError") setError(true); });
    return () => controller.abort();
  }, [id, attempt]);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);
  return createPortal(<dialog ref={dialog} aria-label="Browser history" onCancel={onClose} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => {
    event.stopPropagation();
    if (event.target === dialog.current) onClose();
  }} className="admin-dark fixed inset-0 m-auto max-h-[80vh] w-[min(48rem,95vw)] overflow-auto rounded-xl border border-gray-200 bg-white p-5 text-gray-900 shadow-xl backdrop:bg-black/50">
    <div className="flex items-start justify-between gap-3">
      <div><h2 className="font-semibold">Browser history · {id.replaceAll("-", "").slice(0, 8).toUpperCase()}</h2>
        <p className="mt-1 text-xs text-gray-500">Latest 100 recorded actions across visits. A browser may be shared by several people.</p></div>
      <button type="button" autoFocus onClick={onClose} aria-label="Close browser history" className="cursor-pointer rounded px-2 py-1 text-gray-500 hover:bg-gray-100">×</button>
    </div>
    {error ? <p className="mt-5 text-sm text-red-600">History unavailable. <button className="cursor-pointer underline" onClick={() => { setError(false); setAttempt((value) => value + 1); }}>Retry</button></p>
      : !result ? <p className="mt-5 text-sm text-gray-500">Loading history…</p>
        : !result.events.length ? <p className="mt-5 text-sm text-gray-500">No recorded actions for this browser.</p>
          : <ul className="mt-4 divide-y divide-gray-100">{result.events.map((event) => <li key={`${event.source}:${event.id}`} className="py-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{event.label}</span><time className="text-xs text-gray-500">{new Date(event.created_at).toLocaleString("ro-RO")}</time></div>
            <p className="mt-1 break-words text-xs text-gray-500">{event.summary || "-"}</p>
            <p className="mt-1 break-all text-xs text-gray-600">{event.user_name || event.user_id || "Anonymous"}</p>
            <VisitorTags visitor={event.visitor} deviceId={id} />
          </li>)}</ul>}
  </dialog>, document.body);
}

export default function AdminUserCell({ row = {}, name, children }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const id = normalizeVisitorId(row.visitor?.device_id) || normalizeVisitorId(row.device_id || row.deviceId);
  const userId = row.user_id || row.userId;
  const label = name || row.user_name || row.userName || userId || "Anonymous";
  return <div className="min-w-28">
    {children || (id ? <button type="button" onClick={(event) => { event.stopPropagation(); setHistoryOpen(true); }}
      onKeyDown={(event) => event.stopPropagation()} title="View this browser's recorded activity"
      className="cursor-pointer text-left hover:underline">{label}</button> : <span>{label}</span>)}
    <VisitorTags visitor={row.visitor} deviceId={id} />
    {historyOpen && <VisitorHistory id={id} onClose={() => setHistoryOpen(false)} />}
  </div>;
}
