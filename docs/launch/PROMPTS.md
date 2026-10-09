# Phase prompts (copy-paste)

One self-contained prompt per phase. Paste the whole fenced block into any LLM that has access to this repository. Work phases in order. Start with the master prompt if you are resuming.

## Master prompt (resume from wherever the project is)

```text
You are working on BankAuction.co in this repository (rahulsocialwits/BankAuction). Read docs/launch/PROTOCOL.md and follow it exactly. Open docs/launch/PHASE_STATUS.md and find the first phase that is not DONE whose dependencies are DONE. Run that phase's entry audit (docs/launch/phases/Pxx-*.md) BEFORE changing anything, post the audit table, then decide, plan, implement in small PRs, verify, and report using the template in PROTOCOL.md section 9. Stop at every approval gate. Never merge, deploy, run production SQL, apply migrations, or change production data. When the phase's exit gate is met with evidence, update PHASE_STATUS.md and stop for my review.
```

| Phase | Title | File |
|---|---|---|
| P01 | Orient, baseline and owner decisions | prompts/P01-orient-baseline-decisions.prompt.md |
| P02 | Engineering foundation and release process | prompts/P02-engineering-foundation.prompt.md |
| P03 | Data model and provenance design | prompts/P03-data-model-design.prompt.md |
| P04 | Lifecycle and counting core | prompts/P04-lifecycle-counting-core.prompt.md |
| P05 | Location data quality and city pages' foundation | prompts/P05-location-quality.prompt.md |
| P06 | Source compliance and ingestion health | prompts/P06-source-compliance-ingestion.prompt.md |
| P07 | Search, filters, sort and pagination everywhere | prompts/P07-search-filters-pagination.prompt.md |
| P08 | Property cards and detail page to spec | prompts/P08-cards-detail-page.prompt.md |
| P09 | Coordinates and map discovery | prompts/P09-coordinates-map.prompt.md |
| P10 | Homepage, city/region/institution pages and SEO | prompts/P10-home-city-seo.prompt.md |
| P11 | Security and privacy baseline | prompts/P11-security-privacy-baseline.prompt.md |
| P12 | Accounts, consent and preferences | prompts/P12-accounts-consent-preferences.prompt.md |
| P13 | Plans, entitlements and premium access control | prompts/P13-plans-entitlements.prompt.md |
| P14 | Payments, invoices and refunds | prompts/P14-payments-billing.prompt.md |
| P15 | Alerts and notifications | prompts/P15-alerts-notifications.prompt.md |
| P16 | Admin operations, audit log and support | prompts/P16-admin-operations-support.prompt.md |
| P17 | Risk intelligence, compare, client reports and media rights | prompts/P17-risk-compare-reports-media.prompt.md |
| P18 | Analytics, content and localisation | prompts/P18-analytics-content-localisation.prompt.md |
| P19 | Partner programme and team features | prompts/P19-partners-teams.prompt.md |
| P20 | Hardening, full acceptance and launch readiness | prompts/P20-release-candidate-launch.prompt.md |

## P01 - Orient, baseline and owner decisions

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P01 - Orient, baseline and owner decisions** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P01-orient-baseline-decisions.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P01, and docs/launch/data/issues_2026-10-09.csv rows where phase = P01
6. Spec sections 0, 17, 18, 19 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: none. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Know exactly what exists, what is broken and what the owner has decided, before anyone changes code or data. Produce the numbers every later phase needs.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- ~56% of published properties have no canonical city (Nashik: 8 by city filter vs 68 by keyword).
- Map shows 0 pins in production (coordinates missing).
- Admin console and CI/Vercel results for PRs #25/#26 were never audited.
- Owner decisions in DECISIONS.md are mostly OPEN.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. Is CI green on main, and what do the Vercel production deployment logs say?  -> look at: GitHub Actions ci.yml runs; Vercel dashboard (ask owner for read access or screenshots)
2. Which environment variables and services exist (DB, AI relay, cron secret, payment keys)?  -> look at: docs/ENVIRONMENT.md; Vercel settings (names only, never print values)
3. How many published properties have: geoCity set, geoCheckedAt set but no city, coordinates, a dated round, a category?  -> look at: Read-only counts: docs/launch/data/baseline_queries.sql run by the OPERATOR, or admin Dashboard/Data Engine screenshots
4. Is the AI location job (enrichLocations in src/lib/pipeline/geo.ts) running and draining its backlog?  -> look at: admin Data Engine / run history; Settings > AI; src/lib/pipeline/tick.ts
5. What does DECISIONS.md already say?  -> look at: docs/launch/DECISIONS.md
6. Are the test suite and type-check healthy?  -> look at: npm test, npx tsc --noEmit (needs generated Prisma client; if the sandbox cannot generate it, say so)

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- If a number cannot be obtained without touching production data, do NOT guess: write it as NOT VERIFIED and ask the owner or operator for the read-only query result.
- Never run SQL against production yourself. Provide the query file and ask the operator.
- Every open decision gets a recommended default so the owner can answer 'defaults'.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p01-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP1.1 Fill docs/launch/BASELINE.md with the numbers above (source + date for each).
- WP1.2 Update DECISIONS.md with each owner answer; mark the phases they unblock.
- WP1.3 Confirm which phases are launch-critical for the chosen launch mode (free discovery launch vs paid launch).
- WP1.4 Record the root cause of the missing-city backlog (job not running vs checked-with-no-city). This decides P05.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- No code tests. Evidence: BASELINE.md complete, every figure sourced.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] BASELINE.md has every figure or an explicit NOT VERIFIED with an owner action.
- [ ] DECISIONS.md D01-D08 answered or defaulted in writing.
- [ ] CI/Vercel state recorded.

## 10. STOP AND ASK the owner before
- Owner answers decisions. Owner or operator runs read-only baseline queries.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not run any SQL yourself. Do not change code.
- Do not guess numbers: write NOT VERIFIED.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Documentation only. Nothing to roll back.

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

## P02 - Engineering foundation and release process

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P02 - Engineering foundation and release process** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P02-engineering-foundation.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P02, and docs/launch/data/issues_2026-10-09.csv rows where phase = P02
6. Spec sections 13 (last bullet), 19 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P01. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Make every later change safe: reliable CI, tests runnable by any contributor, feature flags, migration and rollback rules, and a release checklist.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- Sandbox could not generate Prisma client or run next build; 4 test files fail only because of that.
- No documented feature-flag mechanism for hiding unfinished features (for example the Map toggle).
- Backups and restore are undocumented.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. What does .github/workflows/ci.yml run (lint, type-check, test, build)?  -> look at: ci.yml
2. Do tests run without a database? Which need the Prisma client?  -> look at: tests/*.test.ts; package.json scripts
3. Is there a feature-flag or env-switch pattern already (NEXT_PUBLIC_*, SiteSettings)?  -> look at: src/lib/constants.ts; prisma model SiteSettings; docs/ENVIRONMENT.md
4. What are the documented deploy/rollback steps?  -> look at: docs/DEPLOYMENT.md, docs/OPERATIONS.md
5. How are Prisma migrations applied in production, and by whom?  -> look at: prisma/migrations; docs/DATABASE.md

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- If CI already runs lint+type-check+test+build, do not rebuild it; only fill gaps.
- If a flag mechanism exists, reuse it. Otherwise add ONE small helper (src/lib/flags.ts) backed by env vars; no new service.
- Migrations are written in a PR but NEVER applied by the LLM. The operator applies them after approval with a backup noted.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p02-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP2.1 Close CI gaps (type-check and build must run in CI).
- WP2.2 Add src/lib/flags.ts with documented flags and tests.
- WP2.3 Write docs/launch/RELEASE_CHECKLIST.md (PR, CI, preview review, owner approval, deploy, smoke test, rollback).
- WP2.4 Document backup and restore procedure with the hosting provider's real facts (ask owner).

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- Unit tests for flags helper.
- CI run showing all stages green (link it).
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] CI runs lint, type-check, tests and build on every PR.
- [ ] Flags helper merged and used by at least one feature.
- [ ] RELEASE_CHECKLIST.md approved by owner.

## 10. STOP AND ASK the owner before
- Owner approves checklist. Operator confirms backup facts.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not change application behaviour. Do not apply migrations.
- Do not add paid services.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Revert the PR. Flags default to current behaviour.

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

## P03 - Data model and provenance design

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P03 - Data model and provenance design** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P03-data-model-design.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P03, and docs/launch/data/issues_2026-10-09.csv rows where phase = P03
6. Spec sections 3.1, 5, 6, 10 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P01, P02. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Design (and write, but not apply) the schema changes the whole product needs, once, so later phases do not fight each other.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- No coordinate precision field.
- No Undated/Needs-Review lifecycle value.
- No Subscription, Entitlement, Invoice, ConsentRecord, AuditLog, SupportTicket, RiskFlag, ReviewState, Partner, Referral, Team models.
- No per-source terms-review record.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. Which of the entities in spec 3.1 already have a model, and which fields are missing?  -> look at: prisma/schema.prisma vs docs/launch/spec/PRD_v1.0.txt section 3.1
2. Which existing columns hold raw source values vs normalised values?  -> look at: Property, Auction, SourceRecord, PropertyChange, fieldProvenance.ts
3. Is there already an evidence/review model in use (fieldObservations, mergeLog, review.ts)?  -> look at: src/lib/pipeline/*
4. Which indexes support the filters the product needs (geoCity, auctionStart, reservePrice, bankId)?  -> look at: schema @@index lines

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- Additive migrations only: new tables/columns, nullable or defaulted. No drops, renames or rewrites of existing data.
- If a model already covers a need (for example Alert for alerts), extend it rather than adding a parallel model.
- One ADR file per significant decision in docs/launch/adr/.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p03-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP3.1 Write docs/launch/DATA_MODEL_IMPACT.md (entities, fields, indexes, migration order, which phase uses each).
- WP3.2 Implement only the migrations needed by P04-P09 first (coordinate precision, lifecycle undated flag if needed, indexes). Later models are created in their own phases.
- WP3.3 Add schema tests (prisma validate) to CI.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- prisma validate and migrate diff in CI.
- No data tests; migrations are structural.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] DATA_MODEL_IMPACT.md approved by owner.
- [ ] Migrations for P04-P09 written, reviewed, NOT applied until owner approval.
- [ ] Rollback SQL documented for each migration.

## 10. STOP AND ASK the owner before
- Owner approves applying each migration to production, with a backup confirmed.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not apply migrations or touch the database. Write them only.
- Do not drop, rename or rewrite any existing column or table.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Each migration ships with a down-script note. Additive changes can stay unused safely.

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

## P04 - Lifecycle and counting core

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P04 - Lifecycle and counting core** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P04-lifecycle-counting-core.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P04, and docs/launch/data/issues_2026-10-09.csv rows where phase = P04
6. Spec sections 3.2, 3.3 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P03. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
One central rule decides status and counts everywhere. Counts equal what users see.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- Undated open rounds currently count as ACTIVE; spec says exclude and report separately.
- 'Active' is 6,988 of 9,304 (75%), likely inflated.
- Cancelled and Postponed are excluded from active but not reported separately.
- /auctions has no Auction Today view.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. Which functions decide status and where else is status computed?  -> look at: src/lib/domain/auctionLifecycle.ts, deriveAuctionStatus.ts, resolveAuctionStatus.ts; grep for 'status' comparisons in src/app and src/components
2. What does DECISIONS.md D01 say about undated rounds?  -> look at: docs/launch/DECISIONS.md
3. Are IST day boundaries tested?  -> look at: tests/auctionLifecycle.test.ts, resolveAuctionStatus.test.ts
4. Which pages count properties and do they all use publishedWhere/activeAuctionWhere?  -> look at: grep -rn count src/app src/lib/queries

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- If D01 is OPEN, use the default (exclude undated from the active headline) but ship it behind a flag and state it in the PR.
- Never add a second status implementation. Extend the central helper and its tests.
- Report counts for: active, completed, cancelled, postponed, undated, no-round, unassigned city.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p04-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP4.1 Add Undated/Needs-Review handling to the central helper with boundary tests.
- WP4.2 Add a data-quality counts function used by admin and by tests (active, completed, cancelled, postponed, undated, end-before-start, no-round).
- WP4.3 Replace any component-local status logic.
- WP4.4 Add 'today' to status vocabulary where the UI lists statuses.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-02 lifecycle boundaries incl. Undated, Cancelled, Postponed.
- AT-03 distinct property counting.
- AT-04 no-round properties.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] AT-02, AT-03, AT-04 pass in CI.
- [ ] Homepage, city, search and admin counts come from the same helper.
- [ ] Undated count visible to admin.

## 10. STOP AND ASK the owner before
- Owner confirms D01 (undated rule).
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not create a second status/counting implementation.
- Do not change source facts or dates to make a status look right.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Revert PR; flag off restores previous counting.

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

## P05 - Location data quality and city pages' foundation

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P05 - Location data quality and city pages' foundation** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P05-location-quality.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P05, and docs/launch/data/issues_2026-10-09.csv rows where phase = P05
6. Spec sections 3.3, 4.6, 6 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P01, P03, P04. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Most published properties get a verified canonical city, state and locality, and the remainder is visible, reported and honestly labelled. Never guess.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- ~5,200 of 9,304 published have no canonical city; Nashik 8 vs 68 keyword matches (Ozar, Sinnar, Eklahare, Deolali, Igatpuri, Malegaon not matched).
- City filter is canonical-only (PR #25) while state/locality still fall back to text.
- Variants: Vasai / Vasai Virar, Aurangabad / Chhatrapati Sambhajinagar (Bihar also has an Aurangabad).
- 972 city entries; property types sum 8,919 vs 9,304 (385 uncategorised).
- Detail page shows 'Pune' before the lender for a Nashik flat (cause unknown).

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. Why are rows empty: job not running, job failing, or rows checked with no city?  -> look at: BASELINE.md (P01); src/lib/pipeline/geo.ts; tick.ts; run history in admin
2. What does canonCity() normalise and what is missing?  -> look at: src/lib/pipeline/locations.ts and its tests
3. How do city, state and locality filters differ?  -> look at: src/lib/queries/publishedWhere.ts
4. Where is unassignedActive computed and shown?  -> look at: src/lib/domain/cityCounts.ts, src/lib/queries/cities.ts, city and cities pages
5. Is there an admin screen for the location backlog?  -> look at: src/app/admin/(shell)/localities, engine pages

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- If the AI job is not running: fix scheduling/provider FIRST. Do not write a new geocoder.
- If rows were checked and returned no city: list them for review, do not re-run blindly. Consider a re-check with improved prompt using PIN/state, in a sample first.
- Production writes (backfill) require written owner approval, a before-snapshot, a sample review (50 rows), and an after-report. No exceptions.
- State-aware variant merging: never merge names across states.
- Interim visibility: city pages and city search show a labelled link 'N more listings mention <city>, not yet location-verified' (code only, no data change).
- If D02 says restore text fallback instead, implement it with an explicit 'unverified' label, never silently.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p05-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP5.1 Variant map in canonCity (state-aware) + tests.
- WP5.2 'Also mentions' link on city page and city-filtered search + tests (AT-05).
- WP5.3 Admin location-backlog report (counts, sample list, checked-but-empty list).
- WP5.4 Operator runbook for the location run: snapshot query, run steps via existing job, sample review, after-counts, rollback by restoring snapshot.
- WP5.5 After approval and run: re-measure and record in BASELINE.md.
- WP5.6 Uncategorised-category report; hide empty categories.
- WP5.7 Investigate and fix the 'Pune' prefix on detail pages.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-01 city count parity (still holds).
- AT-05 unknown city reported separately, no fuzzy assignment.
- canonCity variant tests.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] Unassigned share measured; target under 5% or an owner-accepted explanation.
- [ ] Every unassigned property is visible in the admin report.
- [ ] Nashik-type searches show verified results plus the labelled link.
- [ ] Before/after counts and rollback recorded.

## 10. STOP AND ASK the owner before
- Owner approves the location run in writing (scope, batch size, rollback).
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not run enrichLocations or any backfill against production. Write the runbook and wait for written approval.
- Do not assign cities by fuzzy text matching. Do not merge variant names across states.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Restore geo* columns from the snapshot for the affected ids. Keep snapshot until owner signs off.

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

## P06 - Source compliance and ingestion health

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

## P07 - Search, filters, sort and pagination everywhere

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P07 - Search, filters, sort and pagination everywhere** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P07-search-filters-pagination.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P07, and docs/launch/data/issues_2026-10-09.csv rows where phase = P07
6. Spec sections 4.3 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P04, P05. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Every list on the site filters, sorts and paginates predictably, shows true totals and never silently truncates.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- /auctions and /auctions/<status> show '48 auction(s)', no pager, page 2 repeats page 1.
- /auctions/today returns not found.
- ?keyword= returns everything; real param is ?q=.
- No sort options; no PIN-code, date-range or possession filter; chips/clear-all unconfirmed.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. Which pages list properties and how does each paginate?  -> look at: src/app/(site)/properties, auctions, city, bank, property-type pages
2. Which filter params exist and how are they parsed?  -> look at: properties/page.tsx, PropertyFilterForm.tsx, publishedWhere.ts
3. Is ordering deterministic (tiebreak by id)?  -> look at: listProperties.ts
4. Is pinCode stored anywhere queryable?  -> look at: prisma Property fields and addressText parsing

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- Prefer redirecting /auctions/* to /properties with the matching status filter over maintaining two list implementations. If the auctions pages have unique UX value, reuse the shared query and pager component.
- Add PIN filter only on a real column. If PIN exists only inside addressText, store it in P05/P03 migration first; do not regex at query time.
- Unknown params are ignored visibly or aliased, never silently return everything.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p07-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP7.1 Shared pager component and true totals on all lists.
- WP7.2 Fix /auctions/* and add Today view.
- WP7.3 Sort: newest, deadline, reserve low/high, relevance with id tiebreak, URL param.
- WP7.4 Filters: PIN, date range, possession; chips and clear-all.
- WP7.5 Param aliases (keyword->q).
- WP7.6 Empty-state with reset suggestions that do not broaden matching.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-07 pagination and stable sorting.
- Filter combination tests.
- Param alias tests.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] AT-07 passes on every list page.
- [ ] No page shows a count that differs from its total.

## 10. STOP AND ASK the owner before
- None (code only). Owner reviews previews.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not broaden matching silently to produce results.
- Do not regex PIN codes at query time.
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

## P08 - Property cards and detail page to spec

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

## P09 - Coordinates and map discovery

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P09 - Coordinates and map discovery** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P09-coordinates-map.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P09, and docs/launch/data/issues_2026-10-09.csv rows where phase = P09
6. Spec sections 4.5 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P03, P05, P07. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
The map shows real pins from reliable coordinates, with clustering, 'search this area', and honest states. If coordinates are not ready, the map is hidden by flag.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- Production map shows 0 pins on all pages tested.
- No clustering, no search-this-area, no detail-page map.
- Map provider is OpenStreetMap tiles with no key: needs owner acceptance for production traffic.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. What share of published properties have valid coordinates?  -> look at: BASELINE.md; src/lib/map/coordinates.ts validation rules
2. Which sources carry coordinates natively?  -> look at: src/data-sources adapters; SourceRecord raw payloads (operator query)
3. Is a geocoder configured anywhere?  -> look at: grep -ri geocode src; env vars
4. What does the map UI do today in each state?  -> look at: src/components/PropertyMapView.tsx, ViewToggle.tsx; tests/propertyMap.test.ts

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- Coordinates come from source data first. Geocoding addresses to pins is allowed ONLY from a provider the owner approved, with a precision flag, and never for uncertain addresses.
- If under 30% of active listings are mappable at launch time, set the map flag OFF (hide toggle).
- Provider choice is D04. Without approval keep OSM and note quotas and attribution.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p09-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP9.1 Coordinate source audit and data runbook (operator-run, approval needed).
- WP9.2 Precision field usage and display rule.
- WP9.3 Clustering (leaflet.markercluster or equivalent, license checked).
- WP9.4 'Search this area' with bounds query.
- WP9.5 Detail-page map using the same validation.
- WP9.6 Loading, provider-error and no-coordinate states.
- WP9.7 Flag to hide the map toggle.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-06 map/list parity.
- Bounds query tests.
- Cluster and selection reducer tests.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] Either real pins visible in production on at least the top cities, or the map is flagged off.
- [ ] AT-06 passes.

## 10. STOP AND ASK the owner before
- Owner approves coordinate data run and map provider (D04).
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not geocode uncertain addresses or invent pins. Do not add a paid map provider without approval.
- Do not write coordinates to production.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Flag off; restore coordinates from snapshot if a run was bad.

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

## P10 - Homepage, city/region/institution pages and SEO

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P10 - Homepage, city/region/institution pages and SEO** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P10-home-city-seo.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P10, and docs/launch/data/issues_2026-10-09.csv rows where phase = P10
6. Spec sections 4.1, 4.2, 4.6, 11 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P05, P07, P08. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Discovery pages are accurate, useful and indexable without thin or misleading pages.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- 930 city URLs in sitemap, many tiny cities (thin-page risk).
- Coverage counters hidden; no 'as of' timestamp.
- Mumbai vs MMR not separated; MMR list is a draft.
- No auction calendar, Auction of the Day, partner page.
- Indexation/pagination policy undocumented.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. What is in sitemap.ts and which pages are indexable?  -> look at: src/app/sitemap.ts, robots.ts, JsonLd.tsx, generateMetadata in pages
2. Which homepage sections from spec 4.2 exist?  -> look at: src/app/(site)/page.tsx
3. How many cities exceed the minimum-count threshold?  -> look at: cities.ts output; owner threshold in DECISIONS
4. Is structured data accurate (no fabricated fields)?  -> look at: JsonLd.tsx and property page output

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- Index a city page only if it has at least N verified properties (default N=5, owner can change).
- MMR view only after the owner validates the list (D09). Until then do not create it.
- Coverage counters must come from defined metrics with an as-of time or stay hidden.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p10-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP10.1 Index threshold and canonical/noindex rules + tests (AT-18).
- WP10.2 Coverage counters with definitions and as-of.
- WP10.3 City page map/list toggle and pager (after P07/P09).
- WP10.4 Auction calendar/deadlines page.
- WP10.5 Nav completion per 4.1.
- WP10.6 MMR page when approved.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-18 SEO checks.
- Sitemap content test (no tiny cities, no duplicates).
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] AT-18 passes.
- [ ] Sitemap lists only indexable pages.
- [ ] Homepage claims all trace to metrics.

## 10. STOP AND ASK the owner before
- Owner: index threshold; MMR list (D09).
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not create the MMR page before the owner validates the list.
- Do not publish thin city pages to the sitemap.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Revert PR; sitemap regenerates.

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

## P11 - Security and privacy baseline

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

## P12 - Accounts, consent and preferences

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

## P13 - Plans, entitlements and premium access control

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

## P14 - Payments, invoices and refunds

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P14 - Payments, invoices and refunds** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P14-payments-billing.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P14, and docs/launch/data/issues_2026-10-09.csv rows where phase = P14
6. Spec sections 7.4 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P13. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Money is collected safely: verified payments grant access once; invoices and refunds follow approved rules. Sandbox only until sign-off.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- Payment model, PaymentSettings and admin payments page exist; no checkout or webhook route found.
- Site states online payment is not live.
- No invoices, credit notes, renewal or cancellation flows.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. What does lib/payments/settings.ts and the admin payments page do?  -> look at: src/lib/payments/settings.ts; src/app/admin/(shell)/payments
2. Is there any order-creation or verification code?  -> look at: grep -rn razorpay src; api routes
3. Which gateway and test keys does the owner have?  -> look at: ENVIRONMENT.md; ask owner

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- Use test/sandbox keys only. Never charge a real customer during build.
- Server creates the order; client success redirect never grants access; only a signed webhook or server verification does.
- Idempotency key per order; duplicate webhooks are no-ops.
- Invoices and GST per CA rules; do not invent numbering.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p14-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP14.1 Order creation + verification + signed webhook + idempotency.
- WP14.2 Entitlement grant on verified payment.
- WP14.3 Failure, retry, duplicate handling and customer messages.
- WP14.4 Invoice generation and numbering (CA-approved).
- WP14.5 Refund, cancellation, renewal, expiry, grace period.
- WP14.6 Reconciliation view in admin.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-09 payment integrity.
- AT-10 renewal/refund.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] AT-09 and AT-10 pass in sandbox.
- [ ] CA/legal approvals recorded.

## 10. STOP AND ASK the owner before
- Owner: gateway account, refund policy, CA invoice rules, go-live of live keys.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not use live payment keys or charge any real customer.
- Do not grant access from the client success redirect.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Disable checkout flag; entitlements granted in sandbox are removed by a documented script.

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

## P15 - Alerts and notifications

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P15 - Alerts and notifications** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P15-alerts-notifications.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P15, and docs/launch/data/issues_2026-10-09.csv rows where phase = P15
6. Spec sections 8 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P12, P13. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Opted-in users get matching, de-duplicated alerts through approved channels, with logs and unsubscribe.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- Alert and SavedSearch models store filters only; no matching or delivery code, no email/WhatsApp/push provider.
- Site says alerts are planned and not available.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. What do Alert.filters and SavedSearch store?  -> look at: prisma models; my-alerts page
2. Is there a job runner for scheduled work?  -> look at: api/cron/*, .github/workflows/tick.yml, SCHEDULER.md
3. Which channels and providers are approved?  -> look at: DECISIONS.md D10 (providers)

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- Email first. WhatsApp/push only when providers, templates and consent are approved.
- Send only on new eligible listing or material change; de-duplicate by (user, property, event).
- Never expose masked premium fields in free-tier alerts.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p15-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP15.1 Alert model extension: channels, frequency, pause, consent link, last result.
- WP15.2 Matching engine reusing publishedWhere + lifecycle helper.
- WP15.3 Delivery log with queued/sent/failed and retry limits.
- WP15.4 Digest and immediate modes; unsubscribe link.
- WP15.5 Retention emails (weekly digest, day-14, day-60, renewal) behind flags.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-11 alerts: opted-in only, dedupe, unsubscribe, failed delivery.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] AT-11 passes with a test provider; no real sends without approval.

## 10. STOP AND ASK the owner before
- Owner approves providers, costs, message templates.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not send any real alert or campaign. Use a test provider.
- Do not expose masked premium fields in free-tier alerts.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Flag off; stop job.

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

## P16 - Admin operations, audit log and support

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P16 - Admin operations, audit log and support** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P16-admin-operations-support.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P16, and docs/launch/data/issues_2026-10-09.csv rows where phase = P16
6. Spec sections 12, 5.3 (correction path) in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P03, P04, P05, P06. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
The team can see data quality, source health, users and payments, fix errors with a trail, and answer users.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- Admin pages exist but were not audited live.
- No audit log, no support tickets, no correction workflow tied to a property.
- Exports not logged.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. Which admin pages exist and what does each do?  -> look at: src/app/admin/(shell)/*
2. Which admin roles exist and what can each do?  -> look at: AdminRole enum; adminAuth.ts
3. Is there any action logging?  -> look at: grep -ri audit; PropertyChange model
4. Does the contact form create a Lead only?  -> look at: contact page action; Lead model

Post the filled audit table before you change anything.

## 5. Step 2 - DECIDE (use these rules)
- Reuse existing admin shell and components.
- Every admin write logs actor, time, before/after.
- Exports are role-protected, minimised and logged.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p16-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP16.1 AuditLog model + hooks on admin writes.
- WP16.2 Data-quality dashboard from P04 counts and P05 report.
- WP16.3 Source health board from P06.
- WP16.4 SupportTicket model, 'Report an error' on property page, admin queue, first-response timestamp.
- WP16.5 Correction history preserved (prior value, actor, reason).
- WP16.6 Observability: structured logs, health check, error tracker choice.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-19 support and correction.
- Audit-log tests.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] AT-19 passes.
- [ ] Admin changes appear in the audit log.

## 10. STOP AND ASK the owner before
- Owner: error-tracking tool and cost.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not expose borrower personal data in exports or logs.
- Do not store secrets in audit logs.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Revert PR; tables unused.

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

## P17 - Risk intelligence, compare, client reports and media rights

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

## P18 - Analytics, content and localisation

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

## P19 - Partner programme and team features

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

## P20 - Hardening, full acceptance and launch readiness

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
