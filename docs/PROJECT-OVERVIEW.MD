CatDai Project Overview
CatDai is a real estate valuation platform for Moldova that estimates market values of properties (initially apartments) using automated data collection from 999.md and other sources.

Core Functionality
Property Valuation:

Users input property details (zone, m², rooms, floor, renovation, etc.)
Receives recommended market price, fast sale/premium scenarios, price range + confidence level
Supports both sale and rent estimates via /api/estimate and /api/estimate-rent
Includes cadastral data integration (IPCBI details, construction year, utilities, wall material)
PDF report generation with QR codes and comprehensive valuation data
Monetization planned:

Free tier: limited estimates + Google Adsense
Paid tier: full reports + unlimited estimates
Business plan: for agencies with PDF export and history
Tech Stack
Framework & Runtime:

Next.js 16.1.6 (App Router)
React 19.2.3
Node.js with PM2 deployment (ecosystem.config.cjs)
Database & Backend:

Supabase (PostgreSQL) for auth, listings, price history, estimates, PDF events
Redis for caching (24h TTL for live prices API)
Server-side RPC functions for valuation logic
Infrastructure:

Tailwind CSS 4 with PostCSS
Sharp for image processing
QRCode generation for PDF reports
Cloudflared tunnel for local dev testing (scripts/dev-tunnel.sh)
Key Features
Authentication:

Google OAuth via Supabase
Telegram Login Widget (custom implementation with app-managed users: telegram-<id>@auth.catdai.md)
PKCE flow with auto-refresh tokens
Profile management at /profile with account deletion
SEO & Analytics:

Dynamic sitemap.xml and robots.txt
OG/Twitter metadata for shared result pages (/imobil/[slug])
JSON-LD structured data
Cookie consent banner
Ad source tracking (ZDG campaigns) with user journey analytics
Admin routes marked noindex
Market Data:

Live prices API (/api/prices) proxying external parser
Redis-cached with 24h TTL + in-memory stale fallback
Tables: listing, owner, listing_price_history
District comparisons and relevant listings display
PDF Generation:

Browser-based PDF creation (src/lib/browser-pdf.js)
Authorization system via /api/pdf-generation-authorizations
Event logging in pdf_generation_events table
Demo generation: pnpm run pdf:demo
Project Structure

src/
├── app/              # Next.js App Router pages & API routes
├── components/       # React components (Hero, PropertyForm, EstimateResult, etc.)
├── context/          # LanguageContext, AuthContext
├── lib/              # Utilities (supabase, seo, tracking, browser-pdf)
└── locales/          # i18n (ro.json, ru.json)
docs/                 # Comprehensive documentation
scripts/              # Dev tunnel, PDF demo generation
db/                   # SQL schemas for Supabase tables


Development Workflow
Scripts:

pnpm dev - Local development (port 3000)
pnpm test - Dev tunnel via Cloudflared
pnpm build - Production build
pnpm pdf:demo - Generate demo PDF report
Configuration:

next.config.mjs - Turbopack enabled, custom headers, noindex routes
eslint.config.mjs - Next.js core-web-vitals config
Environment variables for Supabase, Telegram, API tokens
Current State
Implemented: Auth, valuation (sale/rent), PDF reports, SEO, analytics, market data integration
SEO Status: Not blocked by technical issues, robots.txt allows crawling, sitemap available, Google has crawled homepage
Deployment: PM2 production setup on port 3000
The project is production-ready with comprehensive documentation in docs/ covering auth, valuation, SEO, market data, and admin features.