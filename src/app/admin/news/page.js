"use client";

import { useCallback, useEffect, useState } from "react";
import RichTextEditor from "@/components/admin/RichTextEditor";

const emptyForm = {
  title: "",
  description: "",
  cover_image_url: "",
};

function fmtDateTime(value) {
  if (!value) return "\u2014";
  return new Date(value).toLocaleString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminNewsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadNews = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/news");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setItems(Array.isArray(data.news) ? data.news : []);
    } catch (err) {
      setError(err.message || "Failed to load news");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  const openCreate = () => {
    setEditingItem(null);
    setForm(emptyForm);
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      title: item.title || "",
      description: item.description || "",
      cover_image_url: item.cover_image_url || "",
    });
    setFormError("");
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditingItem(null);
    setForm(emptyForm);
    setFormError("");
  };

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveNews = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      const response = await fetch(
        editingItem ? `/api/admin/news/${editingItem.id}` : "/api/admin/news",
        {
          method: editingItem ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      await loadNews();
      setFormOpen(false);
      setEditingItem(null);
      setForm(emptyForm);
    } catch (err) {
      setFormError(err.message || "Failed to save news");
    } finally {
      setSaving(false);
    }
  };

  const removeNews = async (item) => {
    if (!window.confirm(`Remove "${item.title}"?`)) return;

    setDeletingId(item.id);
    setError(null);

    try {
      const response = await fetch(`/api/admin/news/${item.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setItems((current) => current.filter((row) => row.id !== item.id));
    } catch (err) {
      setError(err.message || "Failed to remove news");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">News</h1>
          <p className="mt-1 text-sm text-gray-500">Available news items for the Noutăți page.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          Create news
        </button>
      </div>

      {formOpen && (
        <form onSubmit={saveNews} className="space-y-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {editingItem ? "Edit news" : "Create news"}
              </h2>
              <p className="mt-1 text-sm text-gray-500">Title, rich description, and cover image link.</p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 disabled:text-gray-400"
            >
              Cancel
            </button>
          </div>

          {formError && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
              {formError}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Title</span>
              <input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary"
                maxLength={180}
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Cover image link</span>
              <input
                value={form.cover_image_url}
                onChange={(event) => updateField("cover_image_url", event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary"
                maxLength={1000}
                placeholder="https://..."
              />
            </label>
          </div>

          <div className="block">
            <span className="text-sm font-medium text-gray-700">Description</span>
            <div className="mt-1">
              <RichTextEditor
                value={form.description}
                onChange={(value) => updateField("description", value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:bg-gray-300"
            >
              {saving ? "Saving..." : editingItem ? "Save changes" : "Create news"}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {error ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-medium text-red-500">Failed to load news</p>
            <p className="mt-1 text-xs text-gray-400">{error}</p>
          </div>
        ) : loading && items.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400">Loading news...</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400">No news yet</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <article key={item.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_180px]">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span>{fmtDateTime(item.created_at)}</span>
                  </div>
                  <h2 className="text-base font-semibold text-gray-900">{item.title}</h2>
                  {item.slug && (
                    <a
                      href={`/noutati/${item.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block break-all text-xs font-medium text-primary hover:underline"
                    >
                      /noutati/{item.slug}
                    </a>
                  )}
                  <div
                    className="news-content mt-2 line-clamp-3 break-words text-sm leading-6 text-gray-600"
                    dangerouslySetInnerHTML={{ __html: item.description }}
                  />
                  <div className="mt-3 text-sm">
                    {item.cover_image_url ? (
                      <a
                        href={item.cover_image_url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-primary hover:underline"
                      >
                        {item.cover_image_url}
                      </a>
                    ) : (
                      <span className="text-gray-400">No cover image link</span>
                    )}
                  </div>
                </div>

                <div className="flex items-start justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => removeNews(item)}
                    disabled={deletingId === item.id}
                    className="rounded-lg border border-red-100 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:border-red-200 hover:bg-red-50 disabled:text-gray-400"
                  >
                    {deletingId === item.id ? "Removing..." : "Remove"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
