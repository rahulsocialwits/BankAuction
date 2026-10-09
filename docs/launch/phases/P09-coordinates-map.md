# P09 - Coordinates and map discovery

**Launch-critical:** Partial  |  **Depends on:** P03, P05, P07  |  **Spec sections:** 4.5
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P09`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
The map shows real pins from reliable coordinates, with clustering, 'search this area', and honest states. If coordinates are not ready, the map is hidden by flag.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- Production map shows 0 pins on all pages tested.
- No clustering, no search-this-area, no detail-page map.
- Map provider is OpenStreetMap tiles with no key: needs owner acceptance for production traffic.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| What share of published properties have valid coordinates? | BASELINE.md; src/lib/map/coordinates.ts validation rules |
| Which sources carry coordinates natively? | src/data-sources adapters; SourceRecord raw payloads (operator query) |
| Is a geocoder configured anywhere? | grep -ri geocode src; env vars |
| What does the map UI do today in each state? | src/components/PropertyMapView.tsx, ViewToggle.tsx; tests/propertyMap.test.ts |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- Coordinates come from source data first. Geocoding addresses to pins is allowed ONLY from a provider the owner approved, with a precision flag, and never for uncertain addresses.
- If under 30% of active listings are mappable at launch time, set the map flag OFF (hide toggle).
- Provider choice is D04. Without approval keep OSM and note quotas and attribution.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP9.1 Coordinate source audit and data runbook (operator-run, approval needed).
- WP9.2 Precision field usage and display rule.
- WP9.3 Clustering (leaflet.markercluster or equivalent, license checked).
- WP9.4 'Search this area' with bounds query.
- WP9.5 Detail-page map using the same validation.
- WP9.6 Loading, provider-error and no-coordinate states.
- WP9.7 Flag to hide the map toggle.

## Step 4 - Tests required
- AT-06 map/list parity.
- Bounds query tests.
- Cluster and selection reducer tests.

## Exit gate (all must be true before this phase is DONE)
- [ ] Either real pins visible in production on at least the top cities, or the map is flagged off.
- [ ] AT-06 passes.

## Owner approvals needed
- Owner approves coordinate data run and map provider (D04).

## Rollback
Flag off; restore coordinates from snapshot if a run was bad.

## Report back (use the template in PROTOCOL.md section 9)
