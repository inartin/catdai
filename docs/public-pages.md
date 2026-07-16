# Public Pages And App Shell

## Stage
Implemented.

## Public Pages
- `/` landing page with hero, categories, how it works, examples, and alerts teaser.
- Landing page ends with a compact product FAQ preview focused on calculation logic, input data, and seller-type price differences, plus a link to the full FAQ page.
- Landing example-results section is titled `Cum arată o estimare` and uses a subtitle about real CatDai-generated result examples.
- Landing hero copy positions the product as apartment market analysis for sellers, buyers, and monthly rent context.
- Landing hero subtitle says the product estimates the market price for sale, purchase, or rent.
- Landing shows compact sell/buy/rent scope cards below the main market card.
- Landing scope card descriptions explain realistic seller pricing before publishing or accepting an agent offer, buyer price checks against similar area/parameters, and estimated rent by area and characteristics.
- Landing mobile replaces the three large sell/buy/rent scope cards with one compact grouped card using small chips.
- Landing marks visible rent scope labels with a localized `În curând` / `Скоро` badge until rent analysis is active.
- Landing real estate market card keeps the desktop center column focused on the Chișinău image and market context, while the CTA still routes to the existing `/estimeaza` flow.
- Landing mobile combines live prices and compact three-month trend charts in one softly blurred Chișinău image-backed market card, with the city in the header, each price label above its matching green or blue chart, the first known price shown above the chart's starting point, and analyzed-listing count at the bottom.
- The full Chișinău market card is clickable and opens a scrollable popup with separate three-month new-build and secondary-market charts for Chișinău sectors available in the `/estimeaza` form; sectors whose request fails or has no usable trend data are hidden.
- Each popup open is recorded through a deferred browser-idle beacon and atomically increments the current Chișinău calendar-day counter, so analytics do not block the popup or district-chart loading.
- Landing places the 999.md link analyzer below the sell/buy/rent scope cards on desktop, and above them on mobile.
- Landing 999.md link analyzer shows flat white paper-style feature tabs with custom line icons dropping from under the analyzer for price analysis, similar-listing comparison, duplicate checks, and price history.
- Landing shows an all-time usage-stat card between the product scope/link analyzer and `How it works`, using the same white surface, `rounded-2xl`, emerald border, and standard landing shadow as the existing market card.
- Landing `How it works` intro says users can see whether the price is below market, near market, or too high.
- Landing `How it works` steps are input data, market price, similar listings, and rapid/medium/premium price levels; the step layout allows longer labels on mobile and desktop.
- Landing `How it works` mobile trust note uses a compact left-icon layout so the two-line copy stays balanced.
- Landing hero has the `Evaluează gratuit` primary CTA button below the hero text and routes directly to `/estimeaza`.
- The desktop real estate card is supporting market context only; the primary CTA lives in the hero.
- The landing page how-it-works steps render as a compact two-column grid on mobile and a horizontal arrow flow on larger screens.
- `/faq`, `/ro/faq`, `/ru/faq`.
- `/ro/cadastru` and `/ru/cadastru` for official cadastral lookup by address or cadastral number.
- `/calculator` for the rent-yield calculator form and same-route result page.
- `/pricing` for the standalone pricing page; the same reusable pricing section also appears near the bottom of the landing page before the FAQ preview.
- `/verifica-anunt` for 999.md listing-link analysis; `/999` permanently redirects there as a shortcut, and generated listing-analysis results render on noindex `/anunt`.
- `/noutati` lists public real estate news and analysis cards from `news_posts`, and `/noutati/[slug]` renders each individual rich-text article at a stable database-backed URL.
- `/noutati` keeps its intro subtitle wide on desktop so the short description does not wrap too early.
- `/ro/preturi-apartamente/chisinau/botanica` and `/ru/ceny-kvartir/kishinev/botanika` are static SEO market-analysis pages for a saved Botanica old-building apartment valuation snapshot.
- `/ro/preturi-apartamente/chisinau/botanica-constructii-noi` and `/ru/ceny-kvartir/kishinev/botanika-novostroy` are the matching new-building pages, linked from the old-building pages and back.
- `/about`.
- `/terms`.
- `/privacy`.
- `/refund`.

## App Shell
- Shared navbar with logo, small beta badge with localized custom tooltip that flips below near the top edge, Evaluare link to `/estimeaza`, localized Cadastru link, Calculator link to `/calculator`, Prețuri link to `/pricing` placed right after Calculator, login/profile link, language switcher, and an always-visible notification button.
- The notification button opens a right sidebar for authenticated users, stays visible but disabled while auth is loading or anonymous, loads the user's active `user_notifications` rows, formats dates with full capitalized month names, marks unread rows as read when the sidebar closes, and archives rows when cleared.
- Shared footer. Its `Noutăți` link routes to `/noutati`; footer legal links include Terms, Privacy, and Refund; Telegram remains only as the social icon link. Footer displays active card/payment-system logos from `public/brands`; Paynet is not shown because it is not used.
- Cookie banner is global.
- PWA manifest and app icons are present.

## Current Product Scope
- Real estate valuation is active.
- Other categories shown on the landing page are not active flows yet.

## Related Files
- `src/app/page.js`
- `src/app/api/landing-stats/route.js`
- `src/components/HomeContent.js`
- `src/components/LandingUsageStats.js`
- `src/components/Navbar.js`
- `src/components/Footer.js`
- `src/components/CookieBanner.js`
- `src/app/manifest.json`
