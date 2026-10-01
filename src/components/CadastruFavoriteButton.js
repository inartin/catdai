"use client";

import { useEffect, useState } from "react";
import BookmarkIcon from "@/components/icons/BookmarkIcon";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";

export default function CadastruFavoriteButton({ urlPath, label, onAuthRequired }) {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [favorited, setFavorited] = useState(false);
  const [pending, setPending] = useState(Boolean(session?.access_token));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!session?.access_token) return;
    let active = true;
    fetch(`/api/favorites?url_path=${encodeURIComponent(urlPath)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((response) => response.json())
      .then((data) => { if (active) setFavorited(!!data.favorited); })
      .catch(() => {})
      .finally(() => { if (active) setPending(false); });
    return () => { active = false; };
  }, [session?.access_token, urlPath]);

  async function toggleFavorite() {
    if (!session?.access_token) {
      onAuthRequired();
      return;
    }
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/favorites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ url_path: urlPath, label }),
      });
      if (!response.ok) throw new Error("Favorite request failed");
      const data = await response.json();
      setFavorited(!!data.favorited);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  const actionLabel = favorited ? t("result.removeFavorite") : t("result.addFavorite");
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggleFavorite}
        disabled={pending}
        aria-label={actionLabel}
        aria-pressed={favorited}
        title={actionLabel}
        className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-emerald-200 bg-white shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 ${favorited ? "text-primary" : "text-gray-500 hover:text-primary"}`}
      >
        <BookmarkIcon size={22} filled={favorited} />
      </button>
      {error && <p role="alert" className="text-xs text-red-700">{t("cadastru.favoriteError")}</p>}
    </div>
  );
}
