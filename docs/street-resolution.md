# Cadastru street resolution

The address API resolves `street` before cache access, using the same city/type-scoped resolver and OSM snapshot as `catdai-api`. Known Russian aliases, unambiguous given-name initials and clear one-edit typos map to a canonical name; city, house suffix and apartment remain exact. Unknown streets follow the existing lookup. Ambiguous names return 422 with `ambiguous_street` and `suggestions`, without a lookup or cache write.

Initials such as `G. Coșbuc`, `M Eminescu`, and `I.L. Caragiale` expand before lookup only when exactly one street matches the selected city/type. Word order and count must match; the final name and numeric tokens stay exact. Collisions return 422 with the full names as suggestions. Resolution status is `abbreviation`, and the existing result notice shows the submitted and full names. Official address checks do not infer initials.

## Pasted addresses in the street field

Before cache access or provider calls, the shared resolver checks for pasted road markers and a trailing house number. Cleanup requires an exact, unique dictionary street in the selected city/type; complete numbered names such as `31 August 1989` are checked first. Matching house numbers are redundant and are removed with `street_resolution.status: "cleaned"`. Unknown names retain the original lookup.

Conflicting numbers return 422 `address_fields_conflict` with two corrected street/house choices. The form asks which house to use and retries only after a choice, preserving city, road type, apartment and skip-cache. Field edits clear stale choices, and request IDs discard outdated responses. These choices are input validation, separate from no-result street suggestions and recovery telemetry. The dictionary remains server-side. Both the app API and signed worker enforce the check.

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

The isolated storage/route regression suite covers original/resolved aliases, shared cache reuse, current-request metadata, masked previews, ambiguous suggestions, worker 422 propagation and canonical local fallback. It also checks pasted-address conflicts before cache/provider calls and redundant-input cleanup. `pnpm exec node --experimental-vm-modules scripts/test-cadastru-address-form.mjs` checks both localized house choices, retries preserving the other fields, and stale-response rejection using isolated form hooks and compiled JSX. These mocks do not establish live cadastral availability or browser interaction.

## Verified house-number alternatives

If an apartment lookup cannot confirm the submitted house without a suffix (for example `Ion Creangă 82`, apartment `167`), the worker can return 422 `address_confirmation_required` with up to three `address_suggestions`. Each suggestion has the same city, road type, complete street and apartment, plus a registry house suffix such as `82/1`. Autocomplete candidates alone are insufficient: the detail record must explicitly show that address and an actual apartment link. No apartment number is derived for a suggested house. The local backup follows the same verification.

The form keeps the original house and asks whether the verified address is intended, in Romanian or Russian. Only clicking the suggested-house button changes the field and retries; users can edit the form instead. Edits and late-response checks clear stale suggestions. The API returns confirmation before property persistence, result navigation or credit consumption, and does not expose the alternative's cadastral number. Verified matches are cached for five minutes under the alternative's complete address and normalized apartment, with at most 500 entries per server process. Confirming reuses the already parsed match without repeating geocoding or registry calls. Local backup matches are checked before retrying the worker, including when `skip_cache` bypasses stored property records. Authentication, access checks, persistence and credit consumption still follow the normal confirmed-request path. The original house and other apartments cannot reuse the alternative. Reads do not extend expiry; expiration, eviction, restart or another process resumes a normal lookup. Address worker calls default to 45 seconds so a registry fallback can finish after a slow Geodata request; explicit timeout configuration still takes precedence.

## Suggestions after no result

After an address lookup returns `not_found` (404), the API suggests up to three streets from the existing city/road-type dictionary. The app-owned `cadastru-street-suggestions.js` ranks whole-word matches, given-name initials, missing first names, bounded spelling differences and Romanian/Russian transliterations. These loose matches are suggestions only; they never identify or cache a property. Unique initials are handled by the synced worker resolver before lookup; looser matches remain suggestions only.

If the submitted street has no exact dictionary match under the selected road type but matches another type in the same city, a failed lookup offers that type and canonical street instead. This applies to 404 and 503 responses. After a worker timeout with such a match, the API returns the suggestion without repeating the same slow lookup in the local backup. It does not claim that the house or apartment exists. The form shows a localized button and retries with the suggested road type only after a click, retaining the city, house, apartment and skip-cache setting. Successful searches and streets already known under the selected type do not show a road-type suggestion.

The form shows localized “Did you mean?” buttons only after that failed lookup. Clicking a street-name suggestion updates the street and immediately retries, retaining city, road type, house, apartment and skip-cache settings. Editing fields clears suggestions and invalidates in-flight responses. Successful results, validation errors, rate limits and timeouts do not show street-name suggestions. Existing 422 ambiguity handling remains separate. No typing autocomplete, extra provider calls or client-side dictionary bundle is added.

Outside development, a recorded failed worker call can return a signed `suggestion_recovery_token` with its street-name suggestions or verified house-suffix alternatives. The form sends it only on a street-name “Did you mean?” click or a house confirmation click. The server checks its one-hour expiry and either the offered street with unchanged city, road type, house and apartment, or an exact offered complete address for house confirmation; only a successful retry marks that exact failed telemetry row's `suggestion_recovery` JSON. Road-type suggestions do not use this token. Cache hits, reused verified alternatives, local backup results and masked previews count as finding data. Failure insertion completes before issuing the token, and the first recovery is retained. Confirmation without a recorded failed worker row cannot mark recovery. Tokens and visitor identity are never sent to the worker or stored in telemetry. Manual edits/submissions, pasted-address corrections and 422 ambiguity choices do not mark recovery. Local development keeps statistics disabled. See [admin](admin.md) for the SQL upgrade and table display.
