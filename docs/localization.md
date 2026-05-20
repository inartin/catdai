# Localization

## Stage
Implemented for Romanian and Russian UI.

## How It Works
- Translations live in `src/locales/ro.json` and `src/locales/ru.json`.
- `LanguageProvider` stores selected language in `localStorage`.
- URL prefixes `/ro/...` and `/ru/...` set the language.
- Proxy rewrites localized paths to the base route, except localized FAQ pages.

## UI
- Navbar has RO/RU selector.
- `document.documentElement.lang` follows selected language.
- Localized FAQ routes exist at `/ro/faq` and `/ru/faq`.

## Current Default
Romanian (`ro`).

## Related Files
- `src/context/LanguageContext.js`
- `src/proxy.js`
- `src/components/Navbar.js`
- `src/locales/ro.json`
- `src/locales/ru.json`
