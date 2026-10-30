import { cookies, headers } from "next/headers";
import { normalizeLanguage } from "@/lib/language";

export async function getRequestLanguage() {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  return normalizeLanguage(requestHeaders.get("x-catdai-lang") || cookieStore.get("catdai-lang")?.value);
}
