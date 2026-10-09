# Prompt for P05 - Location data quality and city pages' foundation

Paste everything inside the fence.

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P05 - Location data quality and city pages' foundation** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P05-location-quality.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P05, and docs/launch/data/issues_2026-10-09.csv rows where phase = P05
6. Spec sections 3.3, 4.6, 6 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P01, P03, P04. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Most published properties get a verified canonical city, state and locality, and the remainder is visible, reported and honestly labelled. Never guess.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- ~5,200 of 9,304 published have no canonical city; Nashik 8 vs 68 keyword matches (Ozar, Sinnar, Eklahare, Deolali, Igatpuri, Malegaon not matched).
- City filter is canonical-only (PR #25) while state/locality still fall back to text.
- Variants: Vasai / Vasai Virar, Aurangabad / Chhatrapati Sambhajinagar (Bihar also has an Aurangabad).
- 972 city entries; property types sum 8,919 vs 9,304 (385 uncategorised).
- Detail page shows 'Pune' before the lender for a Nashik flat (cause unknown).

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. Why are rows empty: job not running, job failing, or rows checked with no city?  -> look at: BASELINE.md (P01); src/lib/pipeline/geo.ts; tick.ts; run history in admin
2. What does canonCity() normalise and what is missing?  -> look at: src/lib/pipeline/locations.ts and its tests
3. How do city, state and locality filters differ?  -> look at: src/lib/queries/publishedWhere.ts
4. Where is unassignedActive computed and shown?  -> look at: src/lib/domain/cityCounts.ts, src/lib/queries/cities.ts, city and cities pages
5. Is there an admin screen for the location backlog?  -> look at: src/app/admin/(shell)/localities, engine pages

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- If the AI job is not running: fix scheduling/provider FIRST. Do not write a new geocoder.
- If rows were checked and returned no city: list them for review, do not re-run blindly. Consider a re-check with improved prompt using PIN/state, in a sample first.
- Production writes (backfill) require written owner approval, a before-snapshot, a sample review (50 rows), and an after-report. No exceptions.
- State-aware variant merging: never merge names across states.
- Interim visibility: city pages and city search show a labelled link 'N more listings mention <city>, not yet location-verified' (code only, no data change).
- If D02 says restore text fallback instead, implement it with an explicit 'unverified' label, never silently.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p05-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP5.1 Variant map in canonCity (state-aware) + tests.
- WP5.2 'Also mentions' link on city page and city-filtered search + tests (AT-05).
- WP5.3 Admin location-backlog report (counts, sample list, checked-but-empty list).
- WP5.4 Operator runbook for the location run: snapshot query, run steps via existing job, sample review, after-counts, rollback by restoring snapshot.
- WP5.5 After approval and run: re-measure and record in BASELINE.md.
- WP5.6 Uncategorised-category report; hide empty categories.
- WP5.7 Investigate and fix the 'Pune' prefix on detail pages.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-01 city count parity (still holds).
- AT-05 unknown city reported separately, no fuzzy assignment.
- canonCity variant tests.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] Unassigned share measured; target under 5% or an owner-accepted explanation.
- [ ] Every unassigned property is visible in the admin report.
- [ ] Nashik-type searches show verified results plus the labelled link.
- [ ] Before/after counts and rollback recorded.

## 10. STOP AND ASK the owner before
- Owner approves the location run in writing (scope, batch size, rollback).
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not run enrichLocations or any backfill against production. Write the runbook and wait for written approval.
- Do not assign cities by fuzzy text matching. Do not merge variant names across states.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Restore geo* columns from the snapshot for the affected ids. Keep snapshot until owner signs off.

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
