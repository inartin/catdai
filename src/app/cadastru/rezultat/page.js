"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackButton from "@/components/BackButton";
import CadastralDataCard from "@/components/CadastralDataCard";
import AuthRequiredModal from "@/components/AuthRequiredModal";
import FeaturePricingAction from "@/components/FeaturePricingAction";
import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";

const inFlightCadastralLookups = new Map();
const CADASTRU_DRAFT_STORAGE_KEY = "catdai:cadastru-search-draft:v1";

function triggerCanvasDownload(canvas, fileName) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function parsePx(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isVisibleColor(value) {
  return Boolean(value && value !== "transparent" && !/^rgba\([^,]+,[^,]+,[^,]+,\s*0\)$/i.test(value));
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
      return;
    }
    if (line) lines.push(line);
    line = word;
  });

  if (line) lines.push(line);
  return lines;
}

function drawElementText(ctx, element, rootRect, scale) {
  const directText = Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (!directText) return;

  const computed = window.getComputedStyle(element);
  if (computed.visibility === "hidden" || computed.display === "none" || !isVisibleColor(computed.color)) return;

  const rect = element.getBoundingClientRect();
  const fontSize = parsePx(computed.fontSize);
  const lineHeight = computed.lineHeight === "normal" ? fontSize * 1.2 : parsePx(computed.lineHeight);
  const paddingLeft = parsePx(computed.paddingLeft);
  const paddingRight = parsePx(computed.paddingRight);
  const isFlexTextContainer = computed.display.includes("flex") && element.children.length > 0;
  const lastChildRect = isFlexTextContainer
    ? element.children[element.children.length - 1].getBoundingClientRect()
    : null;
  const flexTextOffset = lastChildRect
    ? Math.max(0, lastChildRect.right - rect.left + parsePx(computed.columnGap || computed.gap))
    : 0;
  const textPaddingLeft = Math.max(paddingLeft, flexTextOffset);
  const paddingTop = isFlexTextContainer
    ? Math.max(0, (rect.height - lineHeight) / 2)
    : parsePx(computed.paddingTop);
  const text = computed.textTransform === "uppercase" ? directText.toUpperCase() : directText;
  const x = (rect.left - rootRect.left + textPaddingLeft) * scale;
  const y = (rect.top - rootRect.top + paddingTop) * scale;
  const maxWidth = Math.max(1, (rect.width - textPaddingLeft - paddingRight) * scale);

  ctx.font = computed.font;
  ctx.fillStyle = computed.color;
  ctx.textBaseline = "top";
  ctx.textAlign = computed.textAlign === "right" ? "right" : computed.textAlign === "center" ? "center" : "left";

  const lines = wrapCanvasText(ctx, text, maxWidth);
  const lineX = ctx.textAlign === "right" ? x + maxWidth : ctx.textAlign === "center" ? x + maxWidth / 2 : x;
  lines.forEach((line, index) => {
    ctx.fillText(line, lineX, y + index * lineHeight * scale, maxWidth);
  });
}

function drawElementToCanvas(ctx, element, rootRect, scale) {
  if (!(element instanceof Element)) return;
  const computed = window.getComputedStyle(element);
  if (computed.display === "none" || computed.visibility === "hidden") return;

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const x = (rect.left - rootRect.left) * scale;
  const y = (rect.top - rootRect.top) * scale;
  const width = rect.width * scale;
  const height = rect.height * scale;
  const radius = parsePx(computed.borderTopLeftRadius) * scale;
  const backgroundColor = computed.backgroundColor;
  const borderTopWidth = parsePx(computed.borderTopWidth) * scale;
  const borderColor = computed.borderTopColor;

  if (isVisibleColor(backgroundColor)) {
    ctx.fillStyle = backgroundColor;
    roundedRectPath(ctx, x, y, width, height, radius);
    ctx.fill();
  }

  if (borderTopWidth > 0 && computed.borderTopStyle !== "none" && isVisibleColor(borderColor)) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderTopWidth;
    roundedRectPath(ctx, x + borderTopWidth / 2, y + borderTopWidth / 2, width - borderTopWidth, height - borderTopWidth, Math.max(0, radius - borderTopWidth / 2));
    ctx.stroke();
  }

  const shouldClip = computed.overflow === "hidden" || computed.overflowX === "hidden" || computed.overflowY === "hidden";
  if (shouldClip) {
    ctx.save();
    roundedRectPath(ctx, x, y, width, height, radius);
    ctx.clip();
  }

  if (element.tagName.toLowerCase() === "svg") {
    Array.from(element.querySelectorAll("path")).forEach((path) => {
      const pathData = path.getAttribute("d");
      if (!pathData || typeof Path2D === "undefined") return;
      const viewBox = element.getAttribute("viewBox")?.split(/\s+/).map(Number);
      const viewBoxWidth = viewBox?.[2] || 24;
      const viewBoxHeight = viewBox?.[3] || 24;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(width / viewBoxWidth, height / viewBoxHeight);
      const canvasPath = new Path2D(pathData);
      const fill = path.getAttribute("fill") || element.getAttribute("fill") || "currentColor";
      const stroke = path.getAttribute("stroke") || element.getAttribute("stroke");
      if (fill !== "none") {
        ctx.fillStyle = fill === "currentColor" ? computed.color : fill;
        ctx.fill(canvasPath);
      }
      if (stroke && stroke !== "none") {
        ctx.strokeStyle = stroke === "currentColor" ? computed.color : stroke;
        ctx.lineWidth = parsePx(element.getAttribute("stroke-width") || element.getAttribute("strokeWidth") || "2");
        ctx.lineCap = element.getAttribute("stroke-linecap") || element.getAttribute("strokeLinecap") || "butt";
        ctx.lineJoin = element.getAttribute("stroke-linejoin") || element.getAttribute("strokeLinejoin") || "miter";
        ctx.stroke(canvasPath);
      }
      ctx.restore();
    });
  } else {
    drawElementText(ctx, element, rootRect, scale);
    Array.from(element.children).forEach((child) => drawElementToCanvas(ctx, child, rootRect, scale));
  }

  if (shouldClip) ctx.restore();
}

async function renderElementToCanvas(element) {
  await document.fonts?.ready;

  const rect = element.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);
  const scale = Math.max(2, Math.min(window.devicePixelRatio || 2, 3));
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = window.getComputedStyle(element).backgroundColor || "#f9fafb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);

  drawElementToCanvas(ctx, element, rect, 1);
  return canvas;
}

function CadastruImageSaveButton({ cadastral, targetRef }) {
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveImage = async () => {
    if (!cadastral || isSaving) return;
    const target = targetRef.current;
    if (!target) return;
    setIsSaving(true);

    try {
      const canvas = await renderElementToCanvas(target);
      const cleanNumber = String(cadastral.cadastral_number || "cadastru").replace(/[^0-9a-z.-]+/gi, "-");
      triggerCanvasDownload(canvas, `catdai-cadastru-${cleanNumber}.png`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSaveImage}
      disabled={isSaving}
      className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="M7 10l5 5 5-5" />
        <path d="M12 15V3" />
      </svg>
      {isSaving ? t("cadastru.savingImage") : t("cadastru.saveImage")}
    </button>
  );
}

function fetchCadastralLookup(cacheKey, body, accessToken) {
  const existing = inFlightCadastralLookups.get(cacheKey);
  if (existing) return existing;

  const promise = fetch("/api/cadastral", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  }).then(async (response) => ({
    ok: response.ok,
    status: response.status,
    data: await response.json().catch(() => null),
  }));

  inFlightCadastralLookups.set(cacheKey, promise);
  promise.then(
    () => inFlightCadastralLookups.delete(cacheKey),
    () => inFlightCadastralLookups.delete(cacheKey)
  );
  return promise;
}

function CadastruResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, t } = useTranslation();
  const { session, isAuthenticated, loading: authLoading, clearAuthError } = useAuth();
  const cadastralNumber = searchParams.get("cadastral_number") || "";
  const source = searchParams.get("source") || "";
  const loadedRequestKey = useRef("");
  const [authModalDismissed, setAuthModalDismissed] = useState(false);
  const [isPaywallModalOpen, setIsPaywallModalOpen] = useState(false);
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
  });
  const authRequired = !authLoading && Boolean(cadastralNumber) && !isAuthenticated;
  const isLockedPreview = state.data?.locked_sections?.cadastru_details === true;
  const purchaseOffer = state.data?.access_limit?.purchase || null;
  const cadastralCardRef = useRef(null);
  const exportCardRef = useRef(null);

  useEffect(() => {
    if (!cadastralNumber) return;
    try {
      localStorage.removeItem(CADASTRU_DRAFT_STORAGE_KEY);
    } catch {
      // Draft cleanup is best-effort after the result page opens.
    }
  }, [cadastralNumber]);

  useEffect(() => {
    if (authLoading) return;
    if (!cadastralNumber) {
      return;
    }

    if (!isAuthenticated) return;

    const searchSource = source === "address" || source === "number" ? source : "";
    const requestKey = `${cadastralNumber}|${searchSource}`;
    if (loadedRequestKey.current === requestKey) return;
    if (!session?.access_token) return;

    let active = true;

    async function loadCadastralData() {
      setState({ loading: true, error: "", data: null });

      try {
        const body = {
          cadastral_number: cadastralNumber,
          ...(searchSource === "number" ? { search_context: "cadastru", search_type: searchSource } : {}),
        };

        const response = await fetchCadastralLookup(`${requestKey}|${session.access_token}`, body, session.access_token);

        if (!response.ok) {
          if (response.status === 401) {
            clearAuthError();
            if (active) setState({ loading: false, error: t("cadastru.loginToUse"), data: null });
            return;
          }
          if (active) setState({ loading: false, error: t("cadastru.lookupError"), data: null });
          return;
        }

        if (active) {
          loadedRequestKey.current = requestKey;
          setState({ loading: false, error: "", data: response.data });
        }
      } catch {
        if (active) setState({ loading: false, error: t("cadastru.lookupError"), data: null });
      }
    }

    loadCadastralData();

    return () => {
      active = false;
    };
  }, [authLoading, cadastralNumber, clearAuthError, isAuthenticated, session?.access_token, source, t]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AuthRequiredModal
        open={authRequired && !authModalDismissed}
        copyKey="cadastru.loginToUse"
        onClose={() => setAuthModalDismissed(true)}
      />
      <AuthRequiredModal
        open={isPaywallModalOpen}
        copyKey="payment.buyAccess"
        showAuthOptions={false}
        onClose={() => setIsPaywallModalOpen(false)}
      >
        {purchaseOffer ? (
          <>
            <p className="mb-4 text-center text-sm font-medium text-gray-500">
              {t("payment.limitPackageSubtitle")}
            </p>
            <FeaturePricingAction offer={purchaseOffer} />
          </>
        ) : null}
      </AuthRequiredModal>
      <Navbar />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-6 pb-12 pt-8 sm:pb-16 sm:pt-10 lg:pb-20 lg:pt-12">
          <BackButton onClick={() => router.push(`/${lang}/cadastru`)} className="mb-6">
            {t("cadastru.backToSearch")}
          </BackButton>

          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">
              {t("cadastru.resultPageTitle")}
            </h1>
            {state.data && (
              <CadastruImageSaveButton cadastral={state.data} targetRef={exportCardRef} />
            )}
          </div>

          {state.loading && !authRequired && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-600 shadow-sm sm:p-8">
              {t("cadastru.searching")}
            </div>
          )}

          {(state.error || (!cadastralNumber && !state.loading)) && (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm font-medium text-red-800 shadow-sm sm:p-8">
              {state.error || t("cadastru.lookupError")}
            </div>
          )}

          {state.data && (
            <div ref={cadastralCardRef} className="overflow-visible bg-gray-50 p-1">
              <CadastralDataCard
                cadastral={state.data}
                locked={isLockedPreview}
                onLockedClick={isLockedPreview ? () => setIsPaywallModalOpen(true) : undefined}
              />
            </div>
          )}
          {state.data && (
            <div
              ref={exportCardRef}
              aria-hidden="true"
              className="pointer-events-none fixed left-[-10000px] top-0 w-[1024px] overflow-visible bg-gray-50 p-1"
            >
              <CadastralDataCard
                cadastral={state.data}
                locked={isLockedPreview}
                forceDesktopLayout
              />
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default function CadastruResultPage() {
  return (
    <Suspense>
      <CadastruResultContent />
    </Suspense>
  );
}
