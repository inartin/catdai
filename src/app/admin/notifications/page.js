"use client";

import { useCallback, useEffect, useState } from "react";

const emptyForm = {
  title: "",
  message: "",
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

export default function AdminNotificationsPage() {
  const [form, setForm] = useState(emptyForm);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [broadcasts, setBroadcasts] = useState([]);
  const [broadcastsLoading, setBroadcastsLoading] = useState(true);
  const [broadcastsError, setBroadcastsError] = useState("");
  const [editingBroadcast, setEditingBroadcast] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [freeCreditsAmount, setFreeCreditsAmount] = useState("2");
  const [freeCreditsSending, setFreeCreditsSending] = useState(false);
  const [freeCreditsError, setFreeCreditsError] = useState("");
  const [freeCreditsSuccess, setFreeCreditsSuccess] = useState("");

  const loadBroadcasts = useCallback(async () => {
    setBroadcastsLoading(true);
    setBroadcastsError("");

    try {
      const response = await fetch("/api/admin/notifications");
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setBroadcasts(Array.isArray(data.broadcasts) ? data.broadcasts : []);
    } catch (err) {
      setBroadcastsError(err.message || "Failed to load sent messages.");
    } finally {
      setBroadcastsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBroadcasts();
  }, [loadBroadcasts]);

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
    setSuccess("");
  };

  const sendBroadcast = async (event) => {
    event.preventDefault();

    if (!window.confirm("Send this notification to all users?")) return;

    setSending(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience: "all",
          title: form.title,
          message: form.message,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setSuccess(`Notification sent to ${data.createdCount || 0} users.`);
      setForm(emptyForm);
      await loadBroadcasts();
    } catch (err) {
      setError(err.message || "Failed to send notification.");
    } finally {
      setSending(false);
    }
  };

  const startEdit = (broadcast) => {
    setEditingBroadcast(broadcast);
    setEditForm({
      title: broadcast.title || "",
      message: broadcast.body || "",
    });
    setBroadcastsError("");
  };

  const cancelEdit = () => {
    if (savingEdit) return;
    setEditingBroadcast(null);
    setEditForm(emptyForm);
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!editingBroadcast) return;
    if (!window.confirm("Update this message for every recipient?")) return;

    setSavingEdit(true);
    setBroadcastsError("");

    try {
      const response = await fetch("/api/admin/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          createdAt: editingBroadcast.created_at,
          oldTitle: editingBroadcast.title,
          oldMessage: editingBroadcast.body,
          title: editForm.title,
          message: editForm.message,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setEditingBroadcast(null);
      setEditForm(emptyForm);
      await loadBroadcasts();
      setSuccess(`Updated ${data.updatedCount || 0} notifications.`);
    } catch (err) {
      setBroadcastsError(err.message || "Failed to update message.");
    } finally {
      setSavingEdit(false);
    }
  };

  const sendFreeCredits = async () => {
    const amount = Number(freeCreditsAmount);
    if (!Number.isInteger(amount) || amount < 0) {
      setFreeCreditsError("Enter a valid credit amount.");
      setFreeCreditsSuccess("");
      return;
    }

    if (!window.confirm(`Set ${amount} credits for all users without changing their package status?`)) return;

    setFreeCreditsSending(true);
    setFreeCreditsError("");
    setFreeCreditsSuccess("");

    try {
      const response = await fetch("/api/admin/users/free-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setFreeCreditsSuccess(`Credits set for ${Number(data.usersUpdated || 0).toLocaleString("ro-RO")} users.`);
    } catch (err) {
      setFreeCreditsError(err.message || "Failed to set free credits.");
    } finally {
      setFreeCreditsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <p className="mt-1 text-sm text-gray-500">
          Send an in-app notification message to all registered users.
        </p>
      </div>

      <form onSubmit={sendBroadcast} className="space-y-5 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Broadcast message</h2>
          <p className="mt-1 text-sm text-gray-500">
            Users will see it in the navbar notification sidebar.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700">
            {success}
          </div>
        )}

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Title</span>
          <input
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary"
            maxLength={120}
            required
          />
          <span className="mt-1 block text-xs text-gray-400">{form.title.length}/120</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Message</span>
          <textarea
            value={form.message}
            onChange={(event) => updateField("message", event.target.value)}
            className="mt-1 min-h-40 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm leading-6 text-gray-900 outline-none transition-colors focus:border-primary"
            maxLength={1000}
            required
          />
          <span className="mt-1 block text-xs text-gray-400">{form.message.length}/1000</span>
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sending || !form.title.trim() || !form.message.trim()}
            className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {sending ? "Sending..." : "Send to all users"}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Global messages sent</h2>
            <p className="mt-1 text-sm text-gray-500">
              Edit a sent message to update every matching user notification row.
            </p>
          </div>
          <button
            type="button"
            onClick={loadBroadcasts}
            disabled={broadcastsLoading}
            className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:text-gray-400"
          >
            {broadcastsLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {broadcastsError ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-medium text-red-500">Failed to load messages</p>
            <p className="mt-1 text-xs text-gray-400">{broadcastsError}</p>
          </div>
        ) : broadcastsLoading && broadcasts.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400">Loading messages...</div>
        ) : broadcasts.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400">No global messages sent yet</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {broadcasts.map((broadcast) => {
              const isEditing = editingBroadcast?.id === broadcast.id;

              return (
                <article key={broadcast.id} className="px-5 py-4">
                  {isEditing ? (
                    <form onSubmit={saveEdit} className="space-y-3">
                      <label className="block">
                        <span className="text-sm font-medium text-gray-700">Title</span>
                        <input
                          value={editForm.title}
                          onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary"
                          maxLength={120}
                          required
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-gray-700">Message</span>
                        <textarea
                          value={editForm.message}
                          onChange={(event) => setEditForm((current) => ({ ...current, message: event.target.value }))}
                          className="mt-1 min-h-28 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm leading-6 text-gray-900 outline-none transition-colors focus:border-primary"
                          maxLength={1000}
                          required
                        />
                      </label>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={savingEdit}
                          className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 disabled:cursor-not-allowed disabled:text-gray-400"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingEdit || !editForm.title.trim() || !editForm.message.trim()}
                          className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                          {savingEdit ? "Saving..." : "Save changes"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                          <span>{fmtDateTime(broadcast.created_at)}</span>
                          <span>{broadcast.recipientCount} recipients</span>
                        </div>
                        <h3 className="text-base font-semibold text-gray-900">{broadcast.title}</h3>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-gray-600">
                          {broadcast.body}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(broadcast)}
                        className="cursor-pointer self-start rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Free credits</h2>
          <p className="mt-1 text-sm text-gray-500">
            Set credits for all registered users without changing package status.
          </p>
        </div>

        {freeCreditsError && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
            {freeCreditsError}
          </div>
        )}

        {freeCreditsSuccess && (
          <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700">
            {freeCreditsSuccess}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-sm font-medium text-gray-700">
            Amount
            <input
              type="number"
              min="0"
              max="1000"
              step="1"
              value={freeCreditsAmount}
              onChange={(event) => {
                setFreeCreditsAmount(event.target.value);
                setFreeCreditsError("");
                setFreeCreditsSuccess("");
              }}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary sm:w-32"
            />
          </label>
          <button
            type="button"
            onClick={sendFreeCredits}
            disabled={freeCreditsSending}
            className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {freeCreditsSending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
