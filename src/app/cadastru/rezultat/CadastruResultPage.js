"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackButton from "@/components/BackButton";
import CadastralDataCard from "@/components/CadastralDataCard";
import CadastruListingsCard from "@/components/CadastruListingsCard";
import CadastruNearbyCard from "@/components/CadastruNearbyCard";
import CadastruPublicTransportCard from "@/components/CadastruPublicTransportCard";
import CadastruMunicipalReportsCard from "@/components/CadastruMunicipalReportsCard";
import CadastruFavoriteButton from "@/components/CadastruFavoriteButton";
import CadastruShareButton from "@/components/CadastruShareButton";
import CadastruParcelMap from "@/components/CadastruParcelMap";
import CadastruMapPreview from "@/components/CadastruMapPreview";
import CadastruLoadingPage from "@/components/CadastruLoadingPage";
import CadastruRouteLoading from "./loading";
import AuthRequiredModal from "@/components/AuthRequiredModal";
import FeaturePricingAction from "@/components/FeaturePricingAction";
import usePaymentProvider from "@/components/usePaymentProvider";
import { maibProduct } from "@/lib/maib/products.mjs";
import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { matchCity, validateCadastralNumber } from "@/lib/validation";
import { CADASTRU_SUPPORTED_CITIES } from "@/lib/cadastru-supported-cities";
import { getCadastruFavoritePath, getSavedCadastruAddress } from "@/lib/cadastru-favorites";
import { buildFullAccessAddressResultParams, resolveValuationDistrict } from "@/lib/cadastru-valuation-handoff";
import { municipalReportsAvailableForCadastru, validMunicipalReportsResult } from "@/lib/cadastru-municipal-reports";
import { getDeviceId } from "@/lib/visitor-browser";
import { ensureCadastruLookupId, getCadastruSearchSessionId } from "@/lib/cadastru-lookup-tracking";
import { recordCadastruShareOpen } from "@/lib/cadastru-share-tracking";
import { cadastruMapLocation } from "@/lib/cadastru-map";
import { featureCheckoutUrl } from "@/lib/payment-urls.mjs";

const roadTypes = [
  { value: "strada", label: "cadastru.roadTypeStreet", fullLabel: "cadastru.roadTypeStreetFull" },
  { value: "str-la", label: "cadastru.roadTypeLane", fullLabel: "cadastru.roadTypeLaneFull" },
  { value: "bulevard", label: "cadastru.roadTypeBoulevard", fullLabel: "cadastru.roadTypeBoulevardFull" },
];
const STREET_MAX_LENGTH = 80;
const HOUSE_NUMBER_PATTERN = /^\d{1,4}(?:\/(?:\d{1,4}|[a-z]))?$/i;
const APARTMENT_NUMBER_PATTERN = /^\d{1,4}$/;

const inFlightCadastralLookups = new Map();
const inFlightAddressLookups = new Map();
const CADASTRU_DRAFT_STORAGE_KEY = "catdai:cadastru-search-draft:v1";
const ADDRESS_PREVIEW_STORAGE_KEY = "catdai:cadastru-address-result-preview:v1";
const ADDRESS_LOOKUP_REQUEST_STORAGE_KEY = "catdai:cadastru-address-lookup-request:v1";

function readLookupError(payload, t) {
  if (payload?.error === "internal_error") return t("cadastru.internalError");
  if (payload?.error === "unauthorized") return t("cadastru.loginToUse");
  if (payload?.error === "invalid_format") return t("form.cadastralInvalid");
  if (payload?.error === "missing_fields") return t("cadastru.missingAddressFields");
  if (payload?.error === "invalid_address_fields") return t("cadastru.invalidAddressFields");
  if (payload?.error === "too_many_requests") return t("cadastru.rateLimitError");
  if (["service_unavailable", "timeout", "external_cadastru_timeout", "external_cadastru_unreachable"].includes(payload?.error)) return t("cadastru.serviceUnavailable");
  if (payload?.error === "not_found") return t("cadastru.lookupError");
  return payload?.message || payload?.error || t("cadastru.lookupError");
}

function isLookupUnavailable(response) {
  if (response.data?.error === "internal_error") return false;
  return response.status === 408 || response.status >= 500 ||
    ["service_unavailable", "timeout", "external_cadastru_timeout", "external_cadastru_unreachable"].includes(response.data?.error);
}

function lookupRetryState(response, key, attempt) {
  const retry = response.status === 408 || response.status >= 500 ? { key, attempt } : null;
  return { retry, retrying: Boolean(retry && attempt === 0) };
}

function formatLookupAddress(address) {
  if (!address?.city || !address?.road_type || !address?.street || !address?.house_number) return "";
  return `${address.city}, ${address.road_type} ${address.street} ${address.house_number}`;
}

function normalizeLocationText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[șş]/gi, "s")
    .replace(/[țţ]/gi, "t")
    .toLowerCase();
}

function resolveValuationCity(cadastral) {
  const locationValues = [
    cadastral?.form_fields?.city,
    cadastral?.parsed_input?.city,
    cadastral?.request_address,
    cadastral?.matched_address,
    cadastral?.apartment?.address,
    cadastral?.building?.address,
    cadastral?.location?.city,
    cadastral?.location?.display_name,
  ].filter(Boolean);
  const locationText = normalizeLocationText(locationValues.join(" "));

  if (locationText.includes("durlesti") || locationText.includes("дурлеш")) {
    return "Durlești";
  }

  const directCity = locationValues.map((value) => matchCity(String(value))).find(Boolean);
  if (directCity) return directCity;

  if (locationText.includes("chisinau") || locationText.includes("кишин")) {
    return "Chișinău";
  }

  return null;
}

function hasApartmentNumber(cadastral) {
  if (
    cadastral?.apartment_number ||
    cadastral?.parsed_input?.apartment ||
    (typeof cadastral?.apartment === "string" && cadastral.apartment)
  ) {
    return true;
  }

  const cadastralNumber = String(cadastral?.cadastral_number || "").trim();
  const validation = validateCadastralNumber(cadastralNumber);
  return validation.valid && cadastralNumber.split(".").length >= 3;
}

function numericParam(value, { integer = false, min, max } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim().replace(",", ".");
  const number = integer ? Number.parseInt(normalized, 10) : Number.parseFloat(normalized);
  if (!Number.isFinite(number)) return null;
  if (min != null && number < min) return null;
  if (max != null && number > max) return null;
  return String(number);
}

function buildValuationPrefill(cadastral, addressDistrict) {
  if (!cadastral || cadastral.error || (cadastral.status && cadastral.status !== "success")) return null;
  if (!hasApartmentNumber(cadastral)) return null;

  const city = resolveValuationCity(cadastral);
  if (!city) return null;

  const params = new URLSearchParams({ city });
  const district = resolveValuationDistrict(cadastral, city, addressDistrict);
  const area = numericParam(cadastral?.form_fields?.area_m2 ?? cadastral?.apartment?.area_m2 ?? cadastral?.apartment_area_m2, { min: 0.01, max: 1000 });
  const floor = numericParam(cadastral?.form_fields?.floor ?? cadastral?.apartment?.floor ?? cadastral?.apartment_floor, { integer: true, min: -1, max: 100 });
  const totalFloors = numericParam(cadastral?.form_fields?.total_floors ?? cadastral?.building?.total_floors, { integer: true, min: 1, max: 100 });

  if (district) params.set("district", district);
  if (area) params.set("area", area);
  if (floor) params.set("floor", floor);
  if (totalFloors) params.set("total_floors", totalFloors);
  if (!cadastral?.locked_sections?.cadastral_number) {
    const number = validateCadastralNumber(String(cadastral?.cadastral_number || "").trim());
    if (number.valid) params.set("cadastral_number", number.value);
  }

  return params;
}

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

function fetchCadastralLookup(cacheKey, body, accessToken, tracking) {
  const existing = inFlightCadastralLookups.get(cacheKey);
  if (existing) return existing;

  const lookupTracking = tracking || { id: crypto.randomUUID(), query: body.cadastral_number };
  const promise = fetch("/api/cadastral", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "x-catdai-device-id": getDeviceId() || "",
      "x-catdai-search-session": getCadastruSearchSessionId(),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ ...body, lookup_id: lookupTracking.id, lookup_query: lookupTracking.query }),
  }).then(async (response) => ({
    ok: response.ok,
    status: response.status,
    data: await response.json().catch(() => null),
  }));

  promise.lookupTracking = lookupTracking;
  inFlightCadastralLookups.set(cacheKey, promise);
  promise.then(
    () => inFlightCadastralLookups.delete(cacheKey),
    () => inFlightCadastralLookups.delete(cacheKey)
  );
  return promise;
}

function fetchAddressLookup(cacheKey, body, accessToken, tracking) {
  const existing = inFlightAddressLookups.get(cacheKey);
  if (existing) return existing;

  const lookupTracking = tracking || { id: crypto.randomUUID(), query: [formatLookupAddress(body), body.apartment_number ? `ap. ${body.apartment_number}` : ""].filter(Boolean).join(", ") };
  const promise = fetch("/api/cadastru/address", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "x-catdai-device-id": getDeviceId() || "",
      "x-catdai-search-session": getCadastruSearchSessionId(),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ ...body, lookup_id: lookupTracking.id, lookup_query: lookupTracking.query }),
  }).then(async (response) => ({
    ok: response.ok,
    status: response.status,
    data: await response.json().catch(() => null),
  }));

  promise.lookupTracking = lookupTracking;
  inFlightAddressLookups.set(cacheKey, promise);
  promise.then(
    () => inFlightAddressLookups.delete(cacheKey),
    () => inFlightAddressLookups.delete(cacheKey)
  );
  return promise;
}

function readAddressResultPreview() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ADDRESS_PREVIEW_STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function readAddressLookupRequest(lookupId) {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ADDRESS_LOOKUP_REQUEST_STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    if (lookupId && parsed.lookup_id && parsed.lookup_id !== lookupId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function CadastruResultContent({ sharedReportSlug = "" } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, t } = useTranslation();
  const { session, isAuthenticated, loading: authLoading, clearAuthError } = useAuth();
  const paymentProvider = usePaymentProvider();
  const shareSlug = sharedReportSlug || searchParams.get("share_slug") || "";
  const rawCadastralNumber = shareSlug ? "" : searchParams.get("cadastral_number") || "";
  const cadastralNumber = validateCadastralNumber(rawCadastralNumber).value || rawCadastralNumber;
  const source = shareSlug ? "" : searchParams.get("source") || "";
  const searchLookupId = searchParams.get("lookup_id") || "";
  const originalStreetParam = shareSlug ? "" : (searchParams.get("original_street") || "").slice(0, 80);
  const resolvedStreetParam = shareSlug ? "" : (searchParams.get("resolved_street") || "").slice(0, 80);
  const skipCache = !shareSlug && searchParams.get("skipcache") === "true";
  const isAddressResultHandoff = source === "address" && searchParams.get("result") === "1";
  const isAddressPreviewHandoff = source === "address" && (
    searchParams.get("preview") === "1" || searchParams.get("result") === "1"
  );
  const isPendingAddressLookup = source === "address" && searchParams.get("lookup") === "1";
  const [retryRequest, setRetryRequest] = useState(null);
  const [lookupRetry, setLookupRetry] = useState(null);
  const isHistoryAddress = searchParams.get("history") === "1";
  const urlAddress = shareSlug ? null : getSavedCadastruAddress(searchParams);
  const pendingAddressRequest = (!cadastralNumber ? retryRequest : null) || (isPendingAddressLookup
    ? urlAddress ? { ...urlAddress, lookup_id: searchLookupId, ...(isHistoryAddress ? {} : { search_context: 'cadastru' }) }
      : readAddressLookupRequest(searchLookupId) : null);
  const addressRequestKey = pendingAddressRequest ? JSON.stringify(pendingAddressRequest) : "";
  const savedAddress = shareSlug ? null : (!cadastralNumber ? retryRequest : null) || urlAddress;
  const savedAddressKey = savedAddress ? new URLSearchParams({ source: "address", ...savedAddress }).toString() : "";
  const lookupTracking = useRef(null);
  const addressResultHandoff = useRef(null);
  const loadedRequestKey = useRef("");
  const loadedNearbyKey = useRef("");
  const loadedTransportKey = useRef("");
  const loadedReportsKey = useRef("");
  const loadedMarketKey = useRef("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalCopyKey, setAuthModalCopyKey] = useState("cadastru.loginToUse");
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
  });
  const [nearbyState, setNearbyState] = useState({ key: "", data: null, loading: false, error: false });
  const [transportState, setTransportState] = useState({ key: "", data: null, loading: false, error: false });
  const [marketState, setMarketState] = useState({ key: "", data: null });
  const [reportsState, setReportsState] = useState({ key: "", data: null, loading: false, error: false });
  const originalStreet = originalStreetParam || String(state.data?.street_resolution?.original || "").slice(0, 80);
  const resolvedStreet = resolvedStreetParam || String(state.data?.street_resolution?.resolved || "").slice(0, 80);
  const isLockedPreview = state.data?.locked_sections?.cadastru_details === true;
  const purchaseOffer = state.data?.access_limit?.purchase || (isLockedPreview ? { product_key: "cadastru_lookup_single" } : null);
  const singlePurchaseProduct = purchaseOffer?.product_key?.endsWith("_single") ? maibProduct(purchaseOffer.product_key) : null;
  const checkoutProductKey = paymentProvider === "maib" && singlePurchaseProduct ? singlePurchaseProduct.key : "extra_pack";
  const unlockPriceMdl = paymentProvider === "maib"
    ? (singlePurchaseProduct || maibProduct("extra_pack")).amount_mdl
    : Number(process.env.NEXT_PUBLIC_PRICE_EXTRA_PACK_MDL_COST || 499);
  const unlockPriceLabel = `${new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "ro-MD").format(unlockPriceMdl)} MDL`;
  const startCheckout = () => {
    const current = new URL(window.location.href);
    const path = getCadastruFavoritePath({ lang, cadastralNumber, cadastral: state.data,
      addressRequest: pendingAddressRequest, savedAddress });
    const destination = new URL(path || current.href, current.origin);
    for (const key of ['lookup_id', 'source', 'skipcache']) {
      if (!destination.searchParams.has(key) && current.searchParams.has(key)) destination.searchParams.set(key, current.searchParams.get(key));
    }
    window.location.assign(featureCheckoutUrl(checkoutProductKey, lang, destination.href));
  };
  const cadastralCardRef = useRef(null);
  const exportCardRef = useRef(null);
  const [device, setDevice] = useState({ isMobile: false, isIOS: false });

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isMobileDevice = isIOSDevice || /Android|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
    setDevice({ isMobile: isMobileDevice, isIOS: isIOSDevice });
  }, []);

  const valuationPrefill = buildValuationPrefill(state.data, source === "address" ? searchParams.get("district") : null);
  const evaluationToken = searchParams.get("cadastru_evaluation") || state.data?.cadastru_evaluation_token;
  const favoritePath = state.data && !shareSlug ? getCadastruFavoritePath({
    lang,
    cadastralNumber,
    cadastral: state.data,
    savedAddress,
    addressRequest: (isAddressPreviewHandoff || isPendingAddressLookup) ? readAddressLookupRequest() : null,
  }) : null;
  const favoriteNumber = cadastralNumber || (!isLockedPreview ? state.data?.cadastral_number : "");
  const favoriteAddress = state.data?.locked_sections?.address ? state.data?.address_locality
    : state.data?.resolved_address || state.data?.request_address ||
      state.data?.matched_address || state.data?.apartment?.address || state.data?.building?.address;
  const favoriteLabel = [t("nav.cadastru"), favoriteNumber, favoriteAddress].filter(Boolean).join(" · ");
  const nearbyAddress = state.fallbackAddress || (source === "address" || shareSlug
    ? state.data?.request_address || state.data?.resolved_address || (savedAddress
      ? `${savedAddress.city}, ${savedAddress.road_type} ${savedAddress.street} ${savedAddress.house_number}${savedAddress.apartment_number ? ` ap ${savedAddress.apartment_number}` : ""}`
      : "")
    : "");
  const nearbyNumber = cadastralNumber || (!state.data?.locked_sections?.cadastral_number ? state.data?.cadastral_number : "") || "";
  const nearbyKey = `${shareSlug}|${nearbyAddress || nearbyNumber}|${isAuthenticated ? "authenticated" : "anonymous"}|${skipCache}|${state.fallbackAddress ? "address-fallback" : "result"}`;
  const nearbyData = nearbyState.key === nearbyKey ? nearbyState.data : null;
  const mapLocation = [
    state.data?.map_location,
    ...(state.fallbackAddress ? [nearbyData?.location] : []),
    state.data?.building?.map_location,
    state.data?.apartment?.map_location,
    ...(Array.isArray(state.data?.buildings) ? state.data.buildings.map((property) => property?.map_location) : []),
    ...(Array.isArray(state.data?.lands) ? state.data.lands.map((property) => property?.map_location) : []),
  ].find((location) => Number.isFinite(location?.latitude) && Math.abs(location.latitude) <= 90 &&
    Number.isFinite(location?.longitude) && Math.abs(location.longitude) <= 180)
    || (!isLockedPreview ? cadastruMapLocation(state.data) : null);
  const hasMapLocation = !isLockedPreview && Boolean(mapLocation);
  const latitude = mapLocation?.latitude;
  const longitude = mapLocation?.longitude;
  const mapUrl = hasMapLocation
    ? `https://www.google.com/maps?${new URLSearchParams({
        q: `${latitude},${longitude}`,
        ll: `${latitude},${longitude}`,
        t: "k",
        z: "18",
        hl: lang,
        output: "embed",
      })}`
    : null;
  const externalMapUrl = hasMapLocation
    ? (device.isMobile && device.isIOS
        ? `https://maps.apple.com/?q=${latitude},${longitude}&ll=${latitude},${longitude}`
        : `https://www.google.com/maps?q=${latitude},${longitude}${device.isMobile ? "" : `&ll=${latitude},${longitude}&t=k&z=18`}`)
    : "#";

  const handleOpenExternalMap = (event) => {
    if (device.isMobile) {
      event.preventDefault();
      window.location.href = externalMapUrl;
    }
  };

  const protectedMap = (isLockedPreview || Boolean(state.fallbackAddress && !hasMapLocation)) && (state.data?.map_preview?.available || nearbyData?.map_preview?.available || Boolean(mapLocation))
    ? <CadastruMapPreview
      key={nearbyKey}
      address={nearbyAddress}
      cadastralNumber={validateCadastralNumber(nearbyNumber).valid ? nearbyNumber : ""}
      onUnlock={isLockedPreview ? startCheckout : undefined}
    /> : null;
  const map = protectedMap || (mapUrl && (
    <div className="mt-6 w-full overflow-hidden rounded-2xl border-2 border-emerald-200 bg-white shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5" aria-hidden="true">
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
              <line x1="9" y1="3" x2="9" y2="18" />
              <line x1="15" y1="6" x2="15" y2="21" />
            </svg>
          </span>
          <span className="truncate text-base font-bold text-gray-950 sm:text-lg">
            {t("cadastru.mapCardTitle")}
          </span>
        </div>
        <a
          href={externalMapUrl}
          target={device.isMobile ? undefined : "_blank"}
          rel={device.isMobile ? undefined : "noopener noreferrer"}
          onClick={handleOpenExternalMap}
          className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-950 sm:px-4 sm:text-sm"
        >
          {device.isMobile ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-emerald-700" aria-hidden="true">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>{t("cadastru.openMapApp")}</span>
            </>
          ) : (
            <>
              <span>{t("cadastru.openMapNewTab")}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-emerald-700" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </>
          )}
        </a>
      </div>
      <CadastruParcelMap location={mapLocation} cadastral={state.data} fallbackUrl={mapUrl} />
    </div>
  ));
  const nearbySearchAvailable = Boolean(nearbyAddress || validateCadastralNumber(nearbyNumber).valid);
  const secondaryAvailable = Boolean(state.data || state.fallbackAddress);
  const reportsAvailable = municipalReportsAvailableForCadastru(state.data || { request_address: state.fallbackAddress });

  const retryAddressSearch = (suggestion) => {
    const original = pendingAddressRequest || savedAddress || readAddressLookupRequest();
    if (!original) return;
    const address = { ...original };
    delete address.suggestion_recovery_token;
    const correction = typeof suggestion === "object" ? suggestion : null;
    if (correction && state.confirmationRequired && !correction.apartment_number) delete address.apartment_number;
    const body = {
      ...address,
      lookup_id: crypto.randomUUID(),
      ...(typeof suggestion === "string" ? { street: suggestion } : {}),
      ...(correction?.city ? { city: correction.city } : {}),
      ...(correction?.street ? { street: correction.street } : {}),
      ...(correction?.house_number ? { house_number: correction.house_number } : {}),
      ...(correction?.road_type ? { road_type: correction.road_type } : {}),
      ...(!isHistoryAddress ? { search_context: "cadastru" } : {}),
      ...(((typeof suggestion === "string" && state.didYouMean) || (correction && state.confirmationRequired))
        && state.suggestionRecoveryToken ? { suggestion_recovery_token: state.suggestionRecoveryToken } : {}),
    };
    try {
      sessionStorage.setItem(ADDRESS_LOOKUP_REQUEST_STORAGE_KEY, JSON.stringify(body));
    } catch {
      // Request persistence is best-effort for auth redirects.
    }
    lookupTracking.current = null;
    loadedRequestKey.current = "";
    setState({ loading: true, error: "", data: null });
    setRetryRequest(body);
    const params = new URLSearchParams({ source: 'address', lookup: '1', lookup_id: body.lookup_id,
      city: body.city, road_type: body.road_type, street: body.street, house_number: body.house_number,
      ...(body.apartment_number ? { apartment_number: body.apartment_number } : {}),
      ...(skipCache ? { skipcache: 'true' } : {}) });
    router.replace(`/${lang}/cadastru/rezultat?${params}`);
  };

  useEffect(() => {
    if (!state.data || shareSlug) return;
    try {
      localStorage.removeItem(CADASTRU_DRAFT_STORAGE_KEY);
    } catch {
      // Draft cleanup is best-effort after a successful result.
    }
  }, [shareSlug, state.data]);

  useEffect(() => {
    if (shareSlug) {
      let active = true;
      loadedRequestKey.current = "";
      setState({ loading: true, error: "", data: null });
      fetch(`/api/cadastru/share/${encodeURIComponent(shareSlug)}`)
        .then(async (response) => {
          const result = await response.json();
          if (!active) return;
          if (!response.ok || !result.cadastral) {
            setState({ loading: false, error: t(response.status === 404 ? "cadastru.sharedReportNotFound" : "cadastru.shareError"), data: null });
            return;
          }
          setState({ loading: false, error: "", data: result.cadastral, shareSlug });
        })
        .catch(() => {
          if (active) setState({ loading: false, error: t("cadastru.shareError"), data: null });
        });
      return () => { active = false; };
    }
    if (authLoading) return;
    const pendingRequest = addressRequestKey ? JSON.parse(addressRequestKey) : null;

    if (isAddressPreviewHandoff || isPendingAddressLookup || savedAddressKey) {
      const lookupId = ensureCadastruLookupId(pendingRequest?.lookup_id || searchLookupId || lookupTracking.current?.id);
      const accessMode = session?.user?.id || (session?.access_token ? "authenticated" : "anonymous");
      const requestKey = `address-preview|${lookupId}|${savedAddressKey}|${addressRequestKey}|${accessMode}|${skipCache ? "skipcache" : "cache"}|${isHistoryAddress ? "history" : "search"}`;
      const attempt = lookupRetry?.key === requestKey ? lookupRetry.attempt : 0;
      const attemptKey = `${requestKey}|${attempt}`;
      if (loadedRequestKey.current === attemptKey) return;

      const preview = savedAddressKey ? null : readAddressResultPreview();
      if (isAddressResultHandoff && preview) {
        loadedRequestKey.current = attemptKey;
        setState({ loading: false, error: "", data: preview });
        return;
      }
      if (!session?.access_token && !isAuthenticated && !savedAddressKey && !isPendingAddressLookup) {
        loadedRequestKey.current = attemptKey;
        setState({
          loading: false,
          error: preview ? "" : t("cadastru.lookupError"),
          data: preview,
        });
        return;
      }

      const addressRequest = pendingRequest || (savedAddressKey
        ? { ...getSavedCadastruAddress(new URLSearchParams(savedAddressKey)), ...(isHistoryAddress ? {} : { search_context: "cadastru" }) }
        : readAddressLookupRequest());
      if (!addressRequest) {
        loadedRequestKey.current = attemptKey;
        setState({
          loading: false,
          error: preview ? "" : t("cadastru.lookupError"),
          data: preview,
        });
        return;
      }

      let active = true;
      async function loadAddressData() {
        setState((current) => attempt > 0
          ? { ...current, retry: null, retrying: true }
          : { loading: true, error: "", data: null });
        try {
          const body = { ...addressRequest, ...(skipCache ? { skip_cache: true } : {}) };
          const lookup = fetchAddressLookup(
            `${attemptKey}|${JSON.stringify(body)}`,
            body,
            session?.access_token,
            { id: lookupId, query: [formatLookupAddress(body), body.apartment_number ? `ap. ${body.apartment_number}` : ""].filter(Boolean).join(", ") }
          );

          lookupTracking.current = lookup.lookupTracking;
          const response = await lookup;
          if (!response.ok) {
            if (!active) return;
            loadedRequestKey.current = attemptKey;
            const failure = response.data;
            const confirmationRequired = response.status === 422 && failure?.error === "address_confirmation_required";
            const addressCorrections = confirmationRequired && Array.isArray(failure.address_suggestions)
              ? failure.address_suggestions.filter((value) => {
                if (!value || value.road_type !== body.road_type || typeof value.street !== "string"
                  || value.street.length > STREET_MAX_LENGTH || typeof value.house_number !== "string"
                  || !HOUSE_NUMBER_PATTERN.test(value.house_number)) return false;
                const withoutApartment = body.apartment_number && value.city === body.city
                  && value.house_number === body.house_number && value.apartment_number === undefined;
                const alternativeAddress = (value.city === body.city && value.house_number.startsWith(`${body.house_number}/`))
                  || (body.city === "Chișinău" && value.city !== body.city && CADASTRU_SUPPORTED_CITIES.includes(value.city)
                    && value.house_number === body.house_number);
                const sameApartment = body.apartment_number
                  ? typeof value.apartment_number === "string" && APARTMENT_NUMBER_PATTERN.test(value.apartment_number)
                    && Number(value.apartment_number) === Number(body.apartment_number)
                  : !value.apartment_number;
                return withoutApartment || (alternativeAddress && sameApartment);
              }).slice(0, 3)
              : failure?.error === "address_fields_conflict" && Array.isArray(failure.corrections)
              ? failure.corrections.filter((value) => typeof value?.street === "string" && value.street.length <= STREET_MAX_LENGTH
                && typeof value.house_number === "string" && HOUSE_NUMBER_PATTERN.test(value.house_number)) : [];
            const localityConfirmation = confirmationRequired && addressCorrections.some((value) => value.city !== body.city);
            const errorMessage = localityConfirmation
              ? t("cadastru.localityAlternativeIntro", { city: body.city, street: body.street, house: body.house_number,
                localities: [...new Set(addressCorrections.filter((value) => value.city !== body.city).map((value) => value.city))].join(", ") })
              : confirmationRequired
              ? t(body.apartment_number ? "cadastru.addressAlternativeIntro" : "cadastru.buildingAlternativeIntro",
                { street: body.street, house: body.house_number, apartment: body.apartment_number })
              : failure?.error === "address_fields_conflict"
              ? t("cadastru.addressFieldsConflict", { embedded: failure.embedded_house_number, house: failure.house_number })
              : failure?.error === "ambiguous_street" ? t("cadastru.chooseStreet")
              : failure?.error === "not_found" && !body.apartment_number
              ? t("cadastru.buildingNotLocated", { street: body.street, house: body.house_number })
              : isLookupUnavailable(response) ? t("cadastru.serviceUnavailable") : readLookupError(failure, t);
            setState({
              loading: false,
              data: null,
              ...lookupRetryState(response, requestKey, attempt),
              fallbackAddress: isLookupUnavailable(response) ? formatLookupAddress(body) : "",
              didYouMean: response.status === 404 && failure?.error === "not_found",
              requestedCity: body.city,
              requestedApartmentNumber: body.apartment_number || "",
              requestedStreet: body.street,
              requestedRoad: t(roadTypes.find(({ value }) => value === body.road_type)?.fullLabel),
              suggestionRecoveryToken: failure?.suggestion_recovery_token || null,
              confirmationRequired,
              addressCorrections,
              suggestions: (failure?.error === "ambiguous_street" || (response.status === 404 && failure?.error === "not_found")) && Array.isArray(failure.suggestions)
                ? failure.suggestions.filter((value) => typeof value === "string" && value.length <= STREET_MAX_LENGTH) : [],
              roadTypeSuggestions: (response.status === 404 || response.status === 503) && Array.isArray(failure?.road_type_suggestions)
                ? failure.road_type_suggestions.filter((value) => roadTypes.some(({ value: type }) => type === value?.road_type)
                  && typeof value.street === "string" && value.street.length <= STREET_MAX_LENGTH) : [],
              error: errorMessage,
            });
            return;
          }

          if (active) {
            const data = response.data;
            if (isPendingAddressLookup && data?.cadastral_number && !data?.locked_sections?.cadastru_details) {
              addressResultHandoff.current = { data, accessToken: session?.access_token, skipCache };
              loadedRequestKey.current = attemptKey;
              setState({ loading: true, error: "", data, detailsLoading: true });
              const resolution = data.street_resolution;
              const params = buildFullAccessAddressResultParams(data, {
                city: body.city,
                skipCache,
                resolvedStreetParams: resolution?.original && resolution?.resolved
                  && resolution.original !== resolution.resolved ? {
                    original_street: resolution.original,
                    resolved_street: resolution.resolved,
                  } : {},
              });
              params.set("lookup_id", lookupId);
              router.replace(`/${lang}/cadastru/rezultat?${params.toString()}`);
              return;
            }
            loadedRequestKey.current = attemptKey;
            setState({ loading: false, error: data ? "" : t("cadastru.lookupError"), data });
          }
        } catch {
          if (active) {
            loadedRequestKey.current = attemptKey;
            setState({ loading: false, error: t("cadastru.serviceUnavailable"), data: null,
              ...lookupRetryState({ status: 503 }, requestKey, attempt),
              fallbackAddress: formatLookupAddress(addressRequest) });
          }
        }
      }

      loadAddressData();
      return () => {
        active = false;
      };
    }

    if (!cadastralNumber || !validateCadastralNumber(cadastralNumber).valid) {
      setState({ loading: false, error: source === "number" || cadastralNumber ? t("form.cadastralInvalid") : "", data: null });
      return;
    }

    const searchSource = source === "address" || source === "number" ? source : "";
    const accessMode = session?.user?.id || (session?.access_token ? "authenticated" : "anonymous");
    const lookupId = ensureCadastruLookupId(searchLookupId || lookupTracking.current?.id);
    const requestKey = `${lookupId}|${cadastralNumber}|${searchSource}|${accessMode}|${skipCache ? "skipcache" : "cache"}`;
    const attempt = lookupRetry?.key === requestKey ? lookupRetry.attempt : 0;
    const attemptKey = `${requestKey}|${attempt}`;
    if (loadedRequestKey.current === attemptKey) return;

    let active = true;
    const handoff = addressResultHandoff.current;
    const addressData = searchSource === "address" && handoff?.data?.cadastral_number === cadastralNumber
      && handoff.accessToken === session?.access_token && handoff.skipCache === skipCache ? handoff.data : null;

    async function loadCadastralData() {
      // Address resolution can contain only the identity; reveal the card and map after details settle.
      setState((current) => attempt > 0
        ? { ...current, retry: null, retrying: true, detailsLoading: true }
        : { loading: true, error: "", data: addressData, detailsLoading: true });

      try {
        const body = {
          cadastral_number: cadastralNumber,
          ...(skipCache ? { skip_cache: true } : {}),
          ...(searchSource === "number" ? { search_context: "cadastru", search_type: searchSource } : {}),
          ...(searchSource === "address" ? { preview_origin: "address" } : {}),
        };

        const lookup = fetchCadastralLookup(attemptKey, body, session?.access_token,
          { id: lookupId, query: (searchSource === "address" && lookupTracking.current?.query) || cadastralNumber });
        lookupTracking.current = lookup.lookupTracking;
        const response = await lookup;

        // Completed failures are attempts too; auth notifications must not retry them.
        if (active) loadedRequestKey.current = attemptKey;
        if (!response.ok) {
          if (response.status === 401) {
            clearAuthError();
            if (active) setState({ loading: false, error: t("cadastru.loginToUse"), data: null });
            return;
          }
          if (active) setState({ loading: false, error: isLookupUnavailable(response) ? t("cadastru.serviceUnavailable") : readLookupError(response.data, t), data: addressData,
            ...lookupRetryState(response, requestKey, attempt),
            fallbackAddress: !addressData && source === "address" && isLookupUnavailable(response)
              ? formatLookupAddress(readAddressLookupRequest()) : "" });
          return;
        }

        if (active) {
          setState({ loading: false, error: "", data: addressData && response.data ? {
            ...response.data,
            request_address: response.data.request_address || addressData.request_address,
            resolved_address: response.data.resolved_address || addressData.resolved_address,
          } : response.data });
        }
      } catch {
        if (active) {
          loadedRequestKey.current = attemptKey;
          setState({ loading: false, error: t("cadastru.serviceUnavailable"), data: addressData,
            ...lookupRetryState({ status: 503 }, requestKey, attempt),
            fallbackAddress: !addressData && source === "address" ? formatLookupAddress(readAddressLookupRequest()) : "" });
        }
      }
    }

    loadCadastralData();

    return () => {
      active = false;
    };
  }, [addressRequestKey, authLoading, cadastralNumber, clearAuthError, isAddressPreviewHandoff, isAddressResultHandoff, isAuthenticated, isHistoryAddress, isPendingAddressLookup, lang, lookupRetry, router, savedAddressKey, searchLookupId, session?.access_token, session?.user?.id, shareSlug, skipCache, source, t]);

  useEffect(() => {
    if (authLoading || !shareSlug || state.shareSlug !== shareSlug || !state.data) return;
    void recordCadastruShareOpen(shareSlug);
  }, [authLoading, session?.user?.id, shareSlug, state.data, state.shareSlug]);

  useEffect(() => {
    if (!state.retry || state.retry.attempt !== 0) return;
    const timer = setTimeout(() => setLookupRetry({ key: state.retry.key, attempt: 1 }), 2000);
    return () => clearTimeout(timer);
  }, [state.retry]);

  useEffect(() => {
    if (isAuthenticated) setIsAuthModalOpen(false);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!secondaryAvailable || !nearbySearchAvailable) return;
    if (loadedNearbyKey.current === nearbyKey) return;

    let active = true;
    let frame;
    // Start after the current loading page, result, or outage notice has painted.
    const firstFrame = requestAnimationFrame(() => {
      if (!active) return;
      setNearbyState({ key: nearbyKey, data: null, loading: true, error: false });
      frame = requestAnimationFrame(async () => {
        loadedNearbyKey.current = nearbyKey;
        try {
          const response = await fetch("/api/cadastru/nearby", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-catdai-device-id": getDeviceId() || "", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
            body: JSON.stringify({
              lookup_id: (lookupTracking.current ||= { id: crypto.randomUUID(), query: nearbyAddress || nearbyNumber }).id,
              lookup_query: lookupTracking.current.query,
              ...(nearbyAddress ? { address: nearbyAddress } : {}),
              ...(validateCadastralNumber(nearbyNumber).valid ? { cadastral_number: nearbyNumber } : {}),
            }),
          });
          const result = await response.json();
          if (active) setNearbyState({ key: nearbyKey, data: response.ok ? result.nearby : null, loading: false, error: !response.ok });
        } catch {
          if (active) setNearbyState({ key: nearbyKey, data: null, loading: false, error: true });
        }
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(firstFrame);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [nearbyAddress, nearbyKey, nearbyNumber, nearbySearchAvailable, secondaryAvailable, session?.access_token]);

  useEffect(() => {
    if (!secondaryAvailable || !nearbySearchAvailable) return;
    if (loadedTransportKey.current === nearbyKey) return;

    let active = true;
    let frame;
    const firstFrame = requestAnimationFrame(() => {
      if (!active) return;
      setTransportState({ key: nearbyKey, data: null, loading: true, error: false });
      frame = requestAnimationFrame(async () => {
        loadedTransportKey.current = nearbyKey;
        try {
          const response = await fetch("/api/cadastru/public-transport", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-catdai-device-id": getDeviceId() || "", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
            body: JSON.stringify({
              lookup_id: (lookupTracking.current ||= { id: crypto.randomUUID(), query: nearbyAddress || nearbyNumber }).id,
              lookup_query: lookupTracking.current.query,
              ...(nearbyAddress ? { address: nearbyAddress } : {}),
              ...(validateCadastralNumber(nearbyNumber).valid ? { cadastral_number: nearbyNumber } : {}),
            }),
          });
          const result = await response.json();
          if (active) setTransportState({ key: nearbyKey, data: response.ok ? result.public_transport : null, loading: false, error: !response.ok });
        } catch {
          if (active) setTransportState({ key: nearbyKey, data: null, loading: false, error: true });
        }
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(firstFrame);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [nearbyAddress, nearbyKey, nearbyNumber, nearbySearchAvailable, secondaryAvailable, session?.access_token]);

  useEffect(() => {
    if (!secondaryAvailable || !nearbySearchAvailable || !reportsAvailable) return;
    if (loadedReportsKey.current === nearbyKey) return;

    let active = true;
    let frame;
    const controller = new AbortController();
    // Run independently of nearby places and transport after the current page has painted.
    const firstFrame = requestAnimationFrame(() => {
      if (!active) return;
      setReportsState({ key: nearbyKey, data: null, loading: true, error: false });
      frame = requestAnimationFrame(async () => {
        try {
          const response = await fetch("/api/cadastru/municipal-reports", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-catdai-device-id": getDeviceId() || "", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
            body: JSON.stringify({
              lookup_id: (lookupTracking.current ||= { id: crypto.randomUUID(), query: nearbyAddress || nearbyNumber }).id,
              lookup_query: lookupTracking.current.query,
              ...(nearbyAddress ? { address: nearbyAddress } : {}),
              ...(validateCadastralNumber(nearbyNumber).valid ? { cadastral_number: nearbyNumber } : {}),
            }),
            signal: controller.signal,
          });
          const result = await response.json();
          if (!active) return;
          const valid = response.ok && validMunicipalReportsResult(result.municipal_reports);
          loadedReportsKey.current = nearbyKey;
          setReportsState({ key: nearbyKey, data: valid ? result.municipal_reports : null, loading: false, error: !valid });
        } catch {
          if (!active) return;
          loadedReportsKey.current = nearbyKey;
          setReportsState({ key: nearbyKey, data: null, loading: false, error: true });
        }
      });
    });
    return () => {
      active = false;
      controller.abort();
      cancelAnimationFrame(firstFrame);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [nearbyAddress, nearbyKey, nearbyNumber, nearbySearchAvailable, reportsAvailable, secondaryAvailable, session?.access_token]);

  const marketAddress = state.data?.locked_sections?.address ? ""
    : nearbyAddress || state.data?.resolved_address || state.data?.apartment?.address || state.data?.building?.address || state.data?.matched_address || "";
  const marketCity = resolveValuationCity(state.data);
  const marketDistrict = resolveValuationDistrict(state.data, marketCity, source === "address" ? searchParams.get("district") : null);
  const marketKey = `${nearbyKey}|${marketAddress}|${marketCity || ""}|${marketDistrict || ""}`;
  const secondarySettled = !nearbySearchAvailable || (
    nearbyState.key === nearbyKey && !nearbyState.loading &&
    transportState.key === nearbyKey && !transportState.loading &&
    (!reportsAvailable || (reportsState.key === nearbyKey && !reportsState.loading))
  );
  const marketReady = Boolean(state.data && !state.loading && !state.detailsLoading && !state.retrying && secondarySettled);

  useEffect(() => {
    if (!marketReady || loadedMarketKey.current === marketKey) return;
    let active = true;
    const controller = new AbortController();
    let timeout;
    const load = async () => {
      timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch("/api/cadastru/market", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ address: marketAddress, city: marketCity, district: marketDistrict,
            ...(validateCadastralNumber(nearbyNumber).valid ? { cadastral_number: nearbyNumber } : {}),
          }),
          signal: controller.signal,
          priority: "low",
        });
        const result = response.ok ? await response.json() : null;
        if (active) {
          loadedMarketKey.current = marketKey;
          setMarketState({ key: marketKey, data: result?.market || null });
        }
      } catch {
        if (active) {
          loadedMarketKey.current = marketKey;
          setMarketState({ key: marketKey, data: null });
        }
      } finally { clearTimeout(timeout); }
    };
    // All existing secondary cards have settled; give their paint priority too.
    const idle = window.requestIdleCallback ? window.requestIdleCallback(load, { timeout: 1000 }) : setTimeout(load, 0);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
      if (window.requestIdleCallback) window.cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, [marketReady, marketKey, marketAddress, marketCity, marketDistrict, nearbyNumber, session?.access_token]);

  if (state.loading) return <CadastruLoadingPage
    cadastralNumber={cadastralNumber}
    address={savedAddress}
    useStoredAddress={source === "address" && !savedAddress}
    detailsLoading={Boolean(state.detailsLoading && state.data)}
  />;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AuthRequiredModal
        open={isAuthModalOpen}
        copyKey={authModalCopyKey}
        onClose={() => setIsAuthModalOpen(false)}
      />
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
              <div className="flex shrink-0 flex-wrap items-start gap-2">
                {!isLockedPreview && (isAuthenticated || shareSlug) && (
                  <CadastruShareButton
                    key={`${shareSlug}:${favoritePath || favoriteNumber || favoriteAddress}`}
                    cadastralNumber={!savedAddress ? favoriteNumber : undefined}
                    address={state.data.resolved_address || state.data.request_address || favoriteAddress}
                    shareSlug={shareSlug}
                    searchToken={evaluationToken}
                  />
                )}
                {favoritePath && (
                  <CadastruFavoriteButton
                    key={`${session?.user?.id || "anonymous"}:${favoritePath}`}
                    urlPath={favoritePath}
                    label={favoriteLabel}
                    onAuthRequired={() => {
                      setAuthModalCopyKey("result.loginToFavorite");
                      clearAuthError();
                      setIsAuthModalOpen(true);
                    }}
                  />
                )}
                {isAuthenticated && <CadastruImageSaveButton cadastral={state.data} targetRef={exportCardRef} />}
              </div>
            )}
          </div>

          {state.data && source === "address" && originalStreet && resolvedStreet && originalStreet !== resolvedStreet && (
            <p className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
              {t("cadastru.resolvedStreet")} {originalStreet} → {resolvedStreet}
            </p>
          )}

          {(state.error || (!cadastralNumber && !state.loading && !state.data)) && (
            <div role="status" aria-busy={state.retrying || undefined} className={`rounded-2xl border p-6 text-sm font-medium shadow-sm sm:p-8 ${state.retrying || state.suggestions?.length || state.roadTypeSuggestions?.length || state.addressCorrections?.length ? "border-sky-200 bg-sky-50 text-sky-900" : "border-red-100 bg-red-50 text-red-800"}`}>
              <p className="flex items-start gap-2">{state.didYouMean && (state.suggestions?.length > 0 || state.roadTypeSuggestions?.length > 0)
                ? <>
                  <svg aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4" />
                    <path d="M12 8h.01" />
                  </svg>
                  <span>{t("cadastru.notFoundWithSuggestion", { road: state.requestedRoad, street: state.requestedStreet })}</span>
                </>
                : state.retrying ? t("cadastru.retrying") : state.error || t("cadastru.lookupError")}</p>
              {state.retry && !state.retrying && <button type="button"
                className="mt-3 cursor-pointer rounded-lg border border-red-200 bg-white px-3 py-2 text-sm hover:bg-red-50 disabled:cursor-not-allowed"
                disabled={authLoading}
                onClick={() => {
                  setLookupRetry({ key: state.retry.key, attempt: state.retry.attempt + 1 });
                  setState((current) => ({ ...current, retrying: true }));
                }}>
                {t("cadastru.retrySearch")}
              </button>}
              {state.fallbackAddress && <p className="mt-2 font-normal text-gray-700">
                {t("cadastru.otherDataAvailable")}
              </p>}
              {state.addressCorrections?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {state.addressCorrections.map((correction) => (
                    <div key={`${correction.city}:${correction.street}:${correction.house_number}`}>
                      {state.confirmationRequired && state.addressCorrections.length === 1 && <p className="mb-2 text-sm">
                        {correction.city !== state.requestedCity ? t("cadastru.localityAlternativeConfirm")
                          : state.requestedApartmentNumber && !correction.apartment_number ? t("cadastru.withoutApartmentAlternativeFound")
                          : t(correction.apartment_number ? "cadastru.addressAlternativeFound" : "cadastru.buildingAlternativeFound",
                            { street: correction.street, house: correction.house_number,
                            apartment: correction.apartment_number })}
                      </p>}
                      <button type="button"
                        className="cursor-pointer rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm hover:bg-sky-100 disabled:cursor-not-allowed"
                        disabled={state.loading || authLoading}
                        onClick={() => retryAddressSearch(correction)}>
                        {state.confirmationRequired && correction.city !== state.requestedCity
                          ? t("cadastru.searchSuggestedLocality", { city: correction.city, street: correction.street, house: correction.house_number })
                          : state.confirmationRequired && state.requestedApartmentNumber && !correction.apartment_number
                          ? t("cadastru.searchWithoutApartment")
                          : state.confirmationRequired ? t("cadastru.searchSuggestedHouse", { house: correction.house_number })
                          : t("cadastru.useAddressCorrection", { street: correction.street, house: correction.house_number })}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {state.suggestions?.length > 0 && (
                <div className="mt-3">
                  {state.didYouMean && <p className="mb-2 text-sm font-normal">{t("cadastru.didYouMean")}</p>}
                  <div className="flex flex-wrap gap-2">
                  {state.suggestions.map((street) => (
                    <button key={street} type="button" className="cursor-pointer rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm hover:bg-sky-100 disabled:cursor-not-allowed"
                      disabled={state.loading || authLoading}
                      onClick={() => retryAddressSearch(street)}>
                      {state.didYouMean ? <>{t("cadastru.useRoadTypeSuggestion", { road: state.requestedRoad, street })}
                        <span aria-hidden="true" className="ml-3">→</span></> : street}
                    </button>
                  ))}
                  </div>
                </div>
              )}
              {state.roadTypeSuggestions?.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-sm font-normal">{t("cadastru.didYouMeanRoadType")}</p>
                  <div className="flex flex-wrap gap-2">
                    {state.roadTypeSuggestions.map((suggestion) => (
                      <button key={`${suggestion.road_type}:${suggestion.street}`} type="button"
                        className="cursor-pointer rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm hover:bg-sky-100 disabled:cursor-not-allowed"
                        disabled={state.loading || authLoading}
                        onClick={() => retryAddressSearch(suggestion)}>
                        {t("cadastru.useRoadTypeSuggestion", {
                          road: t(roadTypes.find(({ value }) => value === suggestion.road_type).fullLabel), street: suggestion.street,
                        })}
                        <span aria-hidden="true" className="ml-3">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {state.data && (
            <div ref={cadastralCardRef} className="overflow-visible bg-gray-50 p-1">
              <CadastralDataCard
                cadastral={state.data}
                locked={isLockedPreview}
                showRevealButton={isLockedPreview}
                revealButtonLabel={t("cadastru.payToUnlock")}
                desktopRevealButtonLabel={t("cadastru.unlockCompleteCta", { price: unlockPriceLabel })}
                desktopRevealDescription={t("cadastru.unlockCompleteDescription")}
                onLockedClick={isLockedPreview ? startCheckout : undefined}
              >
                {map}
              </CadastralDataCard>
            </div>
          )}
          {state.fallbackAddress && map}
          {secondaryAvailable && (
            <CadastruNearbyCard
              nearby={nearbyData}
              loading={nearbySearchAvailable && (nearbyState.key !== nearbyKey || nearbyState.loading)}
              unavailable={!nearbySearchAvailable || (nearbyState.key === nearbyKey && nearbyState.error)}
            />
          )}
          {secondaryAvailable && (
            <CadastruPublicTransportCard
              transport={transportState.key === nearbyKey ? transportState.data : null}
              loading={nearbySearchAvailable && (transportState.key !== nearbyKey || transportState.loading)}
              unavailable={!nearbySearchAvailable || (transportState.key === nearbyKey && transportState.error)}
            />
          )}
          {secondaryAvailable && reportsAvailable && (
            <CadastruMunicipalReportsCard
              reports={reportsState.key === nearbyKey ? reportsState.data : null}
              loading={nearbySearchAvailable && (reportsState.key !== nearbyKey || reportsState.loading)}
              unavailable={!nearbySearchAvailable || (reportsState.key === nearbyKey && reportsState.error)}
            />
          )}
          <CadastruListingsCard data={marketReady && marketState.key === marketKey ? marketState.data : null}>
            {valuationPrefill && !shareSlug && (
              <button
                type="button"
                onClick={async () => {
                  const params = new URLSearchParams(valuationPrefill);
                  if (evaluationToken) {
                    params.set("cadastru_evaluation", evaluationToken);
                    try {
                      await fetch("/api/cadastru/evaluation", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "x-catdai-device-id": getDeviceId() || "", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
                        body: JSON.stringify({ token: evaluationToken }),
                      });
                    } catch {
                      // Navigation is still available if analytics fails.
                    }
                  }
                  router.push(`/estimeaza?${params.toString()}`);
                }}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-semibold text-emerald-950 shadow-sm transition-colors hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 sm:w-auto"
              >
                {t("cadastru.valuationCta")}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </button>
            )}
          </CadastruListingsCard>
          {(state.data || secondaryAvailable) && (
            <p className="mt-6 text-center text-xs text-gray-500">
              <a href="https://ipcbi.gov.md" className="underline">ipcbi.gov.md</a> · © OpenStreetMap contributors · Powered by <a href="https://www.geoapify.com/" className="underline">Geoapify</a> · © <a href="https://map.md/" className="underline">map.md</a>{protectedMap ? " · © Google" : null}
            </p>
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
      {isLockedPreview && purchaseOffer ? (
        <div className="lg:hidden">
          <FeaturePricingAction offer={purchaseOffer} mobileDock />
        </div>
      ) : null}
    </div>
  );
}

export default function CadastruResultPage({ shareSlug = "" } = {}) {
  return (
    <Suspense fallback={<CadastruRouteLoading />}>
      <CadastruResultContent sharedReportSlug={shareSlug} />
    </Suspense>
  );
}
