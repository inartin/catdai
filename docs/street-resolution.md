# Cadastru street resolution

The address API resolves `street` before cache access, using the same city/type-scoped resolver and OSM snapshot as `catdai-api`. Known Russian aliases and clear one-edit typos map to a canonical name; city, house suffix and apartment remain exact. Unknown streets follow the existing lookup. Ambiguous names return 422 with `ambiguous_street` and `suggestions`, without a lookup or cache write.

## Implementation

- `src/lib/cadastru-streets/` is a generated copy of the worker resolver, supported-city definitions and data. JSON imports replace the worker filesystem loader for Next.js bundling; matching logic is unchanged. Do not hand-edit these copies.
- `/api/cadastru/address` uses the canonical address for cache lookup, external requests, local fallback and address-based credit idempotency. Successful fresh lookups save both submitted and resolved aliases before access masking. Cache hits retain their original expiry and receive fresh per-request resolution metadata.
- Responses preserve `request_address` and expose `resolved_address` and `street_resolution: { status, original, resolved }`, including masked previews. No extra cadastral details are exposed.
- `cadastru-external-api.js` preserves worker ambiguity suggestions. The form displays localized suggestion buttons in the existing error area. Selecting a name updates the street field; the user submits again. Field changes clear stale suggestions.
- Successful address navigation carries the original/resolved street in URL parameters for a localized result-page notice. These strings are display-only, capped at 80 characters, rendered as text, and never used to identify a property. This works for full number results, masked previews and building/land results.

## Data updates

The snapshot contains 2,736 streets in 39 localities (2,192 with Russian aliases), sourced from the 2026-09-25 Geofabrik Moldova extract. Coverage is partial; Tiraspol retains the original search. Attribution: © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright). Source URL, checksum, boundary IDs and sample way IDs are retained in `data/streets.json`.

Maintain corrections and regenerate data in `catdai-api`, then run from this repository:

```sh
pnpm exec node scripts/sync-cadastru-streets.mjs ../catdai-api
pnpm exec node --experimental-vm-modules scripts/test-cadastru-storage.mjs
```

The sync script adapts only the loader and records worker source hashes in `source-hashes.json`. Review changes and deploy both projects with the same snapshot. No OSM service, database migration, or live import is needed at runtime. The dictionary stays in the server route, outside the form bundle.

## Validation

The isolated storage/route regression suite covers original/resolved aliases, shared cache reuse, current-request metadata, masked previews, ambiguous suggestions, worker 422 propagation and canonical local fallback. These mocks do not establish live cadastral availability or browser interaction.
