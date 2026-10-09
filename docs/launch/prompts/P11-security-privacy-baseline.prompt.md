# Prompt for P11 - Security and privacy baseline

Paste everything inside the fence.

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P11 - Security and privacy baseline** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P11-security-privacy-baseline.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P11, and docs/launch/data/issues_2026-10-09.csv rows where phase = P11
6. Spec sections 13 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P02. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Standard web hardening and a lawful, minimal approach to personal data before any accounts or payments go live.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- Only HSTS present; no CSP, X-Frame-Options, nosniff, Referrer-Policy.
- No rate limiting on public forms/login found.
- Premium copy sells 'full borrower names and contact details'.
- No consent records, incident or deletion process.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. Which headers does the production site send?  -> look at: curl -sI or fetch of /, /property/<slug>, /api/*
2. Where are forms and login actions and what validation do they use?  -> look at: src/lib/validation; contact page action; admin/login/actions.ts; login/register
3. Where is borrower data stored and displayed?  -> look at: grep -ri borrower src prisma; tests/borrowerExposure.test.ts
4. Which secrets and keys are used and how are they redacted in logs?  -> look at: docs/SECURITY.md; src/lib/apiKeys.ts

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- Add headers in next.config with a CSP that works with Leaflet tiles and analytics; test in preview before production.
- Borrower names: do not display or sell them until D07 gives a documented lawful need. Default: remove from copy and mask.
- Rate limit by IP+route with a small in-DB or edge counter; no new paid service without approval.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p11-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP11.1 Security headers + tests.
- WP11.2 Rate limits on contact, login, register, API.
- WP11.3 Borrower-data policy implemented in UI and API shape (apiShape.ts).
- WP11.4 Consent and data-deletion process doc; privacy-policy page review with qualified reviewer.
- WP11.5 Dependency update policy and audit.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- Header presence test.
- Rate-limit tests.
- AT-17 (borrower minimisation part).
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] Headers present in production preview.
- [ ] No borrower names exposed publicly or via API.
- [ ] Rate limits proven by test.

## 10. STOP AND ASK the owner before
- Owner: borrower-data policy (D07); legal review of privacy text.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not display or sell borrower names. Do not print secrets or tokens.
- Do not add a paid service without approval.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Revert PR; headers in config only.

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
