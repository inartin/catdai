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
- Landing `How it works` keeps the original short intro above the `Prețul tău` chart, while the more detailed calculation wording lives in the landing FAQ preview.
- Landing hero has the primary CTA button below the hero text and routes directly to `/estimeaza`.
- The desktop real estate card is supporting market context only; the primary CTA lives in the hero.
- The landing page how-it-works steps render as a compact two-column grid on mobile and a horizontal arrow flow on larger screens.
- `/faq`, `/ro/faq`, `/ru/faq`.
- `/about`.
- `/terms`.
- `/privacy`.

## App Shell
- Shared navbar with logo, small beta badge with localized custom tooltip that flips below near the top edge, login/profile link, language switcher, and alerts shortcut for logged-in users.
- Shared footer.
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
