# Prompt for P17 - Risk intelligence, compare, client reports and media rights

Paste everything inside the fence.

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P17 - Risk intelligence, compare, client reports and media rights** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P17-risk-compare-reports-media.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P17, and docs/launch/data/issues_2026-10-09.csv rows where phase = P17
6. Spec sections 4.7, 4.8, 5, 10 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P08, P13, P16. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Evidence-backed descriptive risk flags (never a score), comparison and branded reports, and media shown only where rights are cleared.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- No risk model or UI; no compare; no client card/report; media permission fields unconfirmed.
- Risk rubric and media policy are open decisions.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. What risk-related facts are already stored (possession text, completeness)?  -> look at: Auction.possessionStatus; pipeline/completeness.ts
2. Which media exist and with what permission fields?  -> look at: Media, MediaAsset, SourceMedia models; MediaLibrary admin
3. Which decisions are answered?  -> look at: DECISIONS.md D05 (risk rubric), D07 (media policy), D12 (legal boundary)

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- Show only flags with cited evidence and a review state; unknown is never displayed as clear.
- No numeric score unless D05 approves a rubric.
- Unknown/unreviewed media shows a neutral placeholder.
- Reports carry timestamp, source links and missing-data markers; never claim legal opinion.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p17-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP17.1 RiskFlag + review state models; reviewer UI in admin.
- WP17.2 Display flags with evidence and date.
- WP17.3 Compare page and URL.
- WP17.4 Client card/report generator with expiring, revocable share links.
- WP17.5 Media rights fields, gating and placeholder rule.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-12 risk provenance.
- AT-15 client report.
- AT-16 media rights.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] AT-12, AT-15, AT-16 pass.
- [ ] Risk copy reviewed by owner/legal.

## 10. STOP AND ASK the owner before
- Owner: D05, D07, D12.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not ship a numeric legal/risk score. Do not present unreviewed flags as clear.
- Do not show unapproved media.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Flag off each feature.

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
