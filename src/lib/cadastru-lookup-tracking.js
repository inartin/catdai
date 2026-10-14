// App-side correlation only; these fields never enter the signed worker body.
export function getCadastruLookupTracking(body) {
  const id = body?.lookup_id;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return {};
  return {
    lookupId: id.toLowerCase(),
    lookupQuery: typeof body.lookup_query === "string" ? body.lookup_query.trim().slice(0, 500) : "",
  };
}
