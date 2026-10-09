# Prompt for P08 - Property cards and detail page to spec

Paste everything inside the fence.

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P08 - Property cards and detail page to spec** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P08-cards-detail-page.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P08, and docs/launch/data/issues_2026-10-09.csv rows where phase = P08
6. Spec sections 4.4, 4.7 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P04, P06, P07. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
A buyer sees the right facts, where each came from, how fresh it is, and honest limits.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- Detail page lacks last-checked, source freshness, risk indicators, save/share/compare/alert, full disclaimer.
- Similar Properties ignores location (Nashik flat shows Bengaluru/Surat/Morbi).
- Premium copy promises borrower names (privacy conflict, see P11).
- Placeholder/media rules unverified.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. Which spec 4.7 items exist on the detail page?  -> look at: src/app/(site)/property/[slug]/page.tsx
2. How is missing data shown ('Not available in source')?  -> look at: detail and PropertyCard components
3. Is media shown only when permitted?  -> look at: src/lib/media.ts, api/media, api/img routes, Media model fields
4. What freshness data exists per property?  -> look at: lib/pipeline/lastSeen*.ts (from P06)

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- Build in this order: freshness line, honest missing-data labels, disclaimer block, similar-by-area, save/share, then compare/alert hooks (stubs gated by P12-P15).
- If media permission fields do not exist, use neutral placeholders everywhere until P17.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p08-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP8.1 Last-checked + source notice link.
- WP8.2 Missing-data labels and uncertainty labels.
- WP8.3 Disclaimer block per spec 4.7 and no forbidden claims (test).
- WP8.4 Similar properties by city/state/type.
- WP8.5 Share/save actions; compare and alert buttons wired when P12/P15 land.
- WP8.6 Reserve-price history with per-value source.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- publicClaims test extended to detail page.
- Similar-properties unit test.
- Rendering tests for missing-data states.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] Detail page meets spec 4.7 items that do not depend on later phases.
- [ ] No forbidden claim strings.

## 10. STOP AND ASK the owner before
- Owner approves disclaimer wording.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not add claims like verified title or guaranteed returns.
- Do not show media unless rights are confirmed; use the neutral placeholder.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Revert PR.

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
