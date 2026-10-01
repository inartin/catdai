# Favorites And Sharing

## Stage
Implemented and active.

## Favorites
- Authenticated users can toggle favorites from an estimate result or the standalone cadastru result page, using the same `/api/favorites` API and `user_favorites` table.
- Favorites store `url_path`, label, user id, and creation date.
- Profile lists both result types under `Salvate` (RO) / `Сохранённые` (RU) and allows removal.
- Cadastru bookmarks use a stable localized result URL with the cadastral number, or the exact address fields for multi-property and masked address results. They omit temporary preview handoffs and cache-bypass flags, so they reopen without browser session storage and apply the viewer's current access rules.
- Favorites are persisted when `NODE_ENV=production` or `ENABLE_RUNTIME_PERSISTENCE=true`; otherwise development responses do not write `user_favorites`.

## Sharing
- Estimate result can create a short share URL through `/api/share`.
- Shared links are stored in `shared_links`.
- Links resolve at `/imobil/[slug]`, include SEO metadata, then redirect to `/evaluare`.
- Shared `/evaluare` loads criteria from the stored `shared_links.params` by `share_slug`; viewer-edited query params are ignored.
- Duplicate links are avoided with a params hash per user or anonymous params.
- Short shared links are persisted when `NODE_ENV=production` or `ENABLE_RUNTIME_PERSISTENCE=true`; otherwise development returns a direct `/evaluare` URL instead of creating a `shared_links` row.
- Opened shared results are read-only for viewers: criteria edit, compare, and new-estimate actions are hidden.

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
- `src/app/cadastru/rezultat/page.js`
- `src/lib/cadastru-favorites.js`
- `src/lib/runtime-persistence.js`
- `db/favorites.sql`
- `db/shared_links.sql`
- `db/shared_links_dedup.sql`
