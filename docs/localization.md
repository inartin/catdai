# Localization

## Stage
Romanian and Russian UI; English is available for Cadastru search/results/shared reports and MAIB/Paddle checkout/payment pages. Romanian remains the default.

## How It Works
- Translations live in `src/locales/ro.json`, `src/locales/ru.json`, and the scoped `src/locales/en.json`. Other domains retain Romanian fallback; they are not advertised as English pages.
- `LanguageProvider` stores selected language in `localStorage` and the `catdai-lang` cookie.
- URL prefixes `/ro/...`, `/ru/...`, and scoped `/en/...` set the language. English rewrites cover Cadastru, compact reports and payment routes only. Payment URLs also accept `lang=en`.
- Cadastru, compact-report and payment layouts use `x-catdai-lang` before the language cookie so initial page copy matches the URL. The root stays static with Romanian as its default; the browser provider updates `<html lang>` from the URL/preference. Language headers/cookies are read only in these route layouts, preserving static rendering for unrelated pages.
- FAQ copy is centralized in `src/lib/faq-content.js`, with separate localized datasets for the full FAQ pages and the landing-page FAQ preview.
- The full FAQ dataset includes localized cadastral lookup-by-address copy for both Romanian and Russian FAQ pages.
- Proxy rewrites localized paths to the base route, except localized FAQ pages.

## UI
- Desktop Navbar shows only the current language by default. Clicking it expands the other languages horizontally to its left; selection, outside click, focus leaving the selector, or Escape collapses it. The mobile menu always shows all available language buttons in one row, highlighting the current language. RO/RU are available throughout, plus EN on Cadastru search, result and compact-report routes. Switching preserves the query and fragment and navigates the document so rewritten route layouts refresh SEO metadata.
- `document.documentElement.lang` follows selected language.
- Use the normal ASCII dash `-` in authored RO/RU/EN copy, email subjects/bodies, metadata and empty-value placeholders.
- `/estimeaza` sets a localized browser title from `estimeaza.pageTitle`.
- `/evaluare` sets a localized browser title from `evaluare.pageTitle`.
- `/anunt` sets a localized browser title from `anunt.pageTitle`.
- `/alerts` sets a localized browser title from `alerts.pageTitle`.
- `/cadastru` has RO/RU/EN server metadata, search/result copy, example images, loading/error states, nearby/transport/report cards, and checkout actions. Known registry categories are translated for English display; official names, identifiers, unknown values and source-authored free text remain intact.
- `/estimeaza`, `/evaluare`, `/alerts`, and `/profile` also read the `catdai-lang` cookie in route metadata so hard refreshes render the selected language title before hydration.
- `/calculator` reads the `catdai-lang` cookie in route metadata and client copy through the shared translation files.
- MAIB and Paddle checkout/status pages use RO/RU/EN copy and server metadata. English survives guest checkout, order snapshots, receipts, retry and property-return links. `20261030152614_english_maib_payment_language.sql` was applied to the shared CatDai database on 30 October 2026; it permits English order snapshots while retaining Romanian as the default.
- Standalone Cadastru payment emails use `maib.cadastruReceipt*` in all three locales. The saved order language controls the subject, searched-address/number label, body and public report URL; official addresses and identifiers remain as searched.
- Localized FAQ routes exist at `/ro/faq` and `/ru/faq`.
- `/noutati` and `/noutati/[slug]` localize static page chrome from the URL language or `catdai-lang` cookie through a route-level language provider; database-backed news content is not translated by the app.
- Landing 999.md analyzer feature paper labels are localized through `linkAnalyzer.feature*` keys.

## Current Default
Romanian (`ro`).

## Related Files
- `src/context/LanguageContext.js`
- `src/proxy.js`
- `src/components/Navbar.js`
- `src/app/anunt/layout.js`
- `src/locales/ro.json`
- `src/locales/ru.json`
- `src/locales/en.json`
- `src/lib/language.js`
- `src/lib/request-language.js`

Focused checks: `pnpm exec node --experimental-vm-modules scripts/test-cadastru-english.mjs`, `scripts/test-cadastru-number-urls.mjs`, and `scripts/test-cadastru-sharing.mjs`.
