# Prompt for P06 - Source compliance and ingestion health

Paste everything inside the fence.

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P06 - Source compliance and ingestion health** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P06-source-compliance-ingestion.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P06, and docs/launch/data/issues_2026-10-09.csv rows where phase = P06
6. Spec sections 1.2, 6 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P03. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Every source is registered, permitted, healthy and traceable. Nothing is added or scraped without permission.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- No explicit terms-review record per source.
- Run states lack partial / no-change / stale.
- scrap-demo admin tooling exists: confirm it cannot reach restricted sources.
- findauction.in must never be ingested.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. List every enabled source and its collection method.  -> look at: src/data-sources/registry.ts; admin sources and feeds pages; FeedSource rows (operator)
2. Do robots/401/403/CAPTCHA stop the run and get recorded?  -> look at: src/data-sources/feeds/robotsGate.ts, sourceProtection.ts; tests/robotsRules.test.ts, httpStatus.test.ts, sourceProtection.test.ts
3. Is findauction.in referenced anywhere?  -> look at: grep -ri findauction .
4. What provenance is stored (source URL, retrieval time, extraction version)?  -> look at: SourceRecord, fieldProvenance.ts, fieldObservations.ts
5. How are duplicates handled?  -> look at: src/lib/deduplication, pipeline/duplicates.ts, admin duplicates page, tests/dedupe.test.ts

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- Never add a source. Only document and gate existing ones.
- If a source lacks a recorded permission review, mark it 'unreviewed' and propose disabling pending owner decision; do not disable automatically.
- Refusals are final: record and stop; never retry as transient.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p06-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP6.1 Source register screen/fields: terms-review date, method, robots state, last success, coverage, limitations.
- WP6.2 Extend run states (success, no-change, blocked, partial, failed, stale) with tests.
- WP6.3 Guard test asserting findauction.in is absent from registry and config.
- WP6.4 Freshness: store and expose last-checked per property (feeds P08).

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-13 source controls.
- Run-state transition tests.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] AT-13 passes.
- [ ] Every enabled source has a register entry or an explicit 'unreviewed' flag with owner decision logged.

## 10. STOP AND ASK the owner before
- Owner approves the source register and permitted methods (D06).
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not add, enable or scrape any source. Do not touch findauction.in.
- Do not retry a refused request (401/403/CAPTCHA/robots) as if transient.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Revert PR. Register fields are additive.

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
