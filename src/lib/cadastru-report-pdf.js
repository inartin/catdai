import { canvasToPdfPage, createPdfPageCanvas, downloadPdfPages, PDF_CANVAS_HEIGHT, PDF_CANVAS_WIDTH } from "./browser-pdf.js";
import { cadastruPropertyDetails } from "./cadastru-property-details.js";
import { cadastruValueLabel } from "./cadastru-value-labels.js";

const MARGIN = 46;
const WIDTH = PDF_CANVAS_WIDTH - MARGIN * 2;
const BOTTOM = PDF_CANVAS_HEIGHT - 66;
const INK = "#111827";
const MUTED = "#4b5563";
const GREEN = "#047857";
const BORDER = "#e5e7eb";
const SERIES_COLORS = [GREEN, "#305da8"];

function wrappedLines(ctx, text, width) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const char of word) {
      if (line && ctx.measureText(line + char).width > width) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function createReport(logo, t, reportDate) {
  const pages = [];
  let { canvas, ctx } = createPdfPageCanvas();
  let y = 0;
  const font = (size, bold) => `${bold ? 700 : 400} ${size}px Arial, Helvetica, sans-serif`;
  const draw = (text, x, top, size, color, bold = false) => {
    ctx.font = font(size, bold);
    ctx.textBaseline = "top";
    ctx.fillStyle = color;
    ctx.fillText(text, x, top);
  };
  const rule = (top) => {
    ctx.fillStyle = BORDER;
    ctx.fillRect(MARGIN, top, WIDTH, 1);
  };
  const header = () => {
    let brandX = MARGIN;
    if (logo) {
      const logoWidth = 32 * logo.naturalWidth / logo.naturalHeight;
      ctx.drawImage(logo, MARGIN, 36, logoWidth, 32);
      brandX += logoWidth + 10;
    }
    draw("catdai.md", brandX, 41, 20, GREEN, true);
    ctx.font = font(13, false);
    draw(reportDate, PDF_CANVAS_WIDTH - MARGIN - ctx.measureText(reportDate).width, 45, 13, MUTED);
    rule(82);
    y = 102;
  };
  const finishPage = (lastPage = false) => {
    const footerY = BOTTOM + 27;
    rule(BOTTOM + 14);
    const footer = lastPage ? t("cadastru.pdfDisclaimer") : "catdai.md";
    ctx.font = font(12, false);
    wrappedLines(ctx, footer, WIDTH - 46).forEach((line, index) => {
      draw(line, MARGIN, footerY + index * 15, 12, MUTED);
    });
    draw(String(pages.length + 1), PDF_CANVAS_WIDTH - MARGIN - 26, footerY, 12, MUTED);
    pages.push(canvasToPdfPage(canvas));
    canvas.width = 0;
  };
  const ensure = (height) => {
    if (y + height <= BOTTOM) return;
    finishPage();
    ({ canvas, ctx } = createPdfPageCanvas());
    header();
  };
  const paragraph = (text, { size = 14, bold = false, color = INK, gap = 6 } = {}) => {
    if (text === null || text === undefined || text === "") return;
    ctx.font = font(size, bold);
    const lineHeight = Math.ceil(size * 1.35);
    for (const line of wrappedLines(ctx, text, WIDTH)) {
      ensure(lineHeight);
      draw(line, MARGIN, y, size, color, bold);
      y += lineHeight;
    }
    y += gap;
  };
  const propertyNumber = (value) => {
    ctx.fillStyle = "#ecfdf5";
    ctx.fillRect(MARGIN, y, WIDTH, 78);
    ctx.fillStyle = GREEN;
    ctx.fillRect(MARGIN, y, 4, 78);
    draw(t("cadastru.numberLabel"), MARGIN + 20, y + 12, 12, GREEN, true);
    draw(value, MARGIN + 20, y + 30, 32, INK, true);
    y += 92;
  };
  const heading = (text, section = false, keepWith = 17) => {
    const size = section ? 21 : 16;
    ctx.font = font(size, true);
    const spacing = section ? 38 : 17;
    ensure(wrappedLines(ctx, text, WIDTH).length * Math.ceil(size * 1.35) + spacing + keepWith);
    y += section ? 17 : 9;
    if (section) {
      rule(y);
      y += 13;
    }
    paragraph(text, { size, color: GREEN, bold: true, gap: 8 });
  };
  const rows = (items, { gap = 6 } = {}) => {
    for (const [index, [label, value]] of items.entries()) {
      ctx.font = font(14, false);
      const labelLines = wrappedLines(ctx, label, 222);
      const valueLines = wrappedLines(ctx, value, WIDTH - 246);
      const lineCount = Math.max(labelLines.length, valueLines.length);
      if (lineCount * 19 < BOTTOM - 102) ensure(lineCount * 19 + gap);
      for (let i = 0; i < lineCount; i += 1) {
        ensure(19);
        if (labelLines[i]) draw(labelLines[i], MARGIN, y, 14, MUTED);
        if (valueLines[i]) draw(valueLines[i], MARGIN + 246, y, 14, INK);
        y += 19;
      }
      if (index < items.length - 1) rule(y);
      y += gap;
    }
  };
  const image = (source) => {
    const height = Math.min(310, WIDTH * source.height / source.width);
    const width = height * source.width / source.height;
    ensure(height + 45);
    ctx.drawImage(source, MARGIN + (WIDTH - width) / 2, y, width, height);
    y += height + 10;
  };
  const chart = (series, date, number) => {
    const points = series.flatMap((line) => line.points);
    const from = Math.min(...points.map((point) => point.time));
    const until = Math.max(...points.map((point) => point.time));
    const low = Math.min(...points.map((point) => point.value));
    const high = Math.max(...points.map((point) => point.value));
    const left = MARGIN + 68;
    const plotWidth = WIDTH - 78;
    ensure(200);
    const top = y + 15;
    for (const [index, value] of [high, (high + low) / 2, low].entries()) {
      const gridY = top + index * 50;
      ctx.fillStyle = BORDER;
      ctx.fillRect(left, gridY, plotWidth, 1);
      if (high !== low || index === 1) draw(number.format(value), MARGIN, gridY - 7, 12, MUTED);
    }
    series.forEach((line, index) => {
      ctx.beginPath();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = SERIES_COLORS[index % SERIES_COLORS.length];
      line.points.forEach((point, i) => {
        const x = left + (point.time - from) / Math.max(1, until - from) * plotWidth;
        const pointY = top + (high === low ? 50 : (high - point.value) / (high - low) * 100);
        if (i === 0) ctx.moveTo(x, pointY);
        else ctx.lineTo(x, pointY);
      });
      ctx.stroke();
    });
    draw(date(from), left, top + 112, 12, MUTED);
    ctx.font = font(12, false);
    const endDate = date(until);
    draw(endDate, left + plotWidth - ctx.measureText(endDate).width, top + 112, 12, MUTED);
    y = top + 137;
    series.forEach((line, index) => paragraph(line.label, { size: 12, color: SERIES_COLORS[index % SERIES_COLORS.length] }));
  };
  header();
  paragraph(t("cadastru.pdfTitle"), { size: 34, bold: true, gap: 8 });
  return {
    paragraph, propertyNumber, heading, rows, image, chart,
    download(fileName) {
      finishPage(true);
      downloadPdfPages({ pages, fileName });
    },
  };
}

function drawProperty(report, cadastral, { lang, t }) {
  const details = cadastruPropertyDetails(cadastral, { lang, t });
  const drawRows = (title, rows, number) => {
    const present = rows.filter(([field, , value]) => field !== "cadastral_number" && value !== null && value !== undefined && value !== "");
    if (!present.length && !number) return;
    report.heading(number ? `${title} · ${number}` : title);
    report.rows(present.map(([field, label, value]) => [label, cadastruValueLabel(value, field, lang)]));
  };
  if (cadastral.cadastral_number) report.propertyNumber(cadastral.cadastral_number);
  const address = details.displayAddress || cadastral.resolved_address || cadastral.request_address;
  if (address) report.paragraph(address, { bold: true });
  report.heading(t("result.cadastralDataTitle"), true);
  drawRows(t("form.cadastralApartment"), details.apartmentRows);
  drawRows(t("form.cadastralBuilding"), details.buildingRows);
  for (const [items, label] of [[details.lands, "form.cadastralLand"], [details.buildings, "form.cadastralConstruction"]]) {
    items.forEach(({ cadastral_number, rows }, index) => {
      const title = `${t(label)}${items.length > 1 ? ` ${index + 1}` : ""}`;
      drawRows(title, rows, cadastral_number);
    });
  }
  if (cadastral.registry_unavailable) report.paragraph(t("cadastru.registryUnavailablePartial"));
  if (Object.values(cadastral.data_freshness || {}).some((section) => section?.stale)) {
    report.paragraph(t("cadastru.savedDataStale"));
  }
  report.paragraph("ipcbi.gov.md", { size: 12, color: MUTED });
}

function drawNearby(report, nearby, { t, number }) {
  report.heading(t("cadastru.nearbyTitle"), true);
  if (!nearby) {
    report.paragraph(t("cadastru.nearbyUnavailable"));
    return;
  }
  const groups = ["schools", "supermarkets", "pharmacies", "food", "parks", "public_transport"]
    .map((key) => [key, (nearby.categories?.[key]?.places || []).filter((place) => !place.locked)])
    .filter(([, places]) => places.length);
  if (!groups.length) report.paragraph(t("cadastru.nearbyEmpty"));
  for (const [key, places] of groups) {
    report.heading(t(`cadastru.nearby.${key}`));
    report.rows(places.map((place) => [
      place.name || t("cadastru.nearbyUnnamed"),
      t("cadastru.nearbyWalk", {
        minutes: place.walking_duration_min, distance: number.format(place.walking_distance_m),
      }),
    ]));
  }
  if (nearby.cache?.stale) report.paragraph(t("cadastru.savedDataStale"));
  if (nearby.incomplete) report.paragraph(t("cadastru.nearbyIncomplete"));
  report.paragraph("© OpenStreetMap contributors · Powered by Geoapify", { size: 12, color: MUTED });
}

function drawTransport(report, transport, { t }) {
  report.heading(t("cadastru.transportTitle"), true);
  if (!transport) {
    report.paragraph(t("cadastru.transportUnavailable"));
    return;
  }
  const groups = (transport.route_groups || [])
    .map(({ mode, routes }) => ({ mode, routes: routes?.filter((route) => !route.locked) || [] }))
    .filter(({ routes }) => routes.length);
  if (!groups.length) report.paragraph(t("cadastru.transportEmpty"));
  if (groups.length && transport.scope === "locality") {
    report.heading(t("cadastru.transportLocalityRoutes"));
    report.paragraph(t("cadastru.transportLocalityNote"));
  }
  for (const group of groups) {
    const mode = t(`cadastru.transportMode.${group.mode}`);
    report.heading(mode.startsWith("cadastru.") ? t("cadastru.transportMode.unknown") : mode);
    report.rows(group.routes.map(({ ref, name }) => [ref, name === ref ? "" : name || ""]));
  }
  if (transport.cache?.stale) report.paragraph(t("cadastru.savedDataStale"));
  if (transport.incomplete) report.paragraph(t("cadastru.transportIncomplete"));
}

function drawMunicipalSummary(report, reports, { t, number, date }) {
  report.heading(t("cadastru.reportsTitle"), true);
  if (!reports) {
    report.paragraph(t("cadastru.reportsUnavailable"));
    return;
  }
  report.paragraph(t("cadastru.reportsPeriod", { years: reports.period.years }));
  const nearbyLabel = Number.isFinite(reports.search_radius_m)
    ? t("cadastru.reportsNearby", { distance: number.format(reports.search_radius_m) })
    : t("cadastru.reportsCountNearby");
  const counts = [
    [t("cadastru.reportsCountAddress"), reports.summary.at_address],
    [nearbyLabel, reports.summary.nearby],
    [t("cadastru.reportsCountSolved"), reports.summary.solved],
  ];
  report.rows(counts.filter(([, value]) => value != null).map(([label, value]) => [label, number.format(value)]));
  if (!reports.summary.total) report.paragraph(t("cadastru.reportsEmpty"));
  if (reports.cache?.stale) report.paragraph(t("cadastru.reportsStale"));
  report.paragraph(t("cadastru.reportsSource"), { size: 12, color: MUTED });
  if (reports.cache?.fetched_at) report.paragraph(t("cadastru.reportsChecked", { date: date(reports.cache.fetched_at) }), { size: 12, color: MUTED });
}

function drawMarket(report, market, { t, number, date }) {
  if (!market) return;
  const label = (key) => t(`cadastru.market.${key}`);
  const money = (price) => `${number.format(price)} €`;
  const unitPrice = ({ pricePerM2, price, area }) => pricePerM2 ?? (area ? Math.round(price / area) : null);
  const trend = market.buildingTrend || market.areaTrend;
  const series = (trend?.series || []).map((line) => ({
    label: label(line.key),
    points: (line.points || []).map(({ date: day, value }) => ({ time: Date.parse(day), value }))
      .filter(({ time, value }) => Number.isFinite(time) && Number.isFinite(value) && value > 0)
      .sort((a, b) => a.time - b.time),
  })).filter((line) => line.points.length >= 2);
  const listings = market.listings || [];
  if (!listings.length && !series.length) return;
  report.heading(label("title"), true, 76);
  if (market.address) report.paragraph(market.address, { bold: true });
  if (market.collectedCount > 0) report.paragraph(`${number.format(market.collectedCount)} ${label("collectedListings")}`);
  if (series.length) {
    report.heading(`${trend.scope === "building" ? label("buildingTrend") : label("areaTrend")} · ${trend.name}`, false, 225);
    report.paragraph(label("axisUnit"), { size: 12, color: MUTED });
    report.chart(series, date, number);
  }
  for (const house of market.houses || []) {
    for (const [active, status] of [[true, "active"], [false, "archive"]]) {
      const group = listings.filter((listing) => listing.house === house.id && listing.active === active);
      if (!group.length) continue;
      report.heading(`${house.address} · ${label(status)} (${number.format(group.length)})`);
      const rows = [];
      const unitPrices = group.map(unitPrice)
        .filter(Number.isFinite).sort((a, b) => a - b);
      if (unitPrices.length) {
        const middle = Math.floor(unitPrices.length / 2);
        const median = Math.round((unitPrices[middle] + unitPrices[Math.ceil(unitPrices.length / 2) - 1]) / 2);
        rows.push([label("medianComparison"), `${money(median)} / m²`]);
      }
      for (const listing of group) {
        const title = [listing.rooms ? `${listing.rooms} ${label("rooms")}` : label("apartment"),
          listing.area ? `${number.format(listing.area)} m²` : null,
        ].filter(Boolean).join(" · ");
        const pricePerM2 = unitPrice(listing);
        const price = pricePerM2 ? `${money(listing.price)} · ${money(pricePerM2)} / m²` : money(listing.price);
        rows.push([title, price]);
      }
      report.rows(rows, { gap: 2 });
    }
  }
  if (listings.length) {
    report.paragraph(label("pdfPriceNote"), { size: 12, color: MUTED });
    report.paragraph(label("duplicateCaveat"), { size: 12, color: MUTED });
    if (market.capturedAt) report.paragraph(`${label("snapshotDate")} ${date(market.capturedAt)}`, { size: 12, color: MUTED });
  }
}

function loadLogo() {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = "/icon0.svg";
  });
}

export async function downloadCadastruReport({ cadastral, mapLocation, captureMap, nearby, transport, reports,
  reportsAvailable, market, lang, t }) {
  if (!cadastral || cadastral.locked_sections?.cadastru_details || cadastral.full_access === false) {
    throw new Error("Cadastral report is locked");
  }
  const locale = lang === "en" ? "en-GB" : lang === "ru" ? "ru-RU" : "ro-MD";
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Europe/Chisinau" });
  const date = (value) => {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? formatter.format(parsed) : "";
  };
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const options = { lang, t, number, date };
  const [logo, mapImage] = await Promise.all([loadLogo(), mapLocation ? captureMap?.() : null]);
  const report = createReport(logo, t, date(new Date()));
  drawProperty(report, cadastral, options);
  if (mapLocation) {
    const { latitude, longitude } = mapLocation;
    report.heading(t("cadastru.mapTitle"), true, mapImage ? Math.min(310, WIDTH * mapImage.height / mapImage.width) + 45 : 42);
    if (mapImage) {
      report.image(mapImage);
      report.paragraph("© map.md", { size: 12, color: MUTED });
    }
    report.paragraph(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
    report.paragraph(`https://www.google.com/maps?q=${latitude},${longitude}`, { size: 12, color: GREEN });
  }
  drawNearby(report, nearby, options);
  drawTransport(report, transport, options);
  if (reportsAvailable) drawMunicipalSummary(report, reports, options);
  drawMarket(report, market, options);
  const id = String(cadastral.cadastral_number || cadastral.lands?.[0]?.cadastral_number || cadastral.buildings?.[0]?.cadastral_number || "")
    .replace(/[^0-9.]/g, "");
  report.download(`catdai-cadastru${id ? `-${id}` : ""}.pdf`);
}
