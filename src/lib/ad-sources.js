// Shared by entry capture, event validation and the admin report.
export const AD_TRACKING_SOURCES = {
  zdg: { label: "ZDG", entryPath: "/?src=zdg", param: "src" },
  zdg2: { label: "ZDG2", entryPath: "/ro/cadastru?src=zdg2", param: "src" },
  reddit: { label: "Reddit", entryPath: "/?utm_source=reddit", param: "utm_source" },
  vtememd: { label: "vtememd", entryPath: "/?utm_source=vtememd", param: "utm_source" },
  "999": { label: "999.md", entryPath: "/?src=999", param: "src" },
};

export function getAdSourceFromParams(params) {
  return Object.keys(AD_TRACKING_SOURCES).find((source) =>
    (params.get(AD_TRACKING_SOURCES[source].param) || "").toLowerCase() === source
  ) || null;
}
