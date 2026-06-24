export function resolveDisplayLocale(lang) {
  return String(lang || "").trim().toLowerCase() === "ru" ? "ru-RU" : "ro-RO";
}

function capitalizeFirstLetter(value, locale) {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase(locale) + value.slice(1);
}

export function formatLocalizedDate(value, lang, options = {}) {
  if (!value) return "";

  const locale = resolveDisplayLocale(lang);
  try {
    const formatter = new Intl.DateTimeFormat(locale, options);
    return formatter
      .formatToParts(new Date(value))
      .map((part) => (part.type === "month" ? capitalizeFirstLetter(part.value, locale) : part.value))
      .join("");
  } catch {
    return "";
  }
}

const MONTH_NAME_REPLACEMENTS = {
  ro: [
    ["ianuarie|ian\\.", "Ianuarie"],
    ["februarie|feb\\.", "Februarie"],
    ["martie|mar\\.|mart\\.", "Martie"],
    ["aprilie|apr\\.", "Aprilie"],
    ["mai", "Mai"],
    ["iunie|iun\\.", "Iunie"],
    ["iulie|iul\\.", "Iulie"],
    ["august|aug\\.", "August"],
    ["septembrie|sept\\.", "Septembrie"],
    ["octombrie|oct\\.", "Octombrie"],
    ["noiembrie|nov\\.|noi\\.", "Noiembrie"],
    ["decembrie|dec\\.", "Decembrie"],
  ],
  ru: [
    ["января|янв\\.", "Января"],
    ["февраля|февр\\.", "Февраля"],
    ["марта|мар\\.", "Марта"],
    ["апреля|апр\\.", "Апреля"],
    ["мая", "Мая"],
    ["июня|июн\\.", "Июня"],
    ["июля|июл\\.", "Июля"],
    ["августа|авг\\.", "Августа"],
    ["сентября|сент\\.", "Сентября"],
    ["октября|окт\\.", "Октября"],
    ["ноября|нояб\\.", "Ноября"],
    ["декабря|дек\\.", "Декабря"],
  ],
};

export function normalizeLocalizedDateText(value, lang) {
  const text = String(value || "");
  const primaryLang = String(lang || "").trim().toLowerCase() === "ru" ? "ru" : "ro";
  const monthReplacements = [
    ...MONTH_NAME_REPLACEMENTS[primaryLang],
    ...MONTH_NAME_REPLACEMENTS[primaryLang === "ru" ? "ro" : "ru"],
  ];

  return monthReplacements.reduce(
    (current, [pattern, replacement]) => current.replace(new RegExp(`(^|\\d\\s*)(${pattern})(?=\\s|\\d|,|\\.|$)`, "gi"), `$1${replacement}`),
    text
  );
}
