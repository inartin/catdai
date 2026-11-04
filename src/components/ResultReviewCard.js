"use client";

import { useEffect, useId, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import { getDeviceId } from "@/lib/visitor-browser";

export default function ResultReviewCard({ usageId }) {
  const { session } = useAuth();
  if (!usageId || !session?.user?.id) return null;
  return <ReviewCard key={`${session.user.id}:${usageId}`} usageId={usageId} session={session} />;
}

function ReviewCard({ usageId, session }) {
  const { t } = useTranslation();
  const id = useId();
  const storageKey = `catdai:result-review:${session.user.id}`;
  const [visible, setVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(storageKey)) return; } catch { /* Server state still prevents repeats. */ }
    const controller = new AbortController();
    fetch(`/api/result-reviews?usage_id=${encodeURIComponent(usageId)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal,
    }).then(async response => {
      if (response.ok) {
        const data = await response.json();
        if (!controller.signal.aborted) setVisible(data.eligible === true);
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [usageId, session.access_token, storageKey]);

  const remember = () => {
    try { localStorage.setItem(storageKey, "1"); } catch { /* The server also stores this response. */ }
  };
  const post = action => fetch("/api/result-reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-catdai-device-id": getDeviceId() || "" },
    body: JSON.stringify({ action, usage_id: usageId, rating, comment }),
    keepalive: action === "dismiss",
  });
  const dismiss = () => {
    remember();
    setVisible(false);
    if (!saved) post("dismiss").catch(() => {});
  };
  const submit = async event => {
    event.preventDefault();
    if (!rating || saving) return;
    setSaving(true);
    setError(false);
    try {
      const response = await post("submit");
      if (!response.ok) throw new Error();
      remember();
      setSaved(true);
    } catch { setError(true); }
    finally { setSaving(false); }
  };

  if (!visible) return null;
  return (
    <aside aria-labelledby={`${id}-title`} className="relative mx-auto mt-8 w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 text-left">
      <button type="button" onClick={dismiss} disabled={saving} aria-label={t("review.dismiss")}
        className="absolute right-2 top-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
      </button>
      <h2 id={`${id}-title`} className="pr-7 text-base font-semibold text-gray-900">{t(saved ? "review.thanks" : "review.title")}</h2>
      {saved ? <p role="status" className="mt-1 text-sm text-gray-500">{t("review.saved")}</p> : <>
        <p className="mt-1 pr-4 text-sm text-gray-500">{t("review.description")}</p>
        <form onSubmit={submit} className="mt-3">
          <fieldset disabled={saving}>
            <legend className="sr-only">{t("review.rating")}</legend>
            <div className="flex justify-center gap-1" onMouseLeave={() => setHovered(0)}>
              {[1, 2, 3, 4, 5].map(value => <label key={value} className="relative flex h-11 w-11 cursor-pointer items-center justify-center">
                <input type="radio" name={`${id}-rating`} value={value} checked={rating === value} onChange={() => setRating(value)}
                  onMouseEnter={() => setHovered(value)} aria-label={t("review.stars", { count: value })} className="peer absolute inset-0 cursor-pointer opacity-0" />
                <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"
                  className={`h-6 w-6 rounded-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-primary ${(hovered || rating) >= value ? "fill-amber-400 text-amber-400" : "fill-none text-gray-400"}`}>
                  <path d="m12 3 2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.34l-5.62 2.96 1.07-6.27L2.9 9.6l6.3-.9L12 3Z" />
                </svg>
              </label>)}
            </div>
            {rating > 0 && <div className="mt-3">
              <label htmlFor={`${id}-comment`} className="mb-1.5 block text-sm text-gray-600">{t("review.comment")}</label>
              <textarea id={`${id}-comment`} rows={2} maxLength={500} value={comment} onChange={event => setComment(event.target.value)}
                className="block w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
              {error && <p role="alert" className="mt-2 text-sm text-red-600">{t("review.error")}</p>}
              <button type="submit" disabled={saving} className="mt-3 cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50">
                {t(saving ? "review.sending" : "review.submit")}
              </button>
            </div>}
          </fieldset>
        </form>
      </>}
    </aside>
  );
}
