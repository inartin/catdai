const MAPMD_TILES = "https://map.md/api/tiles/";
const PROXY_PATH = "/api/cadastru/map/";

export function mapmdResourceUrl(parts) {
  if (!Array.isArray(parts) || parts.some((part) => typeof part !== "string" || part.includes("/") || part.includes("\\") || part === "." || part === "..")) return null;
  const path = parts.join("/");
  if (/^styles\/(map|satelite)\/style\.json$/.test(path)
    || /^styles\/osm-bright\/sprite(?:@2x)?\.(json|png)$/.test(path)
    || /^data\/v3\.json$/.test(path)
    || /^fonts\/[\p{L}\p{N} _,-]{1,200}\/\d{1,7}-\d{1,7}\.pbf$/u.test(path)) {
    return MAPMD_TILES + parts.map(encodeURIComponent).join("/");
  }
  const tile = path.match(/^data\/v3\/(\d{1,2})\/(\d{1,9})\/(\d{1,9})\.pbf$/);
  if (!tile) return null;
  const [, z, x, y] = tile.map(Number);
  return z <= 22 && x < 2 ** z && y < 2 ** z ? MAPMD_TILES + path : null;
}

// Rewrite nested style/TileJSON URLs too: fonts, sprites and vector tiles must
// never need the private map.md Basic Auth credential in the browser.
export function proxyMapmdResources(value) {
  if (typeof value === "string" && value.startsWith(MAPMD_TILES)) {
    return PROXY_PATH + value.slice(MAPMD_TILES.length).split("?")[0];
  }
  if (Array.isArray(value)) return value.map(proxyMapmdResources);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, proxyMapmdResources(item)])
  );
  return value;
}
