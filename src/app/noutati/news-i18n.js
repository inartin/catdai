import { cookies, headers } from "next/headers";
import ro from "@/locales/ro.json";
import ru from "@/locales/ru.json";

export const translations = { ro, ru };

export async function getNewsRequestLanguage() {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const urlLang = requestHeaders.get("x-catdai-lang");
  const cookieLang = cookieStore.get("catdai-lang")?.value;

  if (translations[urlLang]) return urlLang;
  if (translations[cookieLang]) return cookieLang;
  return "ro";
}
