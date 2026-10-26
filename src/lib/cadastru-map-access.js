import { resolveAccessTier } from "@/lib/access-tier";
import { checkFeatureAccess, makePaidFeatureUsageKey } from "@/lib/paid-feature-usage";

// Secondary requests reuse a purchased lookup; they must never spend a credit.
export async function canReadCadastruMapData(request, { payload, number, address }) {
  // Bind access to the snapshot selected by the route. A caller cannot pair a
  // locked address with a different, already-paid number to expose its map.
  const cadastralNumber = address ? payload?.cadastral_number : number || payload?.cadastral_number;
  const normalizedAddress = String(address || payload?.request_address || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!cadastralNumber && !normalizedAddress) return false;
  try {
    const access = await resolveAccessTier(request);
    if (!access.user_id) return false;
    const credit = await checkFeatureAccess({
      userId: access.user_id,
      featureKey: "cadastru_lookup",
      idempotencyKey: makePaidFeatureUsageKey("cadastru_lookup", cadastralNumber
        ? { cadastral_number: cadastralNumber } : { address: normalizedAddress }),
    });
    return credit.allowed && (credit.reason === "already_consumed" || process.env.NODE_ENV === "development");
  } catch {
    return false;
  }
}
