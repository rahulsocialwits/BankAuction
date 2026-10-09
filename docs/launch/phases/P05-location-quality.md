# P05 - Location data quality and city pages' foundation

**Launch-critical:** Yes  |  **Depends on:** P01, P03, P04  |  **Spec sections:** 3.3, 4.6, 6
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P05`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Most published properties get a verified canonical city, state and locality, and the remainder is visible, reported and honestly labelled. Never guess.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- ~5,200 of 9,304 published have no canonical city; Nashik 8 vs 68 keyword matches (Ozar, Sinnar, Eklahare, Deolali, Igatpuri, Malegaon not matched).
- City filter is canonical-only (PR #25) while state/locality still fall back to text.
- Variants: Vasai / Vasai Virar, Aurangabad / Chhatrapati Sambhajinagar (Bihar also has an Aurangabad).
- 972 city entries; property types sum 8,919 vs 9,304 (385 uncategorised).
- Detail page shows 'Pune' before the lender for a Nashik flat (cause unknown).

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| Why are rows empty: job not running, job failing, or rows checked with no city? | BASELINE.md (P01); src/lib/pipeline/geo.ts; tick.ts; run history in admin |
| What does canonCity() normalise and what is missing? | src/lib/pipeline/locations.ts and its tests |
| How do city, state and locality filters differ? | src/lib/queries/publishedWhere.ts |
| Where is unassignedActive computed and shown? | src/lib/domain/cityCounts.ts, src/lib/queries/cities.ts, city and cities pages |
| Is there an admin screen for the location backlog? | src/app/admin/(shell)/localities, engine pages |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- If the AI job is not running: fix scheduling/provider FIRST. Do not write a new geocoder.
- If rows were checked and returned no city: list them for review, do not re-run blindly. Consider a re-check with improved prompt using PIN/state, in a sample first.
- Production writes (backfill) require written owner approval, a before-snapshot, a sample review (50 rows), and an after-report. No exceptions.
- State-aware variant merging: never merge names across states.
- Interim visibility: city pages and city search show a labelled link 'N more listings mention <city>, not yet location-verified' (code only, no data change).
- If D02 says restore text fallback instead, implement it with an explicit 'unverified' label, never silently.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP5.1 Variant map in canonCity (state-aware) + tests.
- WP5.2 'Also mentions' link on city page and city-filtered search + tests (AT-05).
- WP5.3 Admin location-backlog report (counts, sample list, checked-but-empty list).
- WP5.4 Operator runbook for the location run: snapshot query, run steps via existing job, sample review, after-counts, rollback by restoring snapshot.
- WP5.5 After approval and run: re-measure and record in BASELINE.md.
- WP5.6 Uncategorised-category report; hide empty categories.
- WP5.7 Investigate and fix the 'Pune' prefix on detail pages.

## Step 4 - Tests required
- AT-01 city count parity (still holds).
- AT-05 unknown city reported separately, no fuzzy assignment.
- canonCity variant tests.

## Exit gate (all must be true before this phase is DONE)
- [ ] Unassigned share measured; target under 5% or an owner-accepted explanation.
- [ ] Every unassigned property is visible in the admin report.
- [ ] Nashik-type searches show verified results plus the labelled link.
- [ ] Before/after counts and rollback recorded.

## Owner approvals needed
- Owner approves the location run in writing (scope, batch size, rollback).

## Rollback
Restore geo* columns from the snapshot for the affected ids. Keep snapshot until owner signs off.

## Report back (use the template in PROTOCOL.md section 9)
