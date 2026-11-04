"use client";

import AdminUserCell from "@/components/admin/AdminUserCell";

import { useCallback, useEffect, useState } from "react";

const REVIEW_FEATURES = {
  sale_estimate: "Sale evaluation", rent_estimate: "Rent evaluation", listing_analysis: "Listing analysis",
  cadastru_lookup: "Cadastru", yield_calculator: "Yield calculator", pdf_report: "PDF report",
};

function fmtDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtImageSize(value) {
  if (!value) return "-";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.ceil(value / 1024)} KB`;
}

function imageSrc(row) {
  if (!row.image_data || !row.image_type) return null;
  return `data:${row.image_type};base64,${row.image_data}`;
}

export default function AdminFeedbackPage() {
  const [items, setItems] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openImage, setOpenImage] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/feedback");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setItems(Array.isArray(data.feedback) ? data.feedback : []);
      setReviews(Array.isArray(data.reviews) ? data.reviews : []);
    } catch (err) {
      setError(err.message || "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  const deleteFeedback = async (row) => {
    if (!window.confirm("Delete this feedback?")) return;

    setDeletingId(row.id);
    setError(null);

    try {
      const response = await fetch(`/api/admin/feedback?id=${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setItems((current) => current.filter((item) => item.id !== row.id));
    } catch (err) {
      setError(err.message || "Failed to delete feedback");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Feedback</h1>
          <p className="mt-1 text-sm text-gray-500">Private result reviews, beta feedback and bug reports.</p>
        </div>
        <button
          type="button"
          onClick={loadFeedback}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg text-gray-700 hover:border-primary/40 hover:text-primary disabled:text-gray-400 disabled:hover:border-gray-200 transition-colors"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <section aria-labelledby="result-reviews-title" className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 id="result-reviews-title" className="font-semibold text-gray-900">Result reviews</h2>
          <p className="mt-1 text-xs text-gray-500">Latest 100 ratings from unlocked paid results, including guest buyers. Visible only to admins.</p>
        </div>
        {error ? <p className="px-5 py-8 text-center text-sm text-red-500">Failed to load reviews</p>
          : loading && !reviews.length ? <p className="px-5 py-8 text-center text-sm text-gray-400">Loading reviews...</p>
            : !reviews.length ? <p className="px-5 py-8 text-center text-sm text-gray-400">No reviews yet</p>
              : <div className="divide-y divide-gray-100">{reviews.map(row => <article key={row.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span aria-label={`${row.rating} out of 5 stars`} className="text-xl tracking-widest text-amber-500">{"★".repeat(row.rating)}<span className="text-gray-200">{"★".repeat(5 - row.rating)}</span></span>
                  <span className="text-xs font-medium text-gray-600">{REVIEW_FEATURES[row.feature_key] || row.feature_key}</span>
                  <span className="text-xs text-gray-400">{fmtDateTime(row.created_at)}</span>
                </div>
                {row.comment ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-gray-900">{row.comment}</p>
                  : <p className="mt-3 text-xs text-gray-400">No comment</p>}
                <div className="mt-3 text-xs text-gray-500"><AdminUserCell row={row} name={row.is_anonymous ? "Anonymous" : row.user_id} /></div>
              </article>)}</div>}
      </section>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <h2 className="border-b border-gray-100 px-5 py-4 font-semibold text-gray-900">Feedback and bug reports</h2>
        {error ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-red-500 font-medium">Failed to load feedback</p>
            <p className="mt-1 text-xs text-gray-400">{error}</p>
          </div>
        ) : loading && items.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400">Loading feedback...</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400">No feedback yet</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((row) => {
              const src = imageSrc(row);
              return (
                <article key={row.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_220px]">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span>{fmtDateTime(row.created_at)}</span>
                      <AdminUserCell row={row} name={row.user_id || undefined} />
                      {row.contact_email && <span className="break-all">{row.contact_email}</span>}
                      {row.contact_phone && <span className="break-all">{row.contact_phone}</span>}
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
                        {row.status || "new"}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-900">
                      {row.message}
                    </p>
                    <button
                      type="button"
                      onClick={() => deleteFeedback(row)}
                      disabled={deletingId === row.id}
                      className="mt-3 cursor-pointer rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent"
                    >
                      {deletingId === row.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>

                  <div className="text-sm text-gray-500">
                    {src ? (
                      <button
                        type="button"
                        onClick={() => setOpenImage({ src, name: row.image_name, size: row.image_size })}
                        className="block w-full text-left group"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt={row.image_name || "Feedback upload"}
                          className="h-32 w-full rounded-lg border border-gray-200 object-cover group-hover:border-primary/40"
                        />
                        <span className="mt-2 block truncate text-xs">
                          {row.image_name || row.image_type} · {fmtImageSize(row.image_size)}
                        </span>
                      </button>
                    ) : (
                      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
                        No image
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {openImage && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4">
          <button
            type="button"
            className="absolute inset-0 cursor-zoom-out"
            aria-label="Close image preview"
            onClick={() => setOpenImage(null)}
          />
          <div className="relative max-h-full max-w-5xl">
            <button
              type="button"
              onClick={() => setOpenImage(null)}
              className="absolute right-3 top-3 z-10 rounded-lg bg-black/60 px-3 py-1.5 text-sm font-medium text-white hover:bg-black/80"
            >
              Close
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={openImage.src}
              alt={openImage.name || "Feedback upload"}
              className="max-h-[85vh] max-w-full rounded-lg bg-white object-contain"
            />
            <div className="mt-2 text-sm text-white">
              {openImage.name || "Uploaded image"} · {fmtImageSize(openImage.size)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
