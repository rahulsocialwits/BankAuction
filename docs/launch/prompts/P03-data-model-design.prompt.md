# Prompt for P03 - Data model and provenance design

Paste everything inside the fence.

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
