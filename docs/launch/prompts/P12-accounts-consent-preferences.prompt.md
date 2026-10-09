# Prompt for P12 - Accounts, consent and preferences

Paste everything inside the fence.

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P12 - Accounts, consent and preferences** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P12-accounts-consent-preferences.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P12, and docs/launch/data/issues_2026-10-09.csv rows where phase = P12
6. Spec sections 7.1, 8 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P11. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Users can sign in, recover access, save things and control communication consent.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- Email/password exists; no phone/OTP and no recovery flow found.
- No consent records or channel opt-ins.
- Saved properties/searches pages exist; alert history, invoices and support requests do not.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. What auth exists and how are sessions stored?  -> look at: src/lib/auth/userSession.ts, password.ts; login/register pages; /api/me
2. What do SavedProperty and SavedSearch store?  -> look at: prisma models; saved-properties and my-alerts pages
3. Is there any email sending capability?  -> look at: grep for mail providers; env vars (none found on 9 Oct)

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- Choose the simplest secure recovery path (email link). Phone OTP only if the owner approves a provider.
- Consent is per channel and purpose with timestamp and source; opt-out is one click.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p12-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP12.1 Password reset and email verification.
- WP12.2 ConsentRecord model + preferences page.
- WP12.3 Account page: saved items, subscriptions placeholder, support link.
- WP12.4 Session hardening tests.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- Auth flow tests with a test mail transport.
- Consent record tests.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] Sign-up, sign-in, recovery and preference changes work in preview with a sandbox mail provider.
- [ ] Consent stored with timestamp.

## 10. STOP AND ASK the owner before
- Owner approves mail provider and cost; never send real campaigns while testing.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not send real emails or messages. Use a test transport.
- Do not create real user accounts on production.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Revert PR; new tables unused.

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
