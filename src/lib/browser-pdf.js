const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
export const PDF_CANVAS_WIDTH = 794;
export const PDF_CANVAS_HEIGHT = Math.round(PDF_CANVAS_WIDTH * (A4_HEIGHT_PT / A4_WIDTH_PT));
export const PDF_CANVAS_SCALE = 2;

function encodeAscii(value) {
  return new TextEncoder().encode(value);
}

function concatBytes(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });

  return output;
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function buildPdfFromJpegs(pages) {
  const chunks = [];
  const offsets = [0];
  let byteOffset = 0;

  const push = (chunk) => {
    const bytes = typeof chunk === "string" ? encodeAscii(chunk) : chunk;
    chunks.push(bytes);
    byteOffset += bytes.length;
  };

  const addObject = (id, body) => {
    offsets[id] = byteOffset;
    push(`${id} 0 obj\n`);
    push(body);
    push("\nendobj\n");
  };

  const addStreamObject = (id, dict, streamBytes) => {
    offsets[id] = byteOffset;
    push(`${id} 0 obj\n`);
    push(`${dict}\nstream\n`);
    push(streamBytes);
    push("\nendstream\nendobj\n");
  };

  const pageObjectIds = pages.map((_, index) => 3 + index * 3);
  const objectCount = 2 + pages.length * 3;

  push("%PDF-1.3\n");
  addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObject(
    2,
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`
  );

  pages.forEach((page, index) => {
    const pageId = 3 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const imageName = `Im${index + 1}`;
    const content = `q\n${A4_WIDTH_PT.toFixed(2)} 0 0 ${A4_HEIGHT_PT.toFixed(2)} 0 0 cm\n/${imageName} Do\nQ`;
    const contentBytes = encodeAscii(content);

    addObject(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH_PT.toFixed(2)} ${A4_HEIGHT_PT.toFixed(2)}] /Resources << /XObject << /${imageName} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    addStreamObject(contentId, `<< /Length ${contentBytes.length} >>`, contentBytes);
    addStreamObject(
      imageId,
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>`,
      page.bytes
    );
  });

  const xrefOffset = byteOffset;
  push(`xref\n0 ${objectCount + 1}\n`);
  push("0000000000 65535 f \n");

  for (let id = 1; id <= objectCount; id += 1) {
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }

  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return concatBytes(chunks);
}

function canvasToPdfPage(canvas) {
  return {
    bytes: dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.94)),
    width: canvas.width,
    height: canvas.height,
  };
}

export function createPdfPageCanvas() {
  if (typeof document === "undefined") {
    throw new Error("PDF generation is only available in the browser");
  }

  const canvas = document.createElement("canvas");
  canvas.width = PDF_CANVAS_WIDTH * PDF_CANVAS_SCALE;
  canvas.height = PDF_CANVAS_HEIGHT * PDF_CANVAS_SCALE;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create PDF canvas");
  }

  ctx.scale(PDF_CANVAS_SCALE, PDF_CANVAS_SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PDF_CANVAS_WIDTH, PDF_CANVAS_HEIGHT);

  return { canvas, ctx };
}

export function downloadCanvasesAsPdf({ canvases, fileName }) {
  if (!Array.isArray(canvases) || canvases.length === 0) {
    throw new Error("PDF needs at least one page");
  }

  const pdfBytes = buildPdfFromJpegs(canvases.map(canvasToPdfPage));
  const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
  const pdfUrl = URL.createObjectURL(pdfBlob);

  try {
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
  }
}
