# Prompt for P18 - Analytics, content and localisation

Paste everything inside the fence.

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P18 - Analytics, content and localisation** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P18-analytics-content-localisation.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P18, and docs/launch/data/issues_2026-10-09.csv rows where phase = P18
6. Spec sections 10, 11, 17 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P10, P12. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Consent-aware measurement, a content system for guides and Auction of the Day, and a localisation framework starting with approved languages.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- No analytics found.
- Blog/pages admin exists; Auction of the Day absent.
- No language framework.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. Is any tracking present?  -> look at: grep for analytics tags; layout files
2. What content types does the admin manage?  -> look at: admin blog, pages, home config
3. Which languages are approved for wave 1?  -> look at: DECISIONS.md D08

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- No analytics before a consent banner works. Choose one tool (owner approval).
- Translations are labelled; source text stays visible.
- Start with one extra language only after D08.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p18-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP18.1 Consent banner + analytics wiring + UTM capture + funnel events.
- WP18.2 Auction of the Day (admin-picked) and homepage section.
- WP18.3 i18n routing + translated nav and filters for approved wave.
- WP18.4 Guide/FAQ templates with update dates and source links.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- Consent gating test (no events before consent).
- i18n fallback test.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] Funnel events visible; consent respected; first language wave live behind flag.

## 10. STOP AND ASK the owner before
- Owner: analytics tool, languages, translation owner.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not load analytics before consent.
- Do not present machine translation as source text.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Flags off.

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
