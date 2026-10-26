import crypto from "node:crypto";
import sharp from "sharp";
import { cadastruMapFeatures, cadastruMapLocation } from "@/lib/cadastru-map";
import { mapmdResourceUrl } from "@/lib/mapmd";
import { getSharedCache, setSharedCache } from "@/lib/cache";

const WIDTH = 768;
const HEIGHT = 400;
const TILE_SIZE = 256;
const pending = new Map();

function project([longitude, latitude], zoom) {
  const sine = Math.sin(Math.max(-85.051129, Math.min(85.051129, latitude)) * Math.PI / 180);
  const scale = TILE_SIZE * 2 ** zoom;
  return [(longitude + 180) / 360 * scale, (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale];
}

function camera(features, location) {
  const points = features.flatMap((feature) => (feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates] : feature.geometry.coordinates).flat(2));
  if (!points.length) {
    if (!location) return null;
    const [x, y] = project([location.longitude, location.latitude], 18);
    return { zoom: 18, left: Math.round(x - WIDTH / 2), top: Math.round(y - HEIGHT / 2) };
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of points) {
    const [x, y] = project(point, 0);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  // Keep outlines inside the central square so mobile crops retain the shapes.
  const span = Math.min(WIDTH, HEIGHT) - 128;
  const zoom = Math.max(2, Math.min(18, Math.floor(Math.log2(Math.min(
    span / Math.max(maxX - minX, 0.000001), span / Math.max(maxY - minY, 0.000001),
  )))));
  return { zoom, left: Math.round((minX + maxX) / 2 * 2 ** zoom - WIDTH / 2),
    top: Math.round((minY + maxY) / 2 * 2 ** zoom - HEIGHT / 2) };
}

async function satelliteTemplate() {
  if (!process.env.MAPMD_API) return null;
  try {
    const response = await fetch(mapmdResourceUrl(["styles", "satelite", "style.json"]), {
      headers: { Authorization: `Basic ${Buffer.from(`${process.env.MAPMD_API}:`).toString("base64")}` },
      redirect: "error", signal: AbortSignal.timeout(5000), next: { revalidate: 3600 },
    });
    if (!response.ok) return null;
    const style = await response.json();
    return Object.values(style.sources || {}).filter((source) => source.type === "raster" && source.tileSize === TILE_SIZE)
      .flatMap((source) => source.tiles || []).find((template) => {
        try {
          const url = new URL(template);
          return ["http:", "https:"].includes(url.protocol) && ["mt1.google.com", "mt2.google.com"].includes(url.hostname)
            && !url.username && !url.password && !url.port && url.pathname.startsWith("/vt/");
        } catch { return false; }
      }) || null;
  } catch { return null; }
}

async function background(view) {
  const minX = Math.floor(view.left / TILE_SIZE), minY = Math.floor(view.top / TILE_SIZE);
  const maxX = Math.floor((view.left + WIDTH - 1) / TILE_SIZE), maxY = Math.floor((view.top + HEIGHT - 1) / TILE_SIZE);
  const width = (maxX - minX + 1) * TILE_SIZE, height = (maxY - minY + 1) * TILE_SIZE;
  const template = await satelliteTemplate();
  const requests = [];
  for (let x = minX; template && x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
    if (y < 0 || y >= 2 ** view.zoom) continue;
    requests.push((async () => {
      const url = new URL(template.replace(/\{([zxy])\}/g, (_, key) => String({ z: view.zoom,
        x: ((x % 2 ** view.zoom) + 2 ** view.zoom) % 2 ** view.zoom, y }[key])));
      url.protocol = "https:";
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000), next: { revalidate: 3600 } });
      if (!response.ok || Number(response.headers.get("content-length")) > 2_000_000) throw new Error("Tile unavailable");
      const input = Buffer.from(await response.arrayBuffer());
      if (input.length > 2_000_000) throw new Error("Tile too large");
      const tile = await sharp(input, { limitInputPixels: 1_048_576 }).resize(TILE_SIZE, TILE_SIZE).png().toBuffer();
      return { input: tile, left: (x - minX) * TILE_SIZE, top: (y - minY) * TILE_SIZE };
    })());
  }
  const tiles = (await Promise.allSettled(requests)).filter((result) => result.status === "fulfilled").map((result) => result.value);
  const mosaic = await sharp({ create: { width, height, channels: 3, background: "#d1d5db" } })
    .composite(tiles).png().toBuffer();
  return sharp(mosaic).extract({ left: view.left - minX * TILE_SIZE, top: view.top - minY * TILE_SIZE,
    width: WIDTH, height: HEIGHT }).png().toBuffer();
}

function outlines(features, view, location) {
  const paths = features.map((feature) => {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const d = polygons.map((polygon) => polygon.map((ring) => ring.map((point, index) => {
      const [x, y] = project(point, view.zoom);
      return `${index ? "L" : "M"}${(x - view.left).toFixed(2)},${(y - view.top).toFixed(2)}`;
    }).join(" ") + "Z").join(" ")).join(" ");
    const color = feature.properties.kind === "building" ? "#fbbf24" : "#34d399";
    return `<path d="${d}" fill="${color}" fill-opacity="0.35" fill-rule="evenodd" stroke="${color}" stroke-width="7"/>`;
  });
  if (!features.length && location) {
    const [x, y] = project([location.longitude, location.latitude], view.zoom);
    paths.push(`<circle cx="${(x - view.left).toFixed(2)}" cy="${(y - view.top).toFixed(2)}" r="14" fill="#047857" stroke="white" stroke-width="4"/>`);
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${paths.join("")}</svg>`);
}

export async function renderCadastruMapPreview(payload) {
  const features = cadastruMapFeatures(payload).features;
  const location = cadastruMapLocation(payload);
  const view = camera(features, location);
  if (!view) return null;
  const key = `catdai:cadastru-map-preview:v1:${crypto.createHash("sha256").update(JSON.stringify([features, location])).digest("hex")}`;
  const cached = await getSharedCache(key);
  if (typeof cached?.value?.image === "string") return Buffer.from(cached.value.image, "base64");
  if (!pending.has(key)) pending.set(key, (async () => {
    // Flatten first: sharp applies filters before composition in a single pipeline.
    // The original pixels and SVG never leave the server or enter the preview cache.
    const flattened = await sharp(await background(view)).composite([{ input: outlines(features, view, location) }]).png().toBuffer();
    const image = await sharp(flattened).resize(WIDTH / 2, HEIGHT / 2).blur(5).webp({ quality: 65 }).toBuffer();
    await setSharedCache(key, { image: image.toString("base64") }, 3600);
    return image;
  })().finally(() => pending.delete(key)));
  return pending.get(key);
}
