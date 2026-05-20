"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import TelegramIcon from "@/components/icons/TelegramIcon";
import { TELEGRAM_ALERTS_BOT_HANDLE, TELEGRAM_ALERTS_BOT_URL } from "../../db/constants";

export default function TelegramConnectionCard({ className = "", onConnectionChange }) {
  const { t, lang } = useTranslation();
  const { session } = useAuth();
  const [telegramConnection, setTelegramConnection] = useState(null);
  const [isTelegramLinking, setIsTelegramLinking] = useState(false);
  const [isTelegramLinkPending, setIsTelegramLinkPending] = useState(false);
  const [telegramLinkError, setTelegramLinkError] = useState("");

  const fetchTelegramConnection = useCallback(async () => {
    if (!session?.access_token) return null;

    try {
      const res = await fetch("/api/telegram-link", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) return null;

      const data = await res.json().catch(() => ({}));
      const connection = data.connection || null;

      setTelegramConnection(connection);
      if (connection) {
        setIsTelegramLinkPending(false);
        setTelegramLinkError("");
        if (typeof onConnectionChange === "function") {
          onConnectionChange(connection);
        }
      }

      return connection;
    } catch {
      return null;
    }
  }, [onConnectionChange, session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) return;
    fetchTelegramConnection();
  }, [session?.access_token, fetchTelegramConnection]);

  useEffect(() => {
    if (!isTelegramLinkPending || !session?.access_token) return;

    let cancelled = false;

    const refreshTelegramStatus = async () => {
      if (cancelled) return;
      await fetchTelegramConnection();
    };

    const intervalId = window.setInterval(refreshTelegramStatus, 2500);
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        refreshTelegramStatus();
      }
    };

    refreshTelegramStatus();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [isTelegramLinkPending, session?.access_token, fetchTelegramConnection]);

  const handleConnectTelegram = async () => {
    if (!session?.access_token || isTelegramLinking) return;

    setIsTelegramLinking(true);
    setTelegramLinkError("");

    try {
      const res = await fetch("/api/telegram-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ lang }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to create Telegram link");
      }

      const url = data.url || TELEGRAM_ALERTS_BOT_URL;
      if (url && typeof window !== "undefined") {
        window.open(url, "_blank", "noopener,noreferrer");
        setIsTelegramLinkPending(true);
      }
    } catch (error) {
      setTelegramLinkError(error?.message || "Failed to create Telegram link");
    } finally {
      setIsTelegramLinking(false);
    }
  };

  const handleDisconnectTelegram = async () => {
    if (!session?.access_token) return;

    setIsTelegramLinking(true);
    setTelegramLinkError("");

    try {
      const res = await fetch("/api/telegram-link/disconnect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to disconnect Telegram");
      }

      setTelegramConnection(null);
      setIsTelegramLinkPending(false);
      if (typeof onConnectionChange === "function") {
        onConnectionChange(null);
      }
    } catch (error) {
      setTelegramLinkError(error?.message || "Failed to disconnect Telegram");
    } finally {
      setIsTelegramLinking(false);
    }
  };

  return (
    <div className={`rounded-2xl border border-gray-100 bg-gray-50 p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{t("profile.telegramConnect")}</p>
          <p className="mt-1 truncate text-xs text-gray-500">
            {telegramConnection?.telegram_username
              ? `@${telegramConnection.telegram_username}`
              : `t.me/${TELEGRAM_ALERTS_BOT_HANDLE}`}
          </p>
        </div>
        <span
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            telegramConnection
              ? "bg-emerald-50 text-emerald-600"
              : isTelegramLinkPending
                ? "bg-amber-50 text-amber-600"
                : "bg-gray-100 text-gray-500"
          }`}
        >
          {telegramConnection
            ? t("profile.telegramConnected")
            : isTelegramLinkPending
              ? t("profile.telegramPending")
              : t("profile.telegramNotConnected")}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleConnectTelegram}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
        >
          <TelegramIcon size={16} />
          <span>
            {isTelegramLinking
              ? t("profile.telegramLinking")
              : isTelegramLinkPending
                ? t("profile.telegramPending")
                : telegramConnection
                  ? t("profile.telegramReconnect")
                  : t("profile.telegramConnect")}
          </span>
        </button>
        {telegramConnection && (
          <button
            type="button"
            onClick={handleDisconnectTelegram}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
          >
            <span>{t("profile.telegramDisconnect")}</span>
          </button>
        )}
      </div>
      {telegramLinkError && (
        <p className="mt-2 text-xs text-red-600">{telegramLinkError}</p>
      )}
    </div>
  );
}
