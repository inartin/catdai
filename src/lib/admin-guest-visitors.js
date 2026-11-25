import { supabaseAdmin } from "@/lib/supabase-admin";

const ACCOUNT_BATCH_SIZE = 100;
const PAGE_SIZE = 1000;

export async function loadGuestVisitors(guestIds) {
  const uniqueIds = [...new Set(guestIds)];
  const visitors = new Map();
  for (const table of ["payment_checkout_events", "cadastru_search_events"]) {
    const missingIds = uniqueIds.filter((id) => !visitors.has(id));
    for (let start = 0; start < missingIds.length; start += ACCOUNT_BATCH_SIZE) {
      const batch = missingIds.slice(start, start + ACCOUNT_BATCH_SIZE);
      for (let offset = 0; ; offset += PAGE_SIZE) {
        let query = supabaseAdmin.from(table)
          .select("user_id, visitor")
          .in("user_id", batch)
          .not("visitor", "is", null)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false });
        if (table === "cadastru_search_events") query = query.is("duplicate_of", null);

        const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
        if (error) {
          console.error(`[admin] Guest device details unavailable from ${table}:`, error.message);
          break;
        }
        for (const { user_id, visitor } of data || []) {
          if (visitors.has(user_id) || !(visitor?.device_id || visitor?.device_type || visitor?.os || visitor?.browser)) continue;
          visitors.set(user_id, visitor);
        }
        if (!data || data.length < PAGE_SIZE || batch.every((id) => visitors.has(id))) break;
      }
    }
  }
  return visitors;
}
