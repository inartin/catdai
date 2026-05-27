import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";

const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve("demo-valuation-report.pdf");

const PAGE = { width: 794, height: 1123 };
const A4 = { width: 595.28, height: 841.89 };
const M = 46;
const CW = PAGE.width - M * 2;

const colors = {
  text: "#111827",
  muted: "#6b7280",
  softText: "#4b5563",
  border: "#e5e7eb",
  faintBorder: "#d1fae5",
  soft: "#f9fafb",
  green: "#047857",
  greenDark: "#0f766e",
  greenSoft: "#ecfdf5",
  greenBorder: "#99f6e4",
  white: "#ffffff",
};

const demo = {
  title: "Apartament · 2 camere · 41.9 m²",
  location: "Telecentru, Chișinău",
  cadastralNumber: "0100999.777.03.0420",
  address: "mun. Chișinău, sect. Telecentru str. Exemplu, 14 ap.27",
  marketPrice: "€80 000",
  pricePerM2: "€1 909/m²",
  segmentMedian: "€1 909/m²",
  sellerIndividual: "€77 600",
  sellerAgency: "€83 200",
  sellerMeta: "€1 930/m² · 18 anunțuri",
  sellerDelta: "Diferență vânzător: +€5 600 (+7.2%)",
  footerDisclaimer: "Această analiză este o estimare de piață generată de Catdai. Nu este o evaluare oficială autorizată.",
  demoDisclaimer: "Datele din acest raport nu sunt reale și sunt folosite exclusiv pentru demonstrație.",
};

const propertyRows = [
  ["Oraș", "Chișinău"],
  ["Sector", "Telecentru"],
  ["Camere", "2 camere"],
  ["Suprafață", "41.9 m²"],
  ["Etaj", "Etaj 4/5"],
  ["Tip construcție", "Secundar"],
  ["Starea reparației", "Euroreparație"],
  ["Băi", "1 baie"],
  ["Balcoane", "1 balcon"],
  ["Nr. cadastral", demo.cadastralNumber],
];

const cadastralRows = [
  [["Suprafață", "41.9 m²"], ["Etaj", "Etaj 4/5"]],
  [["Veceu", "Da"], ["Baie", "Da"]],
  [["Ultimul etaj", "Nu"], ["Valoare estimată (Cadastru)", "580 025 lei"]],
  [["Anul construcţiei", "1965"], ["Numărul de etaje", "5"]],
  [["Clasificator", "Bloc cu apartamente"], ["Starea blocului", "Satisfacatoare"]],
  [["Materialul pereților", "piatra de calcar (cotelet)"], ["Apă", "Centrala functioneaza"]],
  [["Canalizare", "Centrala functioneaza"], ["Gaz", "Da"]],
  [["Complet electrificată", "Da"]],
];

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function approxWidth(text, size, weight = 400) {
  return String(text).length * size * (weight >= 700 ? 0.56 : 0.5);
}

function wrap(text, maxWidth, size, weight = 400) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (line && approxWidth(next, size, weight) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

class SvgPage {
  constructor() {
    this.parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.width}" height="${PAGE.height}" viewBox="0 0 ${PAGE.width} ${PAGE.height}">`,
      `<rect width="${PAGE.width}" height="${PAGE.height}" fill="#fff"/>`,
      "<style>text{font-family:Arial, Helvetica, sans-serif;letter-spacing:0}</style>",
    ];
  }

  rect(x, y, width, height, { fill = "none", stroke = "none", strokeWidth = 1, radius = 0 } = {}) {
    this.parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
  }

  line(x1, y1, x2, y2, color = colors.border, width = 1) {
    this.parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"/>`);
  }

  text(value, x, y, { size = 12, weight = 400, color = colors.text, maxWidth = null, lineHeight = Math.round(size * 1.35), align = "start" } = {}) {
    const lines = maxWidth ? wrap(value, maxWidth, size, weight) : String(value).split("\n");
    const anchor = align === "right" ? "end" : align === "center" ? "middle" : "start";
    lines.forEach((line, index) => {
      this.parts.push(`<text x="${x}" y="${y + index * lineHeight}" fill="${color}" font-size="${size}" font-weight="${weight}" dominant-baseline="hanging" text-anchor="${anchor}">${esc(line)}</text>`);
    });
    return y + lines.length * lineHeight;
  }

  image(dataUrl, x, y, width, height) {
    this.parts.push(`<image href="${dataUrl}" x="${x}" y="${y}" width="${width}" height="${height}"/>`);
  }

  finish() {
    return `${this.parts.join("\n")}\n</svg>`;
  }
}

function drawPriceCard(svg, x, y, width, label, value, sub, primary = false) {
  svg.rect(x, y, width, 82, {
    fill: primary ? colors.greenSoft : colors.soft,
    stroke: primary ? colors.greenBorder : colors.border,
    radius: 12,
  });
  svg.text(label, x + 14, y + 14, { size: 11, color: colors.muted });
  svg.text(value, x + 14, y + 36, { size: 23, weight: 800 });
  svg.text(sub, x + 14, y + 65, { size: 11, color: colors.muted });
}

function drawRowsGrid(svg, rows, x, y, width, options = {}) {
  const colGap = 14;
  const colWidth = (width - colGap) / 2;
  const rowHeight = options.rowHeight || 29;
  const rowsPerColumn = Math.ceil(rows.length / 2);
  rows.forEach(([label, value], index) => {
    const col = index >= rowsPerColumn ? 1 : 0;
    const rowIndex = index % rowsPerColumn;
    const rowX = x + col * (colWidth + colGap);
    const rowY = y + rowIndex * rowHeight;
    const labelMaxWidth = options.wideLabels?.includes(label) ? colWidth - 92 : colWidth * 0.45;
    svg.text(label, rowX, rowY + 7, { size: 12, color: colors.muted, maxWidth: labelMaxWidth, lineHeight: 15 });
    svg.text(value, rowX + colWidth, rowY + 7, { size: 12, weight: 700, align: "right", maxWidth: colWidth * 0.5, lineHeight: 15 });
    svg.line(rowX, rowY + rowHeight - 1, rowX + colWidth, rowY + rowHeight - 1, options.dividerColor || colors.border);
  });
  return y + rowsPerColumn * rowHeight + 4;
}

function drawPairedRowsGrid(svg, rowPairs, x, y, width, options = {}) {
  const colGap = 14;
  const colWidth = (width - colGap) / 2;
  const rowHeight = options.rowHeight || 29;

  rowPairs.forEach((pair, rowIndex) => {
    pair.forEach(([label, value], col) => {
      const rowX = x + col * (colWidth + colGap);
      const rowY = y + rowIndex * rowHeight;
      svg.text(label, rowX, rowY + 7, { size: 12, color: colors.muted, lineHeight: 15 });
      svg.text(value, rowX + colWidth, rowY + 7, { size: 12, weight: 700, align: "right", lineHeight: 15 });
      svg.line(rowX, rowY + rowHeight - 1, rowX + colWidth, rowY + rowHeight - 1, options.dividerColor || colors.border);
    });
  });

  return y + rowPairs.length * rowHeight + 4;
}

function ascii(value) {
  return new TextEncoder().encode(value);
}

function concat(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function jpegPdf(jpegBytes) {
  const chunks = [];
  const offsets = [0];
  let byteOffset = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === "string" ? ascii(chunk) : chunk;
    chunks.push(bytes);
    byteOffset += bytes.length;
  };
  const obj = (id, body) => {
    offsets[id] = byteOffset;
    push(`${id} 0 obj\n${body}\nendobj\n`);
  };
  const stream = (id, dict, bytes) => {
    offsets[id] = byteOffset;
    push(`${id} 0 obj\n${dict}\nstream\n`);
    push(bytes);
    push("\nendstream\nendobj\n");
  };

  push("%PDF-1.3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>`);
  stream(4, "<< /Length 47 >>", ascii(`q\n${A4.width} 0 0 ${A4.height} 0 0 cm\n/Im1 Do\nQ`));
  stream(5, `<< /Type /XObject /Subtype /Image /Width ${PAGE.width} /Height ${PAGE.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>`, jpegBytes);

  const xrefOffset = byteOffset;
  push("xref\n0 6\n0000000000 65535 f \n");
  for (let id = 1; id <= 5; id += 1) {
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return concat(chunks);
}

const qrDataUrl = await QRCode.toDataURL("https://catdai.md/", {
  errorCorrectionLevel: "M",
  margin: 1,
  width: 256,
});

const svg = new SvgPage();
let y = 42;

svg.text("catdai.md", M, y + 5, { size: 22, weight: 700, color: colors.softText });
svg.text("Raport de evaluare de piață", M, y + 34, { size: 14, weight: 700, color: "#374151" });
svg.text("Data raportului", PAGE.width - M, y, { size: 11, color: colors.muted, align: "right" });
svg.text(new Date().toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" }), PAGE.width - M, y + 18, { size: 13, weight: 700, align: "right" });
svg.line(M, y + 58, PAGE.width - M, y + 58, colors.text, 2);
y += 80;

const qrSize = 92;
svg.rect(PAGE.width - M - qrSize - 7, y - 9, qrSize + 14, qrSize + 14, { fill: "#fff", stroke: colors.border, radius: 10 });
svg.image(qrDataUrl, PAGE.width - M - qrSize, y - 2, qrSize, qrSize);
svg.text("ANALIZA PIEȚEI", M, y, { size: 10, weight: 800, color: colors.muted });
y += 20;
y = svg.text(demo.title, M, y, { size: 25, weight: 800, maxWidth: CW - qrSize - 24, lineHeight: 31 });
y = svg.text(demo.location, M, y + 6, { size: 14, color: colors.softText, maxWidth: CW - qrSize - 24, lineHeight: 18 });
y = Math.max(y + 18, 42 + 80 - 2 + qrSize + 18);

svg.text("Preț estimat", M, y, { size: 15, weight: 800 });
y += 30;
const priceGap = 10;
const priceWidth = (CW - priceGap) / 2;
drawPriceCard(svg, M, y, priceWidth, "Preț de piață", demo.marketPrice, demo.pricePerM2, true);
drawPriceCard(svg, M + priceWidth + priceGap, y, priceWidth, "Preț median al segmentului", demo.segmentMedian, "× 41.9 m² = €80 000");
y += 100;

svg.text("Rezumat proprietate", M, y, { size: 15, weight: 800 });
y += 28;
y = drawRowsGrid(svg, propertyRows, M, y, CW);
y += 16;

svg.text("Comparație după tipul vânzătorului", M, y, { size: 15, weight: 800 });
y += 30;
drawPriceCard(svg, M, y, priceWidth, "Proprietar", demo.sellerIndividual, demo.sellerMeta);
drawPriceCard(svg, M + priceWidth + priceGap, y, priceWidth, "Agenție / dezvoltator", demo.sellerAgency, demo.sellerMeta);
y += 94;
svg.rect(M, y, CW, 42, { fill: colors.soft, stroke: colors.border, radius: 10 });
svg.text(demo.sellerDelta, M + 12, y + 13, { size: 12, color: colors.softText, maxWidth: CW - 24 });
y += 68;

const panelInset = 14;
const panelY = y;
const rowHeight = 29;
const rowsHeight = cadastralRows.length * rowHeight + 4;
const panelHeight = 16 + 20 + 27 + 8 + rowsHeight + 28 + 16;
svg.rect(M, panelY, CW, panelHeight, { fill: colors.greenSoft, stroke: colors.greenBorder, radius: 12 });
y = panelY + 16;
y = svg.text("Date cadastrale oficiale", M + panelInset, y, { size: 15, weight: 800, color: colors.greenDark });
y = svg.text(demo.address, M + panelInset, y + 6, { size: 14, color: colors.softText, maxWidth: CW - panelInset * 2, lineHeight: 18 });
y += 8;
y = drawPairedRowsGrid(svg, cadastralRows, M + panelInset, y, CW - panelInset * 2, {
  dividerColor: colors.faintBorder,
  wideLabels: ["Valoare estimată (Cadastru)"],
});
svg.text("Sursa: ipcbi.gov.md", M + panelInset, y + 8, { size: 11, weight: 700, color: colors.green });
y = panelY + panelHeight + 14;

svg.line(M, y, PAGE.width - M, y, colors.border);
svg.text(demo.footerDisclaimer, M, y + 10, { size: 10, color: colors.muted, maxWidth: CW - 140, lineHeight: 14 });
svg.text("Sursa: catdai.md", PAGE.width - M, y + 10, { size: 10, weight: 700, color: colors.muted, align: "right" });
svg.text(demo.demoDisclaimer, M, y + 40, { size: 12, weight: 800, color: colors.greenDark, maxWidth: CW, lineHeight: 15 });

const jpeg = await sharp(Buffer.from(svg.finish()))
  .jpeg({ quality: 94 })
  .toBuffer();

fs.writeFileSync(outputPath, jpegPdf(jpeg));
console.log(`Demo PDF generated: ${outputPath}`);
