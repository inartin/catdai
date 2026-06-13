"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import CloseIcon from "@/components/icons/CloseIcon";
import FeaturePricingAction from "@/components/FeaturePricingAction";
import { useTranslation } from "@/context/LanguageContext";
import { validateCadastralNumber } from "@/lib/validation";
import { getDeviceId, getSessionId } from "@/lib/tracking";
import {
  createPdfPageCanvas,
  downloadCanvasesAsPdf,
  PDF_CANVAS_HEIGHT,
  PDF_CANVAS_WIDTH,
} from "@/lib/browser-pdf";

const PAGE_MARGIN_X = 46;
const PAGE_MARGIN_TOP = 42;
const PAGE_MARGIN_BOTTOM = 42;
const CONTENT_WIDTH = PDF_CANVAS_WIDTH - PAGE_MARGIN_X * 2;
const DEMO_PDF_URL = "/samples/demo-evaluare-catdai.md.pdf";
const COLORS = {
  text: "#111827",
  muted: "#6b7280",
  softText: "#4b5563",
  border: "#e5e7eb",
  faintBorder: "#f3f4f6",
  soft: "#f9fafb",
  green: "#047857",
  greenDark: "#0f766e",
  greenSoft: "#ecfdf5",
  greenBorder: "#99f6e4",
};

function formatPrice(num) {
  const value = Number(num);
  if (!Number.isFinite(value)) return "—";
  return `€${Math.round(value).toLocaleString("ro-MD")}`;
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatArea(num) {
  const value = Number(num);
  if (!Number.isFinite(value) || value <= 0) return null;
  return `${value.toLocaleString("ro-MD", { maximumFractionDigits: 1 })} m²`;
}

function sanitizeFilePart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function buildRows(rows) {
  return rows.filter((row) => row.value !== null && row.value !== undefined && row.value !== "");
}

function getRoomsLabel(input, t) {
  return Number(input?.rooms_count) === 1
    ? t("result.oneRoom")
    : t("result.rooms", { count: input?.rooms_count });
}

function getFloorLabel(input, t) {
  if (input?.first_floor || input?.last_floor) {
    return [
      input.first_floor ? t("result.floorOption.first") : null,
      input.last_floor ? t("result.floorOption.last") : null,
    ].filter(Boolean).join(", ");
  }
  if (!input?.floor) return null;
  if (Number(input.floor) === 1) return t("result.groundFloor");
  if (input.total_floors && Number(input.floor) === Number(input.total_floors)) {
    return t("result.lastFloor", { floor: input.floor });
  }
  return input.total_floors
    ? t("result.floorOf", { floor: input.floor, total: input.total_floors })
    : t("result.floor", { floor: input.floor });
}

function getBathroomLabel(value, t) {
  if (value === null || value === undefined) return null;
  if (Number(value) === 0) return t("result.noBathroom");
  if (Number(value) === 1) return t("result.oneBathroom");
  return t("result.bathrooms", { count: value });
}

function getBalconyLabel(value, t) {
  if (value === null || value === undefined) return null;
  if (Number(value) === 0) return t("result.noBalcony");
  if (Number(value) === 1) return t("result.oneBalcony");
  return t("result.balconies", { count: value });
}

function getAvailableSections(data) {
  return {
    seller: Boolean(data?.estimates_by_seller?.individual || data?.estimates_by_seller?.agency),
    cadastral: Boolean(data?.cadastral && !data.cadastral.partial),
  };
}

function createInitialOptions(data) {
  const available = getAvailableSections(data);
  return {
    prices: true,
    qr: true,
    seller: available.seller,
    cadastral: available.cadastral,
  };
}

function font(size, weight = 400) {
  return `${weight} ${size}px Arial, Helvetica, sans-serif`;
}

function drawRoundRect(ctx, x, y, width, height, radius, fill, stroke = null) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function textLines(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });

  if (line) lines.push(line);
  return lines;
}

function drawText(ctx, text, x, y, {
  size = 12,
  weight = 400,
  color = COLORS.text,
  maxWidth = null,
  lineHeight = Math.round(size * 1.35),
  align = "left",
} = {}) {
  ctx.font = font(size, weight);
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  ctx.textAlign = align;

  const lines = maxWidth ? textLines(ctx, text, maxWidth) : String(text || "").split("\n");
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });

  return y + lines.length * lineHeight;
}

function drawSectionTitle(ctx, title, x, y) {
  return drawText(ctx, title, x, y, { size: 15, weight: 800, lineHeight: 20 });
}

function loadReportImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load PDF image: ${src}`));
    image.src = src;
  });
}

async function createQrCodeImage(url) {
  if (!url) return null;
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
    color: {
      dark: COLORS.text,
      light: "#ffffff",
    },
  });
  return loadReportImage(dataUrl);
}

function buildQrUrl(cadastralNumber = "") {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("src", "qr");
  if (cadastralNumber) {
    url.searchParams.set("cadastral_number", cadastralNumber);
  }
  return url.toString();
}

async function trackPdfGeneration({ accessToken, estimateLogId, includedCadastral }) {
  if (!accessToken) return;

  const headers = { "Content-Type": "application/json" };
  headers.Authorization = `Bearer ${accessToken}`;

  try {
    await fetch("/api/pdf-generation-events", {
      method: "POST",
      headers,
      body: JSON.stringify({
        device_id: getDeviceId(),
        session_id: getSessionId(),
        estimate_log_id: estimateLogId || null,
        included_cadastral: includedCadastral,
      }),
      keepalive: true,
    });
  } catch {
    // PDF analytics should never block a user download.
  }
}

function buildPdfReportKey({ data, options, addedCadastralNumber }) {
  return {
    estimate_log_id: data?.tracking?.estimate_log_id || null,
    estimate_type: data?.estimate_type || "sale",
    input: data?.input || {},
    options,
    cadastral_number: addedCadastralNumber || data?.cadastral?.cadastral_number || null,
  };
}

async function authorizePdfGeneration(accessToken, reportKey) {
  if (!accessToken) return { authorized: false, reason: "auth" };

  const res = await fetch("/api/pdf-generation-authorizations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ report_key: reportKey }),
  });

  const payload = await res.json().catch(() => ({}));

  if (res.status === 401) return { authorized: false, reason: "auth" };
  if (res.status === 402 && payload?.error === "feature_credit_required") {
    return { authorized: false, reason: "credit", purchase: payload.purchase || null };
  }
  if (!res.ok) {
    throw new Error(`PDF authorization failed with ${res.status}`);
  }

  return { authorized: true, payload };
}

async function buildReportCanvases({ data, options, t, lang, qrUrl }) {
  const {
    estimate = {},
    input = {},
    filters_used = {},
    cadastral,
  } = data || {};

  const now = new Date();
  const reportDate = now.toLocaleDateString(lang === "ru" ? "ru-RU" : "ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const cityLabel = input.city ? t(`data.city.${input.city}`) : null;
  const districtLabel = input.district ? t(`data.district.${input.district}`) : null;
  const roomsLabel = getRoomsLabel(input, t);
  const floorLabel = getFloorLabel(input, t);
  const areaLabel = formatArea(input.area_m2);
  const title = [t("result.apartment"), roomsLabel, areaLabel].filter(Boolean).join(" · ");
  const location = [districtLabel, cityLabel].filter(Boolean).join(", ");
  const propertyRows = buildRows([
    { label: t("form.city"), value: cityLabel },
    { label: t("form.district"), value: districtLabel },
    { label: t("form.rooms"), value: roomsLabel },
    { label: t("form.area"), value: areaLabel },
    { label: t("form.floor"), value: floorLabel },
    { label: t("form.buildingType"), value: input.building_type ? t(`data.buildingType.${input.building_type}`) : null },
    { label: t("form.renovation"), value: input.renovation ? t(`data.renovationType.${input.renovation}`) : null },
    { label: t("form.bathrooms"), value: getBathroomLabel(input.bathrooms_count, t) },
    { label: t("form.balconies"), value: getBalconyLabel(input.balconies_count, t) },
  ]);

  const individualEstimate = data?.estimates_by_seller?.individual?.estimate;
  const agencyEstimate = data?.estimates_by_seller?.agency?.estimate;
  const individualStats = data?.estimates_by_seller?.individual?.market_stats;
  const agencyStats = data?.estimates_by_seller?.agency?.market_stats;
  const indRate = Number(individualEstimate?.market_rate);
  const agRate = Number(agencyEstimate?.market_rate);
  const sellerDelta = Number.isFinite(indRate) && Number.isFinite(agRate) ? agRate - indRate : null;
  const sellerDeltaPct = sellerDelta !== null && indRate ? (sellerDelta / indRate) * 100 : null;

  const cadastralRows = cadastral && !cadastral.partial
    ? buildRows([
      { label: t("form.cadastralArea"), value: cadastral.apartment?.area_m2 ? `${cadastral.apartment.area_m2} m²` : null },
      {
        label: t("form.cadastralFloor"),
        value: cadastral.apartment?.floor
          ? (cadastral.building?.total_floors
            ? t("form.floorOf", { floor: cadastral.apartment.floor, total: cadastral.building.total_floors })
            : cadastral.apartment.floor)
          : null,
      },
      { label: t("form.cadastralToilet"), value: cadastral.apartment?.toilet },
      { label: t("form.cadastralBathroom"), value: cadastral.apartment?.bathroom },
      { label: t("form.cadastralLastFloor"), value: cadastral.apartment?.is_last_floor },
      { label: t("form.cadastralEstimatedValue"), value: cadastral.apartment?.estimated_value_lei ? `${cadastral.apartment.estimated_value_lei} lei` : null },
      { label: t("form.cadastralClassifier"), value: cadastral.building?.classifier },
      { label: t("form.cadastralTotalFloors"), value: cadastral.building?.total_floors },
      { label: t("form.cadastralCondition"), value: cadastral.building?.condition },
      { label: t("form.cadastralYear"), value: cadastral.building?.construction_year },
      { label: t("form.cadastralWallMaterial"), value: cadastral.building?.wall_material },
      { label: t("form.cadastralWater"), value: cadastral.building?.water },
      { label: t("form.cadastralSewage"), value: cadastral.building?.sewage },
      { label: t("form.cadastralGas"), value: cadastral.building?.gas },
      { label: t("form.cadastralElectricity"), value: cadastral.building?.electricity },
    ])
    : [];
  const [logo, qrImage] = await Promise.all([
    loadReportImage("/icon0.svg"),
    createQrCodeImage(qrUrl),
  ]);

  const pages = [];
  let { canvas, ctx } = createPdfPageCanvas();
  let y = PAGE_MARGIN_TOP;

  const pushPage = () => {
    pages.push(canvas);
    ({ canvas, ctx } = createPdfPageCanvas());
    y = PAGE_MARGIN_TOP;
  };

  const ensureSpace = (height) => {
    if (y + height > PDF_CANVAS_HEIGHT - PAGE_MARGIN_BOTTOM) {
      pushPage();
    }
  };

  const drawDivider = (atY, weight = 1, color = COLORS.border) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.beginPath();
    ctx.moveTo(PAGE_MARGIN_X, atY);
    ctx.lineTo(PDF_CANVAS_WIDTH - PAGE_MARGIN_X, atY);
    ctx.stroke();
  };

  const drawPriceCard = ({ x, y: cardY, width, label, value, sub, primary = false }) => {
    drawRoundRect(ctx, x, cardY, width, 82, 12, primary ? COLORS.greenSoft : COLORS.soft, primary ? COLORS.greenBorder : COLORS.border);
    drawText(ctx, label, x + 14, cardY + 14, { size: 11, color: COLORS.muted, lineHeight: 14 });
    drawText(ctx, value, x + 14, cardY + 36, { size: 23, weight: 800, lineHeight: 27 });
    drawText(ctx, sub, x + 14, cardY + 65, { size: 11, color: COLORS.muted, lineHeight: 13 });
  };

  const drawRowsGrid = (rows, {
    xBase = PAGE_MARGIN_X,
    contentWidth = CONTENT_WIDTH,
    dividerColor = COLORS.faintBorder,
    wideLabels = [],
  } = {}) => {
    const columnGap = 14;
    const columnWidth = (contentWidth - columnGap) / 2;
    const rowHeight = 29;
    const rowsPerColumn = Math.ceil(rows.length / 2);
    ensureSpace(rowsPerColumn * rowHeight + 8);

    rows.forEach((row, index) => {
      const col = index >= rowsPerColumn ? 1 : 0;
      const rowIndex = index % rowsPerColumn;
      const x = xBase + col * (columnWidth + columnGap);
      const rowY = y + rowIndex * rowHeight;
      const labelMaxWidth = wideLabels.includes(row.label) ? columnWidth - 92 : columnWidth * 0.45;

      drawText(ctx, row.label, x, rowY + 7, { size: 12, color: COLORS.muted, maxWidth: labelMaxWidth, lineHeight: 15 });
      drawText(ctx, formatValue(row.value), x + columnWidth, rowY + 7, {
        size: 12,
        weight: 700,
        maxWidth: columnWidth * 0.5,
        lineHeight: 15,
        align: "right",
      });
      ctx.strokeStyle = dividerColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, rowY + rowHeight - 1);
      ctx.lineTo(x + columnWidth, rowY + rowHeight - 1);
      ctx.stroke();
    });

    y += rowsPerColumn * rowHeight + 4;
  };

  const drawNote = (text, strongPrefix = null) => {
    ctx.font = font(12);
    const lines = textLines(ctx, text, CONTENT_WIDTH - 24);
    const height = lines.length * 16 + 20;
    ensureSpace(height + 4);
    drawRoundRect(ctx, PAGE_MARGIN_X, y, CONTENT_WIDTH, height, 10, COLORS.soft, COLORS.border);
    if (strongPrefix) {
      drawText(ctx, strongPrefix, PAGE_MARGIN_X + 12, y + 10, { size: 12, weight: 800, color: COLORS.softText, lineHeight: 16 });
      drawText(ctx, text, PAGE_MARGIN_X + 12, y + 26, { size: 12, color: COLORS.softText, maxWidth: CONTENT_WIDTH - 24, lineHeight: 16 });
    } else {
      drawText(ctx, text, PAGE_MARGIN_X + 12, y + 10, { size: 12, color: COLORS.softText, maxWidth: CONTENT_WIDTH - 24, lineHeight: 16 });
    }
    y += height + 8;
  };

  const drawSellerCard = ({ x, cardY, width, label, price, meta }) => {
    drawRoundRect(ctx, x, cardY, width, 82, 12, "#ffffff", COLORS.border);
    drawText(ctx, label, x + 13, cardY + 14, { size: 12, weight: 700, color: COLORS.softText, lineHeight: 15 });
    drawText(ctx, price, x + 13, cardY + 39, { size: 19, weight: 800, lineHeight: 23 });
    drawText(ctx, meta, x + 13, cardY + 64, { size: 11, color: COLORS.muted, lineHeight: 14 });
  };

  const logoHeight = 40;
  const logoWidth = Math.round(logoHeight * (logo.naturalWidth / logo.naturalHeight));
  ctx.drawImage(logo, PAGE_MARGIN_X, y - 5, logoWidth, logoHeight);
  drawText(ctx, "catdai.md", PAGE_MARGIN_X + logoWidth + 10, y + 5, { size: 22, weight: 700, color: COLORS.softText, lineHeight: 27 });
  drawText(ctx, t("result.pdfReportTitle"), PAGE_MARGIN_X, y + 34, { size: 14, weight: 700, color: "#374151", lineHeight: 18 });
  drawText(ctx, t("result.pdfReportDate"), PDF_CANVAS_WIDTH - PAGE_MARGIN_X, y, { size: 11, color: COLORS.muted, align: "right", lineHeight: 14 });
  drawText(ctx, reportDate, PDF_CANVAS_WIDTH - PAGE_MARGIN_X, y + 18, { size: 13, weight: 700, align: "right", lineHeight: 16 });
  drawDivider(y + 58, 2, COLORS.text);
  y += 80;

  const qrSize = 92;
  const showQr = options.qr && qrImage;
  const qrX = PDF_CANVAS_WIDTH - PAGE_MARGIN_X - qrSize;
  const qrY = y - 2;
  const titleMaxWidth = showQr ? CONTENT_WIDTH - qrSize - 24 : CONTENT_WIDTH;

  if (showQr) {
    drawRoundRect(ctx, qrX - 7, qrY - 7, qrSize + 14, qrSize + 14, 10, "#ffffff", COLORS.border);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
  }

  drawText(ctx, t("result.profileAnalyzed").toUpperCase(), PAGE_MARGIN_X, y, { size: 10, weight: 800, color: COLORS.muted, lineHeight: 13 });
  y += 20;
  y = drawText(ctx, title, PAGE_MARGIN_X, y, { size: 25, weight: 800, maxWidth: titleMaxWidth, lineHeight: 31 });
  if (location) {
    y = drawText(ctx, location, PAGE_MARGIN_X, y + 6, { size: 14, color: COLORS.softText, maxWidth: titleMaxWidth, lineHeight: 18 });
  }
  y = Math.max(y + 18, showQr ? qrY + qrSize + 18 : y + 18);

  ensureSpace(130);
  y = drawSectionTitle(ctx, t("result.pdfPricesTitle"), PAGE_MARGIN_X, y);
  y += 10;
  const priceGap = 10;
  const priceWidth = (CONTENT_WIDTH - priceGap) / 2;
  drawPriceCard({
    x: PAGE_MARGIN_X,
    y,
    width: priceWidth,
    label: t("result.marketPrice"),
    value: formatPrice(estimate.market_rate),
    sub: `${formatPrice(estimate.price_per_m2)}/m²`,
    primary: true,
  });
  drawPriceCard({
    x: PAGE_MARGIN_X + priceWidth + priceGap,
    y,
    width: priceWidth,
    label: t("result.segmentMedian"),
    value: `${formatPrice(estimate.price_per_m2)}/m²`,
    sub: input.area_m2 ? `× ${input.area_m2} m² = ${formatPrice(estimate.market_rate)}` : "",
  });
  y += 100;

  ensureSpace(130);
  y = drawSectionTitle(ctx, t("result.pdfPropertySummary"), PAGE_MARGIN_X, y);
  y += 8;
  drawRowsGrid(propertyRows);
  y += 8;

  if (options.seller) {
    ensureSpace(130);
    y = drawSectionTitle(ctx, t("result.pdfSellerTitle"), PAGE_MARGIN_X, y);
    y += 10;
    const sellerGap = 10;
    const sellerWidth = (CONTENT_WIDTH - sellerGap) / 2;
    drawSellerCard({
      x: PAGE_MARGIN_X,
      cardY: y,
      width: sellerWidth,
      label: t("result.sellerIndividual"),
      price: formatPrice(individualEstimate?.market_rate),
      meta: `${formatPrice(individualEstimate?.price_per_m2)}/m²${individualStats?.comparable_count ? ` · ${t("result.trendListings", { count: individualStats.comparable_count })}` : ""}`,
    });
    drawSellerCard({
      x: PAGE_MARGIN_X + sellerWidth + sellerGap,
      cardY: y,
      width: sellerWidth,
      label: t("result.sellerAgency"),
      price: formatPrice(agencyEstimate?.market_rate),
      meta: `${formatPrice(agencyEstimate?.price_per_m2)}/m²${agencyStats?.comparable_count ? ` · ${t("result.trendListings", { count: agencyStats.comparable_count })}` : ""}`,
    });
    y += 94;
    if (sellerDelta !== null) {
      drawNote(`${t("result.sellerDifference")} ${sellerDelta > 0 ? "+" : "-"}${formatPrice(Math.abs(sellerDelta))}${sellerDeltaPct !== null ? ` (${sellerDeltaPct > 0 ? "+" : ""}${sellerDeltaPct.toFixed(1)}%)` : ""}`);
    }
  }

  if (options.cadastral && cadastral && !cadastral.partial) {
    const address = cadastral.apartment?.address || cadastral.building?.address;
    const panelInset = 14;
    const rowsHeight = Math.ceil(cadastralRows.length / 2) * 29 + 4;
    const addressHeight = address ? 27 : 0;
    const panelHeight = 16 + 20 + addressHeight + 8 + rowsHeight + 28 + 16;
    y += 18;
    ensureSpace(panelHeight);
    const panelY = y;
    drawRoundRect(ctx, PAGE_MARGIN_X, panelY, CONTENT_WIDTH, panelHeight, 12, COLORS.greenSoft, COLORS.greenBorder);
    y = panelY + 16;
    y = drawText(ctx, t("result.cadastralDataTitle"), PAGE_MARGIN_X + panelInset, y, {
      size: 15,
      weight: 800,
      color: COLORS.greenDark,
      lineHeight: 20,
    });
    if (address) {
      y = drawText(ctx, address, PAGE_MARGIN_X + panelInset, y + 6, {
        size: 14,
        color: COLORS.softText,
        maxWidth: CONTENT_WIDTH - panelInset * 2,
        lineHeight: 18,
      });
    }
    y += 8;
    drawRowsGrid(cadastralRows, {
      xBase: PAGE_MARGIN_X + panelInset,
      contentWidth: CONTENT_WIDTH - panelInset * 2,
      dividerColor: "#d1fae5",
      wideLabels: [t("form.cadastralEstimatedValue")],
    });
    drawText(ctx, t("result.cadastralDataSource"), PAGE_MARGIN_X + panelInset, y + 8, {
      size: 11,
      weight: 700,
      color: COLORS.green,
      lineHeight: 14,
    });
    y = panelY + panelHeight;
  }

  ensureSpace(48);
  y += 10;
  drawDivider(y, 1, COLORS.border);
  drawText(ctx, t("result.pdfDisclaimer"), PAGE_MARGIN_X, y + 10, {
    size: 10,
    color: COLORS.muted,
    maxWidth: CONTENT_WIDTH - 140,
    lineHeight: 14,
  });
  drawText(ctx, t("result.pdfSource"), PDF_CANVAS_WIDTH - PAGE_MARGIN_X, y + 10, {
    size: 10,
    weight: 700,
    color: COLORS.muted,
    align: "right",
    lineHeight: 14,
  });

  pages.push(canvas);
  return pages;
}

function PdfOption({ checked, disabled = false, label, detail, onChange }) {
  return (
    <label className={`flex gap-3 rounded-xl border p-3 ${disabled ? "border-gray-100 bg-gray-50 text-gray-400" : "border-gray-200 bg-white text-gray-800"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {detail && <span className="mt-0.5 block text-xs text-gray-500">{detail}</span>}
      </span>
    </label>
  );
}

function CadastralPrompt({
  t,
  showInput,
  onShowInput,
  cadastralInput,
  onInputChange,
  onSearch,
  loading,
  error,
  data,
}) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
      <p className="text-sm font-semibold text-emerald-950">
        {t("result.pdfCadastralRecommendationTitle")}
      </p>
      <p className="mt-1 text-xs leading-5 text-emerald-800">
        {t("result.pdfCadastralRecommendation")}
      </p>

      {!showInput ? (
        <button
          type="button"
          onClick={onShowInput}
          className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          {t("result.pdfAddCadastral")}
        </button>
      ) : (
        <div className="mt-3">
          <label className="mb-1.5 block text-xs font-semibold text-emerald-950">
            {t("form.cadastralNumber")}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t("form.cadastralPlaceholder")}
              value={cadastralInput}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSearch();
              }}
              disabled={loading}
              className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={onSearch}
              disabled={loading || !cadastralInput.trim()}
              className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? t("form.cadastralSearching") : t("form.cadastralSearch")}
            </button>
          </div>

          {error && (
            <p className="mt-2 text-xs font-medium text-red-600">
              {t(`form.${error}`)}
            </p>
          )}

          {data && !error && !data.partial && (
            <div className="mt-2 rounded-lg border border-emerald-200 bg-white px-3 py-2">
              <p className="text-xs font-semibold text-emerald-700">
                {t("form.cadastralFound")}
              </p>
              {data.apartment?.address && (
                <p className="mt-1 text-xs text-emerald-700">
                  {data.apartment.address}
                </p>
              )}
            </div>
          )}

          {data && !error && data.partial && (
            <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
              <p className="text-xs font-semibold text-sky-700">
                {t("form.cadastralPartial")}
              </p>
              {data.location?.display_name && (
                <p className="mt-1 text-xs text-sky-700">
                  {data.location.display_name}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ValuationPdfDialog({ open, data, accessToken = null, onAuthRequired = null, onClose }) {
  const { t, lang } = useTranslation();
  const [options, setOptions] = useState(() => createInitialOptions(data));
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [purchaseOffer, setPurchaseOffer] = useState(null);
  const [showCadastralInput, setShowCadastralInput] = useState(false);
  const [cadastralInput, setCadastralInput] = useState("");
  const [cadastralLoading, setCadastralLoading] = useState(false);
  const [cadastralError, setCadastralError] = useState(null);
  const [addedCadastral, setAddedCadastral] = useState(null);
  const [addedCadastralNumber, setAddedCadastralNumber] = useState("");
  const reportData = useMemo(
    () => (addedCadastral ? { ...data, cadastral: addedCadastral } : data),
    [addedCadastral, data]
  );
  const available = useMemo(() => getAvailableSections(reportData), [reportData]);

  useEffect(() => {
    if (!open) return;
    setOptions(createInitialOptions(data));
    setError("");
    setPurchaseOffer(null);
    setShowCadastralInput(false);
    setCadastralInput("");
    setCadastralLoading(false);
    setCadastralError(null);
    setAddedCadastral(null);
    setAddedCadastralNumber("");
  }, [data, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  const input = data?.input || {};
  const cityLabel = input.city ? t(`data.city.${input.city}`) : "catdai";
  const districtLabel = input.district ? t(`data.district.${input.district}`) : "";
  const fileDate = new Date().toISOString().slice(0, 10);
  const fileNameParts = ["catdai-evaluare", cityLabel, districtLabel, fileDate]
    .map(sanitizeFilePart)
    .filter(Boolean);
  const fileName = `${fileNameParts.join("-")}.pdf`;

  const setOption = (key, value) => {
    setOptions((current) => ({ ...current, [key]: value }));
  };

  const handleCadastralSearch = async () => {
    if (!accessToken) {
      setCadastralError("cadastralAuthRequired");
      onAuthRequired?.();
      return;
    }

    const validation = validateCadastralNumber(cadastralInput);
    if (!validation.valid) {
      setCadastralError("cadastralInvalid");
      return;
    }

    setCadastralError(null);
    setCadastralLoading(true);

    try {
      const res = await fetch("/api/cadastral", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ cadastral_number: validation.value }),
      });
      const payload = await res.json();

      if (!res.ok) {
        if (res.status === 401 || payload.error === "unauthorized") {
          setCadastralError("cadastralAuthRequired");
          onAuthRequired?.();
        } else if (payload.error === "not_found") {
          setCadastralError("cadastralNotFound");
        } else if (payload.error === "invalid_format") {
          setCadastralError("cadastralInvalid");
        } else {
          setCadastralError("cadastralError");
        }
        return;
      }

      const cadastral = {
        building: payload.building,
        apartment: payload.apartment,
        location: payload.location,
        partial: payload.partial || false,
      };
      setAddedCadastral(cadastral);
      setAddedCadastralNumber(validation.value);
      if (!cadastral.partial) {
        setOptions((current) => ({ ...current, cadastral: true }));
      }
    } catch {
      setCadastralError("cadastralError");
    } finally {
      setCadastralLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setError("");
    setPurchaseOffer(null);

    try {
      const authorization = await authorizePdfGeneration(
        accessToken,
        buildPdfReportKey({ data: reportData, options, addedCadastralNumber })
      );
      if (!authorization.authorized && authorization.reason === "auth") {
        setError(t("result.loginToGeneratePdf"));
        onAuthRequired?.();
        return;
      }
      if (!authorization.authorized && authorization.reason === "credit") {
        setPurchaseOffer(authorization.purchase || { product_key: "standard_pack" });
        return;
      }

      const canvases = await buildReportCanvases({
        data: reportData,
        options,
        t,
        lang,
        qrUrl: buildQrUrl(addedCadastralNumber),
      });
      downloadCanvasesAsPdf({ canvases, fileName });
      trackPdfGeneration({
        accessToken,
        estimateLogId: data?.tracking?.estimate_log_id || null,
        includedCadastral: Boolean(options.cadastral && available.cadastral),
      });
      onClose();
    } catch (err) {
      console.error("Valuation PDF generation failed", err);
      setError(t("result.pdfError"));
    } finally {
      setIsGenerating(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="valuation-pdf-title"
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="valuation-pdf-title" className="text-lg font-bold text-gray-900">
              {t("result.pdfDialogTitle")}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {t("result.pdfDialogDesc")}
            </p>
            <a
              href={DEMO_PDF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex text-sm font-semibold text-primary hover:text-primary/80"
            >
              {t("result.pdfDemoLink")}
            </a>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="space-y-2.5">
          <PdfOption
            checked={options.qr}
            label={t("result.pdfOptionQr")}
            detail={t("result.pdfOptionQrDetail")}
            onChange={(value) => setOption("qr", value)}
          />
          <PdfOption
            checked={options.seller}
            disabled={!available.seller}
            label={t("result.pdfOptionSeller")}
            detail={!available.seller ? t("result.pdfOptionUnavailable") : null}
            onChange={(value) => setOption("seller", value)}
          />
          <PdfOption
            checked={options.cadastral}
            disabled={!available.cadastral}
            label={t("result.pdfOptionCadastral")}
            detail={!available.cadastral ? t("result.pdfOptionUnavailable") : null}
            onChange={(value) => setOption("cadastral", value)}
          />
          {!available.cadastral && (
            <CadastralPrompt
              t={t}
              showInput={showCadastralInput}
              onShowInput={() => setShowCadastralInput(true)}
              cadastralInput={cadastralInput}
              onInputChange={(value) => {
                setCadastralInput(value);
                if (cadastralError) setCadastralError(null);
                if (addedCadastral) {
                  setAddedCadastral(null);
                  setAddedCadastralNumber("");
                }
              }}
              onSearch={handleCadastralSearch}
              loading={cadastralLoading}
              error={cadastralError}
              data={addedCadastral}
            />
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        {purchaseOffer && (
          <FeaturePricingAction offer={purchaseOffer} className="mt-4" />
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            {t("result.pdfCancel")}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
          >
            {isGenerating && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {isGenerating ? t("result.pdfGenerating") : t("result.pdfGenerate")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
