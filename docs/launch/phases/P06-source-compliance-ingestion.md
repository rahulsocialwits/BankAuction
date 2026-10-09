# P06 - Source compliance and ingestion health

**Launch-critical:** Yes  |  **Depends on:** P03  |  **Spec sections:** 1.2, 6
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P06`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Every source is registered, permitted, healthy and traceable. Nothing is added or scraped without permission.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- No explicit terms-review record per source.
- Run states lack partial / no-change / stale.
- scrap-demo admin tooling exists: confirm it cannot reach restricted sources.
- findauction.in must never be ingested.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| List every enabled source and its collection method. | src/data-sources/registry.ts; admin sources and feeds pages; FeedSource rows (operator) |
| Do robots/401/403/CAPTCHA stop the run and get recorded? | src/data-sources/feeds/robotsGate.ts, sourceProtection.ts; tests/robotsRules.test.ts, httpStatus.test.ts, sourceProtection.test.ts |
| Is findauction.in referenced anywhere? | grep -ri findauction . |
| What provenance is stored (source URL, retrieval time, extraction version)? | SourceRecord, fieldProvenance.ts, fieldObservations.ts |
| How are duplicates handled? | src/lib/deduplication, pipeline/duplicates.ts, admin duplicates page, tests/dedupe.test.ts |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- Never add a source. Only document and gate existing ones.
- If a source lacks a recorded permission review, mark it 'unreviewed' and propose disabling pending owner decision; do not disable automatically.
- Refusals are final: record and stop; never retry as transient.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP6.1 Source register screen/fields: terms-review date, method, robots state, last success, coverage, limitations.
- WP6.2 Extend run states (success, no-change, blocked, partial, failed, stale) with tests.
- WP6.3 Guard test asserting findauction.in is absent from registry and config.
- WP6.4 Freshness: store and expose last-checked per property (feeds P08).

## Step 4 - Tests required
- AT-13 source controls.
- Run-state transition tests.

## Exit gate (all must be true before this phase is DONE)
- [ ] AT-13 passes.
- [ ] Every enabled source has a register entry or an explicit 'unreviewed' flag with owner decision logged.

## Owner approvals needed
- Owner approves the source register and permitted methods (D06).

## Rollback
Revert PR. Register fields are additive.

## Report back (use the template in PROTOCOL.md section 9)
