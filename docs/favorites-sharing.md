# Favorites And Sharing

## Stage
Implemented and active.

## Favorites
- Authenticated users can toggle favorites from an estimate result or the standalone cadastru result page, using the same `/api/favorites` API and `user_favorites` table.
- Favorites store `url_path`, label, user id, and creation date.
- Profile lists both result types under `Salvate` (RO) / `Сохранённые` (RU) and allows removal.
- Cadastru bookmarks use a stable localized result URL with the cadastral number, or the exact address fields for multi-property and masked address results. They omit temporary preview handoffs and cache-bypass flags, so they reopen without browser session storage and apply the viewer's current access rules.
- Favorites are persisted when `NODE_ENV=production` or `ENABLE_RUNTIME_PERSISTENCE=true`; otherwise development responses do not write `user_favorites`.
- Admin user and dashboard favorites totals include both result types. Cadastru usage rows show whether that user currently has a matching number or full-address bookmark; repeat searches can match the same saved favorite without increasing its count.
- New favorites and shared links created by marked admins remain usable but store `collect_statistics=false`; admin counts and shared/favorite indicators omit those rows. Historical rows keep their original eligibility even if the user's admin marker changes. See [analytics](seo-analytics.md) for the required migration.

## Sharing
- Estimate result can create a short share URL through `/api/share`.
- Shared links are stored in `shared_links`.
- Links resolve at `/imobil/[slug]`, include SEO metadata, then redirect to `/evaluare`.
- Shared `/evaluare` loads criteria from the stored `shared_links.params` by `share_slug`; viewer-edited query params are ignored.
- Duplicate links are avoided with a params hash per user or anonymous params.
- Short shared links are persisted when `NODE_ENV=production` or `ENABLE_RUNTIME_PERSISTENCE=true`; otherwise development returns a direct `/evaluare` URL instead of creating a `shared_links` row.
- Opened shared results are read-only for viewers: criteria edit, compare, and new-estimate actions are hidden.

### Cadastru reports
- An authenticated user can click `Distribuie acest raport` / `Поделиться отчётом` / `Share this report` on an unlocked Cadastru result. `/api/cadastru/share` verifies the lookup was already unlocked with a free or paid credit and saves the official server payload in `cadastru_shared_reports`. Sharing never consumes another credit. Development lookups may use their existing non-consuming access check.
- New links use `/{lang}/c/{code}` with a 12-character URL-safe code: 35 characters for the full production URL. The code is the first nine bytes of SHA-256 over the original random slug bytes, encoded as URL-safe base64. An indexed, unique generated `short_code` column resolves it to the original report; existing rows receive codes automatically. New reports retry slug/code collisions up to three times. Migration `supabase/migrations/20261026103149_cadastru_report_short_codes.sql` was applied to production on 2026-10-26; application deployment remains separate.
- Both older formats remain valid: `/{lang}/cadastru/rezultat?share_slug=...` and `/{lang}/c/{32-character-code}`. Re-sharing either copies the 12-character version for the same saved report, retaining analytics identity. All formats open the public report without login or credits, with the existing map and secondary cards, URL language and noindex metadata. Invalid/missing codes return 404; storage failures remain errors. The valuation action and ordinary favorites are hidden in this view.
- All three shared-link formats render item-specific Open Graph and Twitter metadata on the server: `Date cadastrale — {address}` / `Кадастровые данные — {address}` / `Cadastral data — {address}` and a short localized report description. The URL language takes precedence over cookies. Only the saved report's searched/official address is used; cadastral numbers, areas, values, ownership and registry details never enter previews. Missing addresses use a generic report title. Canonical/alternate and social URLs point to the compact report in RO/RU/EN, with Romanian as `x-default`. Metadata reads neither call providers nor count opens; the same server read is reused by metadata and page rendering.
- Copying the original number/address URL does not grant access: it still performs a normal lookup under the viewer's own credit/login rules. Shared views ignore other query criteria and load only the report associated with the share slug.
- Links use random 192-bit slugs, and unchanged reports are deduplicated per sharer and originating search. The API validates the signed search token, owner and matching property before assigning `search_event_id`; separate searches for the same property retain separate counters. Re-sharing retains the original report/search. Only server APIs can read/write the tables; browser roles cannot list reports or insert public grants. The saved main report survives source cache expiry; secondary location cards continue to use their existing independent caches.
- Apply `supabase/migrations/20261019184740_cadastru_shared_reports.sql` before deploying. Sharing requires runtime persistence (`NODE_ENV=production` or `ENABLE_RUNTIME_PERSISTENCE=true`); disabled persistence or failed storage returns an error, never a normal URL disguised as a public link.
- Apply `supabase/migrations/20261019185731_cadastru_share_statistics.sql` as well. Both admin Cadastru lists show lifetime `Shares` (explicit share-button clicks after obtaining a public link, including repeat clicks and re-shares) and `Unique viewers` for that search. Click UUIDs make retried delivery idempotent. Viewers are deduplicated across all snapshots of the search by account, or by signed one-year HTTP-only browser cookie when logged out. A different anonymous browser, cleared/expired cookie, or switching between logged-out and logged-in identities can count separately; these are visitor identities, not verified people. Cookie-blocked anonymous visits are not counted.
- Both sharing schemas are applied to production as of 2026-10-19; the statistics RPC and fresh authenticated dashboard response were verified after application.
- Opens are recorded after a shared report loads, through a separate POST; API fetches/prefetches alone do not count. The signed-in sharer's own opens, marked-admin activity, admin-created excluded reports, and development activity do not count. Failed tracking never prevents opening/copying a report. Counters start with this rollout; older opens and unattributed links are not guessed or backfilled. Deleting a search detaches its analytics without breaking the public link.

## Access Detail
- Shared links store whether the sharer was paid.
- A paid sharer can expose full analysis to viewers through `share_slug`.

## Related Files
- `src/app/api/favorites/route.js`
- `src/app/api/share/route.js`
- `src/app/api/share/[slug]/route.js`
- `src/app/imobil/[slug]/page.js`
- `src/components/EstimateResult.js`
- `src/components/CadastruFavoriteButton.js`
- `src/components/CadastruShareButton.js`
- `src/app/api/cadastru/share/route.js`
- `src/app/api/cadastru/share/[slug]/route.js`
- `src/app/cadastru/rezultat/page.js`
- `src/lib/cadastru-favorites.js`
- `src/lib/runtime-persistence.js`
- `db/favorites.sql`
- `db/shared_links.sql`
- `db/shared_links_dedup.sql`
