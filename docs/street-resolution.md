# Cadastru street resolution

The address API resolves `street` before cache access, using the same city/type-scoped resolver and OSM snapshot as `catdai-api`. Known Russian aliases, unambiguous given-name initials and clear one-edit typos map to a canonical name; city, house suffix and apartment remain exact. Unknown streets follow the existing lookup. Ambiguous names return 422 with `ambiguous_street` and `suggestions`, without a lookup or cache write.

Initials such as `G. Coșbuc`, `M Eminescu`, and `I.L. Caragiale` expand before lookup only when exactly one street matches the selected city/type. Word order and count must match; the final name and numeric tokens stay exact. Collisions return 422 with the full names as suggestions. Resolution status is `abbreviation`, and the existing result notice shows the submitted and full names. Official address checks do not infer initials.

## Pasted addresses in the street field

Before cache access or provider calls, the shared resolver checks for pasted road markers and a trailing house number. Cleanup requires an exact, unique dictionary street in the selected city/type; complete numbered names such as `31 August 1989` are checked first. Matching house numbers are redundant and are removed with `street_resolution.status: "cleaned"`. Numeric and single Latin-letter slash suffixes are supported; `Nuferilor 22 /d` with house `22/D` is redundant, while house `22` returns an explicit conflict with `22/D` and `22` as choices. Unknown names retain the original lookup.

Conflicting numbers return 422 `address_fields_conflict` with two corrected street/house choices. The result screen asks which house to use and retries only after a choice, preserving city, road type, apartment and skip-cache. Each retry clears stale choices; effect cleanup discards outdated responses. These choices are input validation, separate from no-result street suggestions and recovery telemetry. The dictionary remains server-side. Both the app API and signed worker enforce the check.

## Implementation

- `src/lib/cadastru-streets/` is a generated copy of the worker resolver, supported-city definitions and data. JSON imports replace the worker filesystem loader for Next.js bundling; matching logic is unchanged. Do not hand-edit these copies.
- `/api/cadastru/address` uses the canonical address for cache lookup, external requests, local fallback and address-based credit idempotency. Successful fresh lookups save both submitted and resolved aliases before access masking. Cache hits retain their original expiry and receive fresh per-request resolution metadata.
- Responses preserve `request_address` and expose `resolved_address` and `street_resolution: { status, original, resolved }`, including masked previews. No extra cadastral details are exposed.
- `cadastru-external-api.js` preserves worker ambiguity suggestions. The result screen displays a localized suggestion card. Selecting a name immediately retries the lookup there, retaining the other address fields.
- Successful full-access address navigation carries the original/resolved street in URL parameters; address previews and multi-property results use response metadata for a localized result-page notice. These strings are display-only, capped at 80 characters, rendered as text, and never used to identify a property. This works for full number results, masked previews and building/land results.

## Data updates

The synced worker snapshot contains 29,580 streets in 1,200 localities (12,561 with Russian aliases, including 15 șoseaua entries), sourced from the 2026-10-20 Geofabrik Moldova extract. Coverage is partial; Tiraspol retains the original search. Attribution: © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright). Source URL, checksum, boundary IDs and sample way IDs are retained in `data/streets.json`.

Maintain corrections and regenerate data in `catdai-api`, then run from this repository:

```sh
pnpm exec node scripts/sync-cadastru-streets.mjs ../catdai-api
pnpm exec node --experimental-vm-modules scripts/test-cadastru-storage.mjs
```

The sync script adapts only the loader and records worker source hashes in `source-hashes.json`. Review changes and deploy both projects with the same snapshot. No OSM service, database migration, or live import is needed at runtime. The dictionary stays in the server route, outside the form bundle.

The Cadastru selector sends `road_type: "sos"` for Șoseaua (Шоссе / Highway). The API resolves that type directly and retains it in result URLs, confirmation choices and search history. The synced Chișinău șoseaua aliases `Hîncești`, `Hincesti`, and `Soseul Hincesti` resolve to `Hâncești`; house `140/2` remains exact. Secondary-card origins and market matching also retain the șoseaua type.

## Validation

`pnpm exec node --experimental-vm-modules scripts/test-cadastru-house-suffix.mjs` checks letter-suffix validation, exact stored matching, worker forwarding and nearby origins with mocked providers/storage. `scripts/test-cadastru-address-identity.mjs` covers exact suffix matching in the local backup.

`pnpm exec node --experimental-vm-modules scripts/test-cadastru-building-confirmation.mjs` checks RO/RU building-location messages, validated suffix choices, explicit retries, skip-cache preservation and stale-choice cleanup.

The isolated storage/route regression suite covers original/resolved aliases, shared cache reuse, current-request metadata, masked previews, ambiguous suggestions, worker 422 propagation and canonical local fallback. It also checks pasted-address conflicts before cache/provider calls and redundant-input cleanup. These mocks do not establish live cadastral availability or browser interaction.

## Verified locality alternatives

Durlești is included in the app city allowlist, matching the worker, so confirmed requests are accepted.

If a Chișinău lookup cannot find an exact property, the worker can offer the same street, road type, house (including suffix) and optional apartment in a settlement explicitly identified inside Chișinău municipality. Autocomplete must be confirmed by a matching registry section and a land/building link, or the exact apartment link for unit searches. The app preserves these 422 `address_confirmation_required` choices. Only locality corrections say that the same address was found in the named alternative locality; house-suffix confirmations keep their existing copy. It displays the proposed locality and full street/house in a localized button; only clicking it changes the city and retries. Original matches take precedence. Suggestions do not save property data or consume credits; normal access, persistence and recovery tracking apply after confirmation. No cross-city inference from street names or map pins is used.

## Verified address without an apartment

When an apartment cannot be confirmed but the registry explicitly verifies the same city, road type, complete street and house with land/building links in that address section, the worker can return `422 address_confirmation_required` with the same address and no `apartment_number`. For example, `Maria Tănase 15`, apartment `2`, can offer `Maria Tănase 15` without a unit. Autocomplete or a map pin alone cannot establish this alternative; the worker reuses the registry response from the unit search. Exact units and verified unit alternatives take precedence. Existing single-building partial results remain supported.

The API accepts apartment removal only for the exact resolved address. The RO/RU result screen explains that the apartment was not confirmed and offers the house/land result. Clicking removes the apartment from the next request, saved handoff and URL while preserving skip-cache and suggestion recovery. No retry, property persistence or credit consumption occurs before that choice. The confirmed search uses the ordinary building/land result and access rules. Deploy the app and worker together; the retained, disabled local backup is unchanged.

## Verified house-number alternatives

With multiple verified addresses, the result screen shows the shared explanation and one button per house number without repeating the confirmation sentence for each option. A single alternative displays its complete address separately and asks for confirmation.

Building/land searches without an apartment also offer up to three verified numeric or single Latin-letter house suffixes when the exact house is absent. Autocomplete candidates must be confirmed by an explicit matching address and a land/building link in the same registry section. Exact original results take precedence, including Geodata recovery; verified choices can still be shown if geocoding fails. Confirmation never consumes credits or saves a property; clicking a choice starts the usual exact lookup. The result page explains in RO/RU that an exact building location is needed for nearby places, transport and reports, and does not start those requests while a choice is pending.

The synced resolver recognizes Chișinău strada `Киев` as `Kiev`. Russian street aliases ending in `улица` also accept the bare name or a leading `улица`/`ул.` marker (for example `Киевская`, `Киевская улица`, `ул. Киевская`). Matching remains scoped to city and road type; alias collisions remain ambiguous.

If an apartment lookup cannot confirm the submitted house without a suffix (for example `Ion Creangă 82`, apartment `167`), the worker can return 422 `address_confirmation_required` with up to three `address_suggestions`. Each suggestion has the same city, road type, complete street and apartment, plus a registry house suffix such as `82/1`. Autocomplete candidates alone are insufficient: the detail record must explicitly show that address and an actual apartment link. No apartment number is derived for a suggested house. The local backup follows the same verification.

The result screen keeps the original requested house and asks whether the verified address is intended, in Romanian or Russian. Only clicking the suggested-house button changes the request and retries; users can return to the filled form to edit it. Retries and late-response checks clear stale suggestions. The API returns confirmation before property persistence or credit consumption, and does not expose the alternative's cadastral number. Verified matches are cached for five minutes under the alternative's complete address and normalized apartment, with at most 500 entries per server process. Confirming reuses the already parsed match without repeating geocoding or registry calls. Local backup matches are checked before retrying the worker, including when `skip_cache` bypasses stored property records. Authentication, access checks, persistence and credit consumption still follow the normal confirmed-request path. The original house and other apartments cannot reuse the alternative. Reads do not extend expiry; expiration, eviction, restart or another process resumes a normal lookup. Address worker calls default to 45 seconds so a registry fallback can finish after a slow Geodata request; explicit timeout configuration still takes precedence.

## Suggestions after no result

All result-page suggestions use a white bordered card with an information icon, a contextual heading and explanation, full-width green choice buttons with arrows, and an underlined “Modify address” action. A single verified alternative displays its complete address separately. Apartment-to-building suggestions explicitly state that the unit is unconfirmed. Multiple alternatives share the explanation and retain separate buttons. Copy is localized in Romanian and Russian. “Modify address” restores the current search fields in the form, including the apartment and skip-cache option; only a choice button starts a corrected lookup.

When a completed lookup has no result but offers a street-name or road-type alternative, the localized message names the submitted road and street, explains that a similar name was found, and offers `Caută „{road} {street}”` buttons (with equivalent Russian copy).

After an address lookup returns `not_found` (404), the API suggests up to three streets from the existing city/road-type dictionary. The app-owned `cadastru-street-suggestions.js` ranks whole-word matches, given-name initials, missing first names, bounded spelling differences and Romanian/Russian transliterations. These loose matches are suggestions only; they never identify or cache a property. Unique initials are handled by the synced worker resolver before lookup; looser matches remain suggestions only.

If the submitted street has no exact dictionary match under the selected road type but matches another type in the same city, a failed lookup offers that type and canonical street instead. This applies to 404 and 503 responses. After a worker timeout with such a match, the API returns the suggestion without repeating the same slow lookup in the local backup. It does not claim that the house or apartment exists. The result screen shows a localized button and retries with the suggested road type only after a click, retaining the city, house, apartment and skip-cache setting. Successful searches and streets already known under the selected type do not show a road-type suggestion.

The result screen shows localized “Did you mean?” buttons only after that failed lookup. Clicking a street-name suggestion updates the lookup request and immediately retries, retaining city, road type, house, apartment and skip-cache settings. Retries clear suggestions and invalidate in-flight responses; the back button returns to the form for manual edits. Successful results, validation errors, rate limits and timeouts do not show street-name suggestions. Existing 422 ambiguity handling remains separate. No typing autocomplete, extra provider calls or client-side dictionary bundle is added.

Outside development, a recorded failed worker call can return a signed `suggestion_recovery_token` with its street-name suggestions or verified house-suffix alternatives. The result screen sends it only on a street-name “Did you mean?” click or a house confirmation click. The server checks its one-hour expiry and either the offered street with unchanged city, road type, house and apartment, or an exact offered complete address for house confirmation; only a successful retry marks that exact failed telemetry row's `suggestion_recovery` JSON. Road-type suggestions do not use this token. Cache hits, reused verified alternatives, local backup results and masked previews count as finding data. Failure insertion completes before issuing the token, and the first recovery is retained. Confirmation without a recorded failed worker row cannot mark recovery. Tokens and visitor identity are never sent to the worker or stored in telemetry. Manual edits/submissions, pasted-address corrections and 422 ambiguity choices do not mark recovery. Local development keeps statistics disabled. See [admin](admin.md) for the SQL upgrade and table display.

The reviewed Chișinău boulevard alias `Ștefan cel Mare` (also without diacritics) resolves to `Ștefan cel Mare și Sfânt` before cache lookup and worker requests. House, apartment, locality and road type checks remain exact.
