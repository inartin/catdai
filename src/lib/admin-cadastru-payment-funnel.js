import { applyAdminPeriod } from "@/lib/admin-periods";
import { featureResultPath } from "@/lib/guest-checkout.mjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeVisitorId } from "@/lib/visitor";

const READ_SIZE = 1000;
const ORIGIN = "https://catdai.local";
const CADASTRU_RESULT_PATH = /^\/(?:ro\/|ru\/|en\/)?cadastru\/rezultat\/?$/;

function isCadastruResult(path) {
  const result = featureResultPath(path);
  if (!result) return false;
  const url = new URL(result, ORIGIN);
  return CADASTRU_RESULT_PATH.test(url.pathname) && !url.searchParams.has("share_slug");
}

function openedCadastruPaywall(row) {
  if (row.event_type === "checkout_popup_opened") {
    return (row.source_product_key || row.product_key) === "cadastru_lookup_single" && isCadastruResult(row.path);
  }
  if (row.event_type !== "checkout_page_opened" || !row.product_key || !row.path?.startsWith("/payment/")) return false;
  const checkout = new URL(row.path, ORIGIN);
  return checkout.searchParams.get("checkout_source") !== "pricing" && isCadastruResult(checkout.searchParams.get("return_to"));
}

function browserId(row) {
  return normalizeVisitorId(row.visitor?.device_id) || normalizeVisitorId(row.device_id);
}

function summarizeFunnel(searches, checkoutEvents, payments, users) {
  const accountByBrowser = new Map();
  for (const rows of [searches, checkoutEvents]) {
    for (const row of rows) {
      if (!row.user_id || row.visitor?.device_type === "Bot") continue;
      const browser = browserId(row);
      if (!browser) continue;
      if (!accountByBrowser.has(browser)) accountByBrowser.set(browser, row.user_id);
      else if (accountByBrowser.get(browser) !== row.user_id) accountByBrowser.set(browser, null);
    }
  }

  function identity(row) {
    if (row.visitor?.device_type === "Bot") return null;
    const browser = browserId(row);
    const account = row.user_id || accountByBrowser.get(browser);
    if (account) return users.get(account)?.app_metadata?.catdai_is_admin === true ? null : `account:${account}`;
    return browser ? `browser:${browser}` : null;
  }

  // Event reads are chronological. Retain each visitor's first qualifying step.
  const searched = new Map();
  for (const row of searches) {
    const visitor = identity(row);
    if (visitor && !searched.has(visitor)) searched.set(visitor, Date.parse(row.created_at));
  }
  const opened = new Map();
  for (const row of checkoutEvents) {
    const visitor = identity(row);
    if (!searched.has(visitor) || opened.has(visitor) || !openedCadastruPaywall(row)) continue;
    const at = Date.parse(row.created_at);
    if (at >= searched.get(visitor)) opened.set(visitor, at);
  }
  const purchased = new Set();
  for (const row of payments) {
    const visitor = identity(row);
    if (opened.has(visitor) && Date.parse(row.paid_at) >= opened.get(visitor)) purchased.add(visitor);
  }

  return { searched: searched.size, opened: opened.size, purchased: purchased.size };
}

async function readEvents(range, buildQuery) {
  const rows = [];
  for (let from = 0; ; from += READ_SIZE) {
    const { data, error } = await applyAdminPeriod(buildQuery(), "created_at", range)
      .order("created_at").order("id").range(from, from + READ_SIZE - 1);
    if (error || !data) throw new Error(error?.message || "Missing funnel events");
    rows.push(...data);
    if (data.length < READ_SIZE) return rows;
  }
}

export async function loadCadastruPaymentFunnel(range, payments, users) {
  const [searches, checkoutEvents] = await Promise.all([
    readEvents(range, () => supabaseAdmin.from("cadastru_search_events")
      .select("id,user_id,visitor,created_at")
      .is("duplicate_of", null)
      .or("result_cadastru.eq.true,result_type.in.(full_data,apartment_only,land_only,address_only)")),
    readEvents(range, () => supabaseAdmin.from("payment_checkout_events")
      .select("id,user_id,visitor,device_id,created_at,event_type,product_key,source_product_key,path")
      .in("event_type", ["checkout_popup_opened", "checkout_page_opened", "checkout_order_created"])),
  ]);
  return summarizeFunnel(searches, checkoutEvents, payments, users);
}
