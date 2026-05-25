# Localization

## Stage
Implemented for Romanian and Russian UI.

## How It Works
- Translations live in `src/locales/ro.json` and `src/locales/ru.json`.
- `LanguageProvider` stores selected language in `localStorage` and the `catdai-lang` cookie.
- URL prefixes `/ro/...` and `/ru/...` set the language.
- FAQ copy is centralized in `src/lib/faq-content.js`, with separate localized datasets for the full FAQ pages and the landing-page FAQ preview.
- Proxy rewrites localized paths to the base route, except localized FAQ pages.

## UI
- Navbar has RO/RU selector.
- `document.documentElement.lang` follows selected language.
- `/estimeaza` sets a localized browser title from `estimeaza.pageTitle`.
- `/evaluare` sets a localized browser title from `evaluare.pageTitle`.
- `/alerts` sets a localized browser title from `alerts.pageTitle`.
- `/estimeaza`, `/evaluare`, `/alerts`, and `/profile` also read the `catdai-lang` cookie in route metadata so hard refreshes render the selected language title before hydration.
- Localized FAQ routes exist at `/ro/faq` and `/ru/faq`.

## Current Default
Romanian (`ro`).

## Related Files
- `src/context/LanguageContext.js`
- `src/proxy.js`
- `src/components/Navbar.js`
- `src/locales/ro.json`
- `src/locales/ru.json`
