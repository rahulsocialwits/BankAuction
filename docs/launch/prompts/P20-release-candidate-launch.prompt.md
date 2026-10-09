# Prompt for P20 - Hardening, full acceptance and launch readiness

Paste everything inside the fence.

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P20 - Hardening, full acceptance and launch readiness** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P20-release-candidate-launch.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P20, and docs/launch/data/issues_2026-10-09.csv rows where phase = P20
6. Spec sections 14, 15, 19, 20 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: all launch-critical phases. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Prove the whole system works together, then take a go/no-go decision with evidence.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- Accessibility, performance targets, load test, backup restore and full acceptance suite not yet done.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. Which phases are Done in PHASE_STATUS.md and which launch mode applies?  -> look at: PHASE_STATUS.md; DECISIONS.md D06 (launch mode)
2. Which acceptance tests AT-01..AT-20 already pass, with evidence?  -> look at: data/acceptance_tests.csv; CI; live smoke results
3. When was the last backup restore test?  -> look at: OPERATIONS.md; owner

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- A feature is 'live' only if it is deployed AND production-smoke-tested.
- Any failed launch-critical AT blocks launch. Optional phases (15, 17-19) can ship later behind flags if the owner says so.
- Do not deploy; prepare the release and ask for explicit owner approval.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p20-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP20.1 Accessibility audit and fixes (keyboard, focus, labels, contrast).
- WP20.2 Core Web Vitals targets set and measured.
- WP20.3 Load test to the owner-approved target (D13) on a test environment.
- WP20.4 Backup restore test and rollback rehearsal.
- WP20.5 Run AT-01..AT-20 and record evidence in data/acceptance_tests.csv.
- WP20.6 Production smoke test script: homepage, search, city, map, detail, sign-in, pricing, payment sandbox, alerts, admin health (AT-20).
- WP20.7 Release notes, monitoring signals, owner sign-off sheet.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-01 to AT-20.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] All launch-critical ATs pass with evidence.
- [ ] Owner signs the release checklist.
- [ ] Post-deploy smoke test passes.

## 10. STOP AND ASK the owner before
- Owner go/no-go and explicit deploy approval.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not deploy. Prepare the release and ask for explicit approval.
- Do not mark anything live unless it is deployed and production-smoke-tested.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Documented rollback tested in WP20.4.

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
