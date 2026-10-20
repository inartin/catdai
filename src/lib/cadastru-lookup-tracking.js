// App-side correlation only; these fields never enter the signed worker body.
export function normalizeCadastruLookupId(id) {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id.toLowerCase() : null;
}

let searchSessionId;
// Kept out of result URLs so copying a URL to another browser starts a separate journey.
// sessionStorage survives the login redirect without tying identity to authentication.
export function getCadastruSearchSessionId() {
  if (searchSessionId) return searchSessionId;
  try {
    searchSessionId = normalizeCadastruLookupId(sessionStorage.getItem("cadastru-search-session"))
      || crypto.randomUUID();
    sessionStorage.setItem("cadastru-search-session", searchSessionId);
  } catch {
    searchSessionId = crypto.randomUUID();
  }
  return searchSessionId;
}

// Keep the search identity through OAuth redirects and result-page remounts.
// A new form submission or explicit correction supplies a fresh preferred ID.
export function ensureCadastruLookupId(preferredId) {
  const url = typeof window !== "undefined" && window.location?.href ? new URL(window.location.href) : null;
  const id = normalizeCadastruLookupId(preferredId)
    || normalizeCadastruLookupId(url?.searchParams.get("lookup_id")) || crypto.randomUUID();
  if (url && url.searchParams.get("lookup_id") !== id) {
    url.searchParams.set("lookup_id", id);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return id;
}

export function getCadastruLookupTracking(body) {
  const id = normalizeCadastruLookupId(body?.lookup_id);
  if (!id) return {};
  return {
    lookupId: id,
    lookupQuery: typeof body.lookup_query === "string" ? body.lookup_query.trim().slice(0, 500) : "",
  };
}
