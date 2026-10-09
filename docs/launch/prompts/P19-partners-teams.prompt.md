# Prompt for P19 - Partner programme and team features

Paste everything inside the fence.

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P19 - Partner programme and team features** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P19-partners-teams.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P19, and docs/launch/data/issues_2026-10-09.csv rows where phase = P19
6. Spec sections 9 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P13, P14, P16. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Referral codes, attribution, commissions, payouts, partner dashboard, and team seats/pipeline, built only after the commission rulebook is approved.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- Not built. Commission references in the strategy conflict; no approved rulebook.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. Is D09/D11 (commission schedule, team scope) answered?  -> look at: DECISIONS.md
2. Do payments (P14) support refunds and clawback data?  -> look at: P14 gate evidence

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- Commission on money actually collected; pay after refund window; claw back refunds.
- Partners see only their own referred users in aggregate.
- Never pay bank/NBFC/ARC officers.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p19-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP19.1 Partner application and agreement acceptance.
- WP19.2 Codes/links and 30-day last-code attribution.
- WP19.3 Commission engine, clawback, statements.
- WP19.4 Partner dashboard and exports.
- WP19.5 Team: seats, roles, shared shortlist, pipeline, access log.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-14 partner attribution.
- AT-17 team separation and private notes.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] AT-14 and AT-17 team parts pass on sandbox data.

## 10. STOP AND ASK the owner before
- Owner: single commission schedule, tax rules, team scope.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not build before the commission rulebook is approved.
- Do not pay or credit anyone in any real system.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Flags off; tables unused.

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
