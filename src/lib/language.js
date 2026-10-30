export const LANGUAGES = ["ro", "ru", "en"];
export const OG_LOCALES = { ro: "ro_MD", ru: "ru_MD", en: "en_GB" };

export function normalizeLanguage(value) {
  return LANGUAGES.includes(value) ? value : "ro";
}

export function cadastruLanguageAlternates(path = "/cadastru") {
  return { ro: `/ro${path}`, ru: `/ru${path}`, en: `/en${path}`, "x-default": `/ro${path}` };
}
