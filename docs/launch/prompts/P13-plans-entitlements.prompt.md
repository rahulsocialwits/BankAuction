# Prompt for P13 - Plans, entitlements and premium access control

Paste everything inside the fence.

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P13 - Plans, entitlements and premium access control** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P13-plans-entitlements.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P13, and docs/launch/data/issues_2026-10-09.csv rows where phase = P13
6. Spec sections 7.2, 7.3, 2 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P11, P12. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Free and paid access is enforced on the server for every page, API and document, with no cache leakage.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- No tiers or entitlements; pricing page shows 2,500/4,000/7,000 vs spec proposals 1,499/2,699/4,999.
- Founding, single, team and Private Desk plans absent.
- Documents are open or unlock-gated only by UI.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. What fields and documents are gated today and how?  -> look at: property page 'Unlock'; Document models; api routes
2. Which plan prices are approved?  -> look at: DECISIONS.md D03
3. How is caching configured for pages that vary by user?  -> look at: unstable_cache usage, route segment config, Cache-Control headers

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- No plan goes live without D03 (prices, GST wording). Build plans as data, not code.
- Entitlement checks live in one server module; pages and APIs call it. Never mask only in the browser.
- Cache: any response that varies by entitlement is not shared-cached.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p13-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP13.1 Plan, Subscription, Entitlement models.
- WP13.2 Central access module + masked-field serializer.
- WP13.3 Document access via expiring signed links.
- WP13.4 Pricing page driven by approved plans.
- WP13.5 Free-tier delay/masking only if D-FREE approved.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-08 premium access incl. direct URL and cache tests.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] AT-08 passes.
- [ ] Pricing page equals approved plans.

## 10. STOP AND ASK the owner before
- Owner approves prices, GST wording, free-tier rules (D03, D02b).
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not publish plan prices before the owner approves them.
- Do not rely on browser-side masking.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Flag off entitlements; public content stays visible.

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
