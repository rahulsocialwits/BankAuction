# P01 - Orient, baseline and owner decisions

**Launch-critical:** Yes  |  **Depends on:** none  |  **Spec sections:** 0, 17, 18, 19
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P01`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Know exactly what exists, what is broken and what the owner has decided, before anyone changes code or data. Produce the numbers every later phase needs.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- ~56% of published properties have no canonical city (Nashik: 8 by city filter vs 68 by keyword).
- Map shows 0 pins in production (coordinates missing).
- Admin console and CI/Vercel results for PRs #25/#26 were never audited.
- Owner decisions in DECISIONS.md are mostly OPEN.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| Is CI green on main, and what do the Vercel production deployment logs say? | GitHub Actions ci.yml runs; Vercel dashboard (ask owner for read access or screenshots) |
| Which environment variables and services exist (DB, AI relay, cron secret, payment keys)? | docs/ENVIRONMENT.md; Vercel settings (names only, never print values) |
| How many published properties have: geoCity set, geoCheckedAt set but no city, coordinates, a dated round, a category? | Read-only counts: docs/launch/data/baseline_queries.sql run by the OPERATOR, or admin Dashboard/Data Engine screenshots |
| Is the AI location job (enrichLocations in src/lib/pipeline/geo.ts) running and draining its backlog? | admin Data Engine / run history; Settings > AI; src/lib/pipeline/tick.ts |
| What does DECISIONS.md already say? | docs/launch/DECISIONS.md |
| Are the test suite and type-check healthy? | npm test, npx tsc --noEmit (needs generated Prisma client; if the sandbox cannot generate it, say so) |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- If a number cannot be obtained without touching production data, do NOT guess: write it as NOT VERIFIED and ask the owner or operator for the read-only query result.
- Never run SQL against production yourself. Provide the query file and ask the operator.
- Every open decision gets a recommended default so the owner can answer 'defaults'.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP1.1 Fill docs/launch/BASELINE.md with the numbers above (source + date for each).
- WP1.2 Update DECISIONS.md with each owner answer; mark the phases they unblock.
- WP1.3 Confirm which phases are launch-critical for the chosen launch mode (free discovery launch vs paid launch).
- WP1.4 Record the root cause of the missing-city backlog (job not running vs checked-with-no-city). This decides P05.

## Step 4 - Tests required
- No code tests. Evidence: BASELINE.md complete, every figure sourced.

## Exit gate (all must be true before this phase is DONE)
- [ ] BASELINE.md has every figure or an explicit NOT VERIFIED with an owner action.
- [ ] DECISIONS.md D01-D08 answered or defaulted in writing.
- [ ] CI/Vercel state recorded.

## Owner approvals needed
- Owner answers decisions. Owner or operator runs read-only baseline queries.

## Rollback
Documentation only. Nothing to roll back.

## Report back (use the template in PROTOCOL.md section 9)
