# Prompt for P09 - Coordinates and map discovery

Paste everything inside the fence.

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P09 - Coordinates and map discovery** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P09-coordinates-map.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P09, and docs/launch/data/issues_2026-10-09.csv rows where phase = P09
6. Spec sections 4.5 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P03, P05, P07. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
The map shows real pins from reliable coordinates, with clustering, 'search this area', and honest states. If coordinates are not ready, the map is hidden by flag.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- Production map shows 0 pins on all pages tested.
- No clustering, no search-this-area, no detail-page map.
- Map provider is OpenStreetMap tiles with no key: needs owner acceptance for production traffic.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. What share of published properties have valid coordinates?  -> look at: BASELINE.md; src/lib/map/coordinates.ts validation rules
2. Which sources carry coordinates natively?  -> look at: src/data-sources adapters; SourceRecord raw payloads (operator query)
3. Is a geocoder configured anywhere?  -> look at: grep -ri geocode src; env vars
4. What does the map UI do today in each state?  -> look at: src/components/PropertyMapView.tsx, ViewToggle.tsx; tests/propertyMap.test.ts

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- Coordinates come from source data first. Geocoding addresses to pins is allowed ONLY from a provider the owner approved, with a precision flag, and never for uncertain addresses.
- If under 30% of active listings are mappable at launch time, set the map flag OFF (hide toggle).
- Provider choice is D04. Without approval keep OSM and note quotas and attribution.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p09-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP9.1 Coordinate source audit and data runbook (operator-run, approval needed).
- WP9.2 Precision field usage and display rule.
- WP9.3 Clustering (leaflet.markercluster or equivalent, license checked).
- WP9.4 'Search this area' with bounds query.
- WP9.5 Detail-page map using the same validation.
- WP9.6 Loading, provider-error and no-coordinate states.
- WP9.7 Flag to hide the map toggle.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-06 map/list parity.
- Bounds query tests.
- Cluster and selection reducer tests.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] Either real pins visible in production on at least the top cities, or the map is flagged off.
- [ ] AT-06 passes.

## 10. STOP AND ASK the owner before
- Owner approves coordinate data run and map provider (D04).
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not geocode uncertain addresses or invent pins. Do not add a paid map provider without approval.
- Do not write coordinates to production.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Flag off; restore coordinates from snapshot if a run was bad.

## 13. Final output (exactly this structure)
1. Entry audit table (question | evidence | classification)
2. Decisions taken and why (cite rules and any OPEN decision you defaulted)
3. What changed (files, PR links) and what you deliberately did not change
4. Tests: added / run / result (paste output) / NOT RUN
5. Stages, stated separately: implemented | tested | merged | deployed | production smoke-tested (yes / no / NOT VERIFIED)
6. Risks, rollback, monitoring signal
7. Needs from owner (approvals and decisions)
8. PHASE_STATUS.md updated in your PR: yes/no
Then stop. Do not start the next phase until I say so.
````
