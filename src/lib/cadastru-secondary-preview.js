import { redactCadastruMapData } from "@/lib/cadastru-map";

// Mask only response copies. Shared snapshots must retain the complete report.
export function buildCadastruNearbyPreview(nearby) {
  const data = redactCadastruMapData(nearby);
  return {
    full_access: false,
    location: data.location,
    cache: data.cache,
    incomplete: data.incomplete,
    map_preview: { available: Number.isFinite(nearby?.location?.latitude) && Number.isFinite(nearby?.location?.longitude) },
    categories: Object.fromEntries(Object.entries(data.categories || {}).map(([category, group]) => [category, {
      available: group.available,
      places: (Array.isArray(group.places) ? group.places : []).map((place, index) => index === 0 ? place : {
        locked: true,
        name: "Locație exemplu",
        walking_distance_m: 480 + index * 120,
        walking_duration_min: 6 + index,
      }),
    }])),
  };
}

export function buildCadastruTransportPreview(transport) {
  const data = redactCadastruMapData(transport);
  return {
    full_access: false,
    scope: data.scope,
    cache: data.cache,
    incomplete: data.incomplete,
    route_groups: (Array.isArray(data.route_groups) ? data.route_groups : []).map((group) => ({
      mode: group.mode,
      routes: (Array.isArray(group.routes) ? group.routes : []).map((route, index) => index === 0 ? route : {
        locked: true,
        ref: String(20 + index),
        name: "Centru - Cartier",
      }),
    })),
  };
}

export function buildCadastruReportsPreview(reports) {
  return {
    full_access: false,
    summary: {
      total: reports.summary.total,
      at_address: reports.summary.at_address,
      nearby: reports.summary.nearby,
      solved: reports.summary.solved,
    },
    period: reports.period,
    cache: reports.cache,
    incomplete: reports.incomplete,
  };
}
