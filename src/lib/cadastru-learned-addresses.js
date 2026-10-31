import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { resolveCadastruSupportedCity } from "@/lib/cadastru-supported-cities";

const clean = value => String(value || "").trim().replace(/\s+/g, " ");
const normalized = value => clean(value).normalize("NFD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").normalize("NFC").toLowerCase();
export function learnedAddress(value) {
  if (!value) return null;
  const city = resolveCadastruSupportedCity(value.city);
  const road = value.roadType || value.road_type || "strada";
  const roadType = ({strada:"str", bulevard:"bd", str:"str", bd:"bd", "str-la":"str-la", sos:"sos"})[road];
  const street = clean(value.street);
  const houseNumber = clean(value.houseNumber || value.house_number).replace(/\s*\/\s*/g, "/").toUpperCase();
  const unit = clean(value.apartmentNumber || value.apartment_number);
  if (!city || !roadType || !street || street.length > 80 || !/^\d{1,4}(?:\/(?:\d{1,4}|[A-Z]))?$/.test(houseNumber)
    || (unit && (!/^\d{1,4}$/.test(unit) || Number(unit) < 1))) return null;
  return {city, roadType, street, houseNumber, apartmentNumber:unit ? String(Number(unit)) : ""};
}
export const learnedAddressKey = address => crypto.createHash("sha256").update(JSON.stringify(
  [address.city, address.roadType, normalized(address.street), address.houseNumber, address.apartmentNumber])).digest("hex");
export function verifiedAddressIdentity(payload, address) {
  if (!payload || payload.apartment_unavailable || payload.registry_unavailable || payload.unit_list_entry
    || /derived/.test(payload.source || "") || payload.access?.mode === "preview") return null;
  const numbers = address.apartmentNumber ? [payload.cadastral_number]
    : [...(payload.lands || []), ...(payload.buildings || [])].map(row => row.cadastral_number);
  const pattern = address.apartmentNumber ? /^\d{7}\.\d{1,4}\.\d{2}\.\d{3,4}$/ : /^\d{7}\.\d{1,4}(?:\.\d{2})?$/;
  if (!numbers.length || numbers.some(number => !pattern.test(number || ""))) return null;
  return [...new Set(numbers)].sort().join("|");
}
export async function getLearnedAddress(input) {
  const address = learnedAddress(input);
  if (!address || !shouldPersistRuntimeData()) return null;
  try {
    const {data,error} = await supabaseAdmin.from("cadastru_learned_addresses").select("address_key,target_address,property_identity,verified_at")
      .eq("address_key", learnedAddressKey(address)).eq("disabled",false).limit(1);
    const row = !error && data?.[0];
    // Old hints resume normal discovery; a read never renews their lifetime.
    if (!row || Date.now() - Date.parse(row.verified_at) > 180 * 86400_000 || !Number.isFinite(Date.parse(row.verified_at))) return null;
    const target = learnedAddress(row.target_address);
    if (!target || target.apartmentNumber !== address.apartmentNumber || learnedAddressKey(target) === learnedAddressKey(address)) return null;
    return {...row, target};
  } catch { return null; }
}
export async function disableLearnedAddress(entry) {
  try { await supabaseAdmin.from("cadastru_learned_addresses").update({disabled:true}).eq("address_key",entry.address_key); }
  catch { /* A failed hint must not prevent the ordinary search. */ }
}
export async function checkLearnedAddress(entry, payload) {
  if (!entry) return;
  const identity = verifiedAddressIdentity(payload, entry.target);
  if (identity && identity === entry.property_identity) return;
  if (identity) await disableLearnedAddress(entry);
  throw Object.assign(new Error("Learned address could not be verified"), {code:"learned_address_unverified"});
}
export async function learnConfirmedAddress(recovery, targetInput, payload) {
  if (!recovery || !shouldPersistRuntimeData()) return;
  const original = learnedAddress(recovery.address), target = learnedAddress(targetInput);
  // A building fallback never teaches an apartment identity.
  if (!original || !target || original.apartmentNumber !== target.apartmentNumber) return;
  const identity = verifiedAddressIdentity(payload,target);
  if (!identity || learnedAddressKey(original) === learnedAddressKey(target)) return;
  try {
    await supabaseAdmin.rpc("learn_cadastru_address", {p_key:learnedAddressKey(original), p_original:original,
      p_target:target, p_identity:identity});
  } catch { /* Learning is optional; keep the successful lookup. */ }
}
export function withLearnedAddress(handler) {
  return async request => {
    let body;
    try { body = await request.clone().json(); } catch { return handler(request); }
    const learned = await getLearnedAddress(body);
    if (!learned) return handler(request);
    const target = learned.target;
    const corrected = {...body, city:target.city, road_type:target.roadType === "bd" ? "bulevard" : target.roadType === "str" ? "strada" : target.roadType,
      street:target.street, house_number:target.houseNumber, apartment_number:target.apartmentNumber};
    delete corrected.suggestion_recovery_token;
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const retry = new Request(request.url, {method:request.method, headers, body:JSON.stringify(corrected), signal:request.signal});
    let response;
    try { response = await handler(retry, {learned}); }
    catch (error) { if (error?.code !== "learned_address_unverified") throw error; }
    if (response?.ok) {
      const payload = await response.json();
      const original = learnedAddress(body);
      payload.request_address = `${original.city}, ${original.roadType} ${original.street} ${original.houseNumber}${original.apartmentNumber ? ` ap ${original.apartmentNumber}` : ""}`;
      payload.resolved_road_type = target.roadType;
      payload.street_resolution = {status:"learned", original:original.street, resolved:target.street};
      return new Response(JSON.stringify(payload), {status:response.status, headers:response.headers});
    }
    if (response && [400,401,403,429].includes(response.status)) return response;
    if (response?.status === 404) await disableLearnedAddress(learned);
    // One retry only: call the ordinary handler directly, never another alias.
    return handler(request);
  };
}
