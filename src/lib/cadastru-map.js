export function cadastruMapFeatures(cadastral) {
  const features = [];
  const seen = new Set();
  const add = (property, kind) => {
    const geometry = property?.map_geometry;
    if (!validMapGeometry(geometry)) return;
    const key = JSON.stringify(geometry);
    if (seen.has(key)) return;
    seen.add(key);
    // Do not copy registry fields into the public map layer or its tooltips.
    features.push({ type: "Feature", properties: { kind }, geometry });
  };
  for (const property of Array.isArray(cadastral?.lands) ? cadastral.lands : []) add(property, "land");
  for (const property of Array.isArray(cadastral?.buildings) ? cadastral.buildings : []) add(property, "building");
  add(cadastral?.building, "building");
  // Number records can repeat a building footprint at the top level.
  add(cadastral, "land");
  return { type: "FeatureCollection", features };
}

export function validMapGeometry(geometry) {
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon" ? geometry.coordinates : null;
  if (!Array.isArray(polygons) || !polygons.length) return false;
  let points = 0;
  return polygons.every((polygon) => Array.isArray(polygon) && polygon.length > 0 && polygon.every((ring) => {
    if (!Array.isArray(ring) || ring.length < 4 || (points += ring.length) > 20_000) return false;
    if (!ring.every((point) => Array.isArray(point) && point.length >= 2
      && Number.isFinite(point[0]) && Math.abs(point[0]) <= 180
      && Number.isFinite(point[1]) && Math.abs(point[1]) <= 90)) return false;
    return ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];
  }));
}

export function cadastruMapLocation(cadastral) {
  const location = [cadastral?.map_location, cadastral?.building?.map_location, cadastral?.apartment?.map_location,
    ...(Array.isArray(cadastral?.buildings) ? cadastral.buildings : []).map((item) => item?.map_location),
    ...(Array.isArray(cadastral?.lands) ? cadastral.lands : []).map((item) => item?.map_location),
  ].find((point) => Number.isFinite(point?.latitude) && Math.abs(point.latitude) <= 90
    && Number.isFinite(point?.longitude) && Math.abs(point.longitude) <= 180);
  if (location) return location;
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const feature of cadastruMapFeatures(cadastral).features) {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) for (const [lon, lat] of ring) {
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
  }
  return Number.isFinite(minLon) ? { longitude: (minLon + maxLon) / 2, latitude: (minLat + maxLat) / 2 } : null;
}

const MAP_DATA_FIELDS = new Set(["maplocation", "mapgeometry", "latitude", "longitude", "lat", "lon", "lng",
  "x", "y", "coordinates", "geometry", "geojson", "bbox", "bounds", "boundingbox", "center", "centroid", "point", "wkt",
  "tiles", "tileurl", "tilejson", "mapurl", "maplink", "externalmapurl", "styleurl"]);

// Apply at the response boundary, including cache hits. Saved data stays complete.
export function redactCadastruMapData(value) {
  if (Array.isArray(value)) return value.map(redactCadastruMapData);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && /^(?:https?:\/\/|geo:)/i.test(value)) {
      if (/^geo:/i.test(value) || /(?:[?&](?:lat|lon|lng|ll|center|bbox|coordinates|x|y)=|[?&]q=-?\d|\/@-?\d|\/api\/tiles\/|\/vt\/|\/\d+\/\d+\/\d+\.(?:pbf|png|jpe?g|webp))/i.test(value)) return null;
    }
    return value;
  }
  return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => !MAP_DATA_FIELDS.has(key.replace(/[_-]/g, "").toLowerCase())
      && !(key === "location" && Array.isArray(item)))
    .map(([key, item]) => [key, redactCadastruMapData(item)]));
}
