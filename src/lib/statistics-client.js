import { supabase } from "@/lib/supabase";

// Tracking and secondary lookups must carry auth too; otherwise an admin's
// browser is indistinguishable from an anonymous visitor on these endpoints.
export async function fetchWithStatisticsAuth(url, options = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const headers = new Headers(options.headers);
  if (data?.session?.access_token) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  return fetch(url, { ...options, headers });
}
