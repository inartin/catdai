# Cadastru street resolution

The address API resolves `street` before cache access, using the same city/type-scoped resolver and OSM snapshot as `catdai-api`. Known Russian aliases, unambiguous given-name initials and clear one-edit typos map to a canonical name; city, house suffix and apartment remain exact. Unknown streets follow the existing lookup. Ambiguous names return 422 with `ambiguous_street` and `suggestions`, without a lookup or cache write.

Initials such as `G. Coșbuc`, `M Eminescu`, and `I.L. Caragiale` expand before lookup only when exactly one street matches the selected city/type. Word order and count must match; the final name and numeric tokens stay exact. Collisions return 422 with the full names as suggestions. Resolution status is `abbreviation`, and the existing result notice shows the submitted and full names. Official address checks do not infer initials.

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

## Suggestions after no result

After an address lookup returns `not_found` (404), the API suggests up to three streets from the existing city/road-type dictionary. The app-owned `cadastru-street-suggestions.js` ranks whole-word matches, given-name initials, missing first names, bounded spelling differences and Romanian/Russian transliterations. These loose matches are suggestions only; they never identify or cache a property. Unique initials are handled by the synced worker resolver before lookup; looser matches remain suggestions only.

The form shows localized “Did you mean?” buttons only after that failed lookup. Clicking one updates the street and immediately retries, retaining city, road type, house, apartment and skip-cache settings. Editing fields clears suggestions and invalidates in-flight responses. Successful results, validation errors, rate limits and timeouts do not show these suggestions. Existing 422 ambiguity handling remains separate. No typing autocomplete, extra provider calls or client-side dictionary bundle is added.

Outside development, a recorded failed worker call can return a signed `suggestion_recovery_token` with its suggestions. The form sends it only on a “Did you mean?” click. The server checks its one-hour expiry, offered street and unchanged city, road type, house and apartment; only a successful retry marks that exact failed telemetry row's `suggestion_recovery` JSON. Cache hits, local backup results and masked previews count as finding data. Failure insertion completes before issuing the token, and the first recovery is retained. Tokens and visitor identity are never sent to the worker or stored in telemetry. Manual edits/submissions and 422 ambiguity choices do not mark recovery. Local development keeps statistics disabled. See [admin](admin.md) for the SQL upgrade and table display.
