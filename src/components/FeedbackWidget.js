"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import CloseIcon from "@/components/icons/CloseIcon";
import FeedbackIcon from "@/components/icons/FeedbackIcon";

const MAX_MESSAGE_LENGTH = 500;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function sanitizeMessage(value) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, MAX_MESSAGE_LENGTH);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function FeedbackWidget() {
  const { session, isAuthenticated, loading } = useAuth();
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [image, setImage] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  if (loading || !isAuthenticated) return null;

  const remaining = MAX_MESSAGE_LENGTH - message.length;
  const canSubmit = status !== "submitting" && message.trim().length > 0;

  const resetForm = () => {
    setMessage("");
    setImage(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleMessageChange = (event) => {
    setMessage(sanitizeMessage(event.target.value));
    setStatus("idle");
    setError("");
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    setStatus("idle");
    setError("");

    if (!file) {
      setImage(null);
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setImage(null);
      event.target.value = "";
      setError(t("feedback.imageTypeError"));
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setImage(null);
      event.target.value = "";
      setError(t("feedback.imageSizeError"));
      return;
    }

    setImage(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const cleanMessage = sanitizeMessage(message).trim();

    if (!cleanMessage) {
      setError(t("feedback.messageRequired"));
      return;
    }

    setStatus("submitting");
    setError("");

    try {
      const payload = { message: cleanMessage };
      if (image) {
        payload.image = {
          name: image.name,
          type: image.type,
          size: image.size,
          data: await readFileAsDataUrl(image),
        };
      }

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || t("feedback.submitError"));
      }

      resetForm();
      setStatus("sent");
    } catch (submitError) {
      setStatus("idle");
      setError(submitError.message || t("feedback.submitError"));
    }
  };

  return (
    <div className="fixed bottom-24 right-5 z-[55] flex flex-col items-end gap-3 md:bottom-5">
      {open && (
        <section className="w-[min(calc(100vw-2rem),360px)] rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-950">{t("feedback.title")}</h2>
              <p className="mt-1 text-sm leading-5 text-gray-600">{t("feedback.description")}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              aria-label={t("feedback.close")}
            >
              <CloseIcon size={18} />
            </button>
          </div>

          {status === "sent" ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800">
              {t("feedback.thankYou")}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block text-sm font-medium text-gray-800" htmlFor="catdai-feedback-message">
                {t("feedback.messageLabel")}
              </label>
              <textarea
                id="catdai-feedback-message"
                value={message}
                onChange={handleMessageChange}
                maxLength={MAX_MESSAGE_LENGTH}
                rows={5}
                className="block w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm leading-5 text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
                placeholder={t("feedback.messagePlaceholder")}
              />
              <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                <span>{t("feedback.characterCount", { count: remaining })}</span>
                {image && (
                  <button
                    type="button"
                    onClick={() => {
                      setImage(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="font-medium text-gray-700 hover:text-gray-950"
                  >
                    {t("feedback.removeImage")}
                  </button>
                )}
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-800">{t("feedback.imageLabel")}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleImageChange}
                  className="block w-full cursor-pointer rounded-lg border border-gray-200 text-sm text-gray-700 file:mr-3 file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                />
              </label>
              {image && (
                <p className="truncate text-xs text-gray-500">
                  {image.name} ({Math.ceil(image.size / 1024)} KB)
                </p>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {status === "submitting" ? t("feedback.submitting") : t("feedback.submit")}
              </button>
            </form>
          )}
        </section>
      )}

      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setStatus((value) => (value === "sent" ? "idle" : value));
          setError("");
        }}
        className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-950 text-white shadow-lg transition-colors hover:bg-gray-800"
        aria-label={t("feedback.open")}
        aria-expanded={open}
      >
        <FeedbackIcon size={22} />
      </button>
    </div>
  );
}
