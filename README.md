# Cât Dai?

Cât Dai? is a Romanian/Russian real-estate analysis platform for Moldova. It estimates apartment sale and monthly-rent values from current market listings and price history, then combines those results with official cadastral data.

The active valuation scope is apartments in Chișinău and Durlești. Other product categories are not active.

## Available Features

- **Sale and rent valuation** - guided apartment criteria, market estimate, confidence and range, price per m², district comparisons, market trends, and relevant 999.md listings.
- **999.md listing analysis** - paste a sale-apartment link to extract its details, compare the asking price with the market, inspect price history, and find likely duplicate listings.
- **Cadastral lookup** - search official property data by exact address or cadastral number, reuse available fields in a valuation, and export the result card as PNG.
- **Rent-yield calculator** - estimate monthly rent, gross yield, payback period, and the effect of Moldova's optional 7% rental tax.
- **Result tools** - compare criteria, save favorites, create read-only share links, reopen paid valuation snapshots, and generate configurable browser-side PDF reports for sale valuations.
- **Accounts** - Google and Telegram login, profile history, favorites, credit balances, transactions, in-app notifications, Telegram linking, subscription management, and account deletion.
- **Market content** - live Chișinău price summaries, three-month market and district trends, public news articles with authenticated upvotes, FAQ, and localized SEO pages.
- **Access and payments** - anonymous previews, five free monthly uses per gated feature for authenticated users, Paddle one-time purchases, and the Extra monthly subscription. Standard and Pro are supported by the payment model but currently hidden on `/pricing`.
- **Listing alerts** - alert configuration and storage are implemented. Matching and delivery run outside this repository.
- **Localization** - the application UI is available in Romanian and Russian.

## Admin

The protected admin area includes application analytics, users and access grants, payment and attribution reporting, sale/rent estimation activity, cadastral and calculator usage, listing and owner exploration, price history, feedback, news publishing, image uploads, and notification broadcasts.

## Tech Stack

- **Frontend:** Next.js 16.1.6 App Router, React 19.2.3, JavaScript, Tailwind CSS 4
- **Backend:** Next.js route handlers and Supabase PostgreSQL RPCs
- **Data and identity:** Supabase PostgreSQL, Auth, and Storage
- **Caching:** Redis with in-memory stale fallbacks
- **Payments:** Paddle checkout, subscriptions, webhooks, refunds, and chargebacks
- **Content and media:** Tiptap, `sanitize-html`, Sharp, QRCode, and browser Canvas PDF generation
- **Operations:** Node.js, PM2, and Cloudflare Tunnel
- **External data:** 999.md parser/worker, Geodata WFS/WMS, cadastru.md, and Nominatim fallback

## Local Development

Install dependencies:

```bash
pnpm install
```

Configure `.env.development` for Supabase and the integrations needed by the flow you are running. The required variables are documented by domain in [`docs/`](docs/), especially [`auth-config.md`](docs/auth-config.md), [`market-data.md`](docs/market-data.md), and [`paddle-payments.md`](docs/paddle-payments.md).

Start Next.js without a tunnel:

```bash
pnpm exec next dev
```

Start Next.js together with the configured `catdai` Cloudflare Tunnel:

```bash
pnpm dev
```

Production commands:

```bash
pnpm build
pnpm start
```

Generate the demo valuation PDF:

```bash
pnpm pdf:demo
```

There is currently no automated test script. `pnpm test` starts the development server and Cloudflare Tunnel.

## Project Structure

```text
src/app/       Pages and API routes
src/components Shared product and admin UI
src/context/   Authentication and language providers
src/lib/       Valuation, access, payments, integrations, and utilities
src/locales/   Romanian and Russian translations
db/            Supabase schemas, functions, and migrations
docs/          Living product and architecture documentation
external/      Standalone signed external workers
scripts/       Development and PDF utilities
```

Detailed behavior and implementation boundaries are maintained in [`docs/`](docs/).
