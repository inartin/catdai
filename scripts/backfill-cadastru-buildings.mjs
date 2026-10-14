// pnpm exec node --experimental-vm-modules scripts/backfill-cadastru-buildings.mjs [--apply] [--normalize]
// Copy/link is safe before deployment. --normalize removes legacy duplicates after deployment.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { loadAppModule } from "./lib/load-app-module.mjs";

nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes("--apply");
const normalize = process.argv.includes("--normalize");
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const overrides = {
  "@/lib/supabase-admin": { supabaseAdmin: db },
  "@/lib/runtime-persistence": { shouldPersistRuntimeData: () => true },
  "@/lib/cache": { getSharedCache: async () => null, setSharedCache: async () => true },
};
const buildings = await loadAppModule("@/lib/cadastru-buildings", overrides);
const records = normalize ? await loadAppModule("@/lib/cadastru-records", overrides) : null;
let scanned = 0, linked = 0, skipped = 0;
for (let offset = 0; ; offset += 250) {
  const { data, error } = await db.from("cadastru_records").select("*").order("id").range(offset, offset + 249);
  if (error) throw error;
  for (const row of data) {
    scanned++;
    const parent = buildings.apartmentBuildingNumber(row.cadastral_number);
    if (!parent || (!buildings.isApartmentBlock(row.building_data) && !row.shared_building_number)
      || String(row.raw_payload?.source || "").includes("derived")
      || (row.building_cadastral_number && row.building_cadastral_number !== parent)) { skipped++; continue; }
    if (apply) {
      const fetchedAt = row.last_official_fetch_at || row.data_updated_at || row.saved_at;
      const saved = row.shared_building_number && !buildings.isApartmentBlock(row.building_data)
        ? await buildings.getSharedBuilding(parent)
        : await buildings.storeSharedBuilding(parent, row.building_data, {
          address: row.full_address, mapLocation: row.raw_payload?.map_location,
          fetchedAt, expiresAt: row.next_refresh_after,
        });
      if (!saved) throw new Error(`Building backfill failed at record ${row.id}`);
      const { error: linkError } = await db.from("cadastru_records").update({ shared_building_number: parent }).eq("id", row.id);
      if (linkError) throw linkError;
      if (normalize) {
        const result = await records.persistCadastruRecord(row.raw_payload, {
          countLookup: false, officialFetch: false, lookupSource: row.lookup_source,
        });
        if (!result) throw new Error(`Normalization failed at record ${row.id}`);
        const { error: aliasError } = await db.from("cadastru_address_aliases")
          .update({ raw_payload: { cadastral_number: row.cadastral_number } }).eq("cadastral_number", row.cadastral_number);
        if (aliasError) throw aliasError;
      }
    }
    linked++;
  }
  if (data.length < 250) break;
}
console.log(JSON.stringify({ mode: apply ? (normalize ? "normalize" : "copy-and-link") : "dry-run", scanned, linked, skipped }));
