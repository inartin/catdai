"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import HistoryIcon from "@/components/icons/HistoryIcon";
import { getCadastruFavoritePath } from "@/lib/cadastru-favorites";
import { formatLocalizedDate } from "@/lib/localized-date";

function getHistoryPath(row, lang) {
  if (row.resultType === "no_data") return null;
  if (row.cadastralNumber) {
    const params = new URLSearchParams({
      cadastral_number: row.cadastralNumber,
      ...(row.searchType === "address" ? { source: "address", ...(row.district ? { district: row.district } : {}) } : {}),
    });
    return `/${lang}/cadastru/rezultat?${params}`;
  }
  const path = row.searchType === "address" && getCadastruFavoritePath({ lang, savedAddress: row.searchRequest });
  return path ? `${path}&history=1` : null;
}

function HistoryList({ accessToken }) {
  const { t, lang } = useTranslation();
  const [rows, setRows] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [request, setRequest] = useState({ cursor: null, deferred: true });
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  function loadHistory(cursor = null) {
    setIsLoading(true);
    setHasError(false);
    setRequest({ cursor });
  }

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ type: "cadastru", limit: "5" });
    if (request.cursor) params.set("cursor", request.cursor);
    let idleId;
    let timerId;

    function fetchHistory() {
      fetch(`/api/profile/history?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("History unavailable");
          const data = await response.json();
          if (controller.signal.aborted) return;
          setRows((previous) => request.cursor
            ? [...new Map([...previous, ...data.history].map((row) => [row.id, row])).values()]
            : data.history);
          setNextCursor(data.nextCursor || null);
        })
        .catch(() => {
          if (!controller.signal.aborted) setHasError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }

    function scheduleHistory() {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(fetchHistory, { timeout: 1000 });
      } else {
        timerId = window.setTimeout(fetchHistory, 0);
      }
    }

    if (!request.deferred) {
      fetchHistory();
    } else if (document.readyState === "complete") {
      scheduleHistory();
    } else {
      window.addEventListener("load", scheduleHistory, { once: true });
    }

    return () => {
      window.removeEventListener("load", scheduleHistory);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      window.clearTimeout(timerId);
      controller.abort();
    };
  }, [accessToken, request]);

  return (
    <section className="mt-8 border-t border-gray-200" aria-labelledby="cadastru-history-title">
      <div className="flex items-center gap-2.5 py-5 text-gray-500">
        <HistoryIcon size={17} className="shrink-0 text-gray-400" />
        <h2 id="cadastru-history-title" className="text-sm font-medium">{t("cadastru.historyTitle")}</h2>
      </div>
      <div className="pb-2" aria-busy={isLoading}>
        {rows.length > 0 && (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {rows.map((row) => {
              const href = getHistoryPath(row, lang);
              const address = row.searchRequest;
              const title = row.searchType === "address"
                ? row.searchAddress || (address && [address.city, [address.road_type, address.street, address.house_number].filter(Boolean).join(" "), address.apartment_number && `${t("cadastru.apartmentNumber")} ${address.apartment_number}`].filter(Boolean).join(", ")) || row.cadastralNumber
                : row.cadastralNumber;
              const result = row.resultType === "no_data"
                ? t("profile.historyCadastruResultType.no_data")
                : row.resultValue || (row.searchType === "address" ? row.cadastralNumber : row.searchAddress);
              const content = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-gray-700">{title || t(`profile.historyCadastruSearchType.${row.searchType}`)}</p>
                    {result && result !== title && <p className="mt-1 break-words text-xs leading-5 text-gray-500">{result}</p>}
                    <time dateTime={row.createdAt} className="mt-1 block text-xs text-gray-500">
                      {formatLocalizedDate(row.createdAt, lang, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </time>
                  </div>
                  {href && <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover/row:text-gray-500" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>}
                </>
              );
              return (
                <li key={row.id}>
                  {href ? (
                    <Link href={href} prefetch={false} className="group/row flex items-center gap-4 px-4 py-3 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gray-400">{content}</Link>
                  ) : <div className="flex items-center gap-4 px-4 py-3">{content}</div>}
                </li>
              );
            })}
          </ul>
        )}
        <div role="status" className="text-sm text-gray-500">
          {isLoading && <p className="py-4 text-center text-xs">{t("profile.historyLoadingMore")}</p>}
          {!isLoading && !hasError && rows.length === 0 && <p className="py-4 text-xs">{t("cadastru.historyEmpty")}</p>}
          {hasError && <p className="py-3 text-xs">{t("cadastru.historyError")}</p>}
        </div>
        {!isLoading && (hasError || nextCursor) && (
          <button type="button" onClick={() => loadHistory(hasError ? request.cursor : nextCursor)} className="mt-3 rounded-lg px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-gray-400">
            {hasError ? t("cadastru.retrySearch") : t("profile.historyLoadMore")}
          </button>
        )}
      </div>
    </section>
  );
}

export default function CadastruHistory() {
  const { user, session, isAuthenticated } = useAuth();
  if (!isAuthenticated || !session?.access_token) return null;
  return <HistoryList key={user.id} accessToken={session.access_token} />;
}
