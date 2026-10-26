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
