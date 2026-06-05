# Public Pages And App Shell

## Stage
Implemented.

## Public Pages
- `/` landing page with hero, categories, how it works, examples, and alerts teaser.
- Landing page ends with a compact product FAQ preview focused on calculation logic, input data, and seller-type price differences, plus a link to the full FAQ page.
- Landing hero copy positions the product as apartment market analysis for sellers, buyers, and monthly rent context.
- Landing hero subtitle repeats the main H1 terms in body copy so homepage SEO analyzers see the heading language reflected in visible text.
- Landing shows compact sell/buy/rent scope cards below the main market card.
- Landing marks visible rent scope labels with a localized `În curând` / `Скоро` badge until rent analysis is active.
- Landing real estate market card keeps the desktop center column focused on the Chișinău image and market context, while the CTA still routes to the existing `/estimeaza` flow.
- Landing mobile combines live prices and compact 60-day trend charts in one softly blurred Chișinău image-backed market card, with the city in the header, each price label above its matching green or blue chart, and analyzed-listing count at the bottom.
- Landing mobile places the 999.md link analyzer directly under the primary hero CTA with balanced spacing before the market card; desktop keeps it under the market card.
- Landing `How it works` keeps the original short intro above the `Prețul tău` chart, while the more detailed calculation wording lives in the landing FAQ preview.
- Landing `How it works` mobile trust note uses a compact left-icon layout so the two-line copy stays balanced.
- Landing hero has the primary CTA button below the hero text and routes directly to `/estimeaza`.
- The desktop real estate card is supporting market context only; the primary CTA lives in the hero.
- The landing page how-it-works steps render as a compact two-column grid on mobile and a horizontal arrow flow on larger screens.
- `/faq`, `/ro/faq`, `/ru/faq`.
- `/ro/cadastru` and `/ru/cadastru` for official cadastral lookup by address or cadastral number.
- `/calculator` for the rent-yield calculator form and same-route result page.
- `/verifica-anunt` for 999.md listing-link analysis; `/999` permanently redirects there as a shortcut, and generated listing-analysis results render on noindex `/anunt`.
- `/noutati` lists public real estate news and analysis cards from `news_posts`, and `/noutati/[slug]` renders each individual rich-text article at a stable database-backed URL.
- `/noutati` keeps its intro subtitle wide on desktop so the short description does not wrap too early.
- `/ro/preturi-apartamente/chisinau/botanica` and `/ru/ceny-kvartir/kishinev/botanika` are static SEO market-analysis pages for a saved Botanica old-building apartment valuation snapshot.
- `/ro/preturi-apartamente/chisinau/botanica-constructii-noi` and `/ru/ceny-kvartir/kishinev/botanika-novostroy` are the matching new-building pages, linked from the old-building pages and back.
- `/about`.
- `/terms`.
- `/privacy`.

## App Shell
- Shared navbar with logo, small beta badge with localized custom tooltip that flips below near the top edge, Evaluare link to `/estimeaza`, localized Cadastru link, Calculator link to `/calculator`, login/profile link, language switcher, and a logged-in notification button.
- The notification button is UI-only for now, opens an empty right sidebar, and includes read-state and clear-notifications UI for future notification data.
- Shared footer. Its `Noutăți` link routes to `/noutati`; Telegram remains only as the social icon link.
- Cookie banner is global.
- PWA manifest and app icons are present.

## Current Product Scope
- Real estate valuation is active.
- Other categories shown on the landing page are not active flows yet.

## Related Files
- `src/app/page.js`
- `src/components/HomeContent.js`
- `src/components/Navbar.js`
- `src/components/Footer.js`
- `src/components/CookieBanner.js`
- `src/app/manifest.json`
