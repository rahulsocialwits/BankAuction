# P03 - Data model and provenance design

**Launch-critical:** Yes  |  **Depends on:** P01, P02  |  **Spec sections:** 3.1, 5, 6, 10
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P03`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Design (and write, but not apply) the schema changes the whole product needs, once, so later phases do not fight each other.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- No coordinate precision field.
- No Undated/Needs-Review lifecycle value.
- No Subscription, Entitlement, Invoice, ConsentRecord, AuditLog, SupportTicket, RiskFlag, ReviewState, Partner, Referral, Team models.
- No per-source terms-review record.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| Which of the entities in spec 3.1 already have a model, and which fields are missing? | prisma/schema.prisma vs docs/launch/spec/PRD_v1.0.txt section 3.1 |
| Which existing columns hold raw source values vs normalised values? | Property, Auction, SourceRecord, PropertyChange, fieldProvenance.ts |
| Is there already an evidence/review model in use (fieldObservations, mergeLog, review.ts)? | src/lib/pipeline/* |
| Which indexes support the filters the product needs (geoCity, auctionStart, reservePrice, bankId)? | schema @@index lines |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- Additive migrations only: new tables/columns, nullable or defaulted. No drops, renames or rewrites of existing data.
- If a model already covers a need (for example Alert for alerts), extend it rather than adding a parallel model.
- One ADR file per significant decision in docs/launch/adr/.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP3.1 Write docs/launch/DATA_MODEL_IMPACT.md (entities, fields, indexes, migration order, which phase uses each).
- WP3.2 Implement only the migrations needed by P04-P09 first (coordinate precision, lifecycle undated flag if needed, indexes). Later models are created in their own phases.
- WP3.3 Add schema tests (prisma validate) to CI.

## Step 4 - Tests required
- prisma validate and migrate diff in CI.
- No data tests; migrations are structural.

## Exit gate (all must be true before this phase is DONE)
- [ ] DATA_MODEL_IMPACT.md approved by owner.
- [ ] Migrations for P04-P09 written, reviewed, NOT applied until owner approval.
- [ ] Rollback SQL documented for each migration.

## Owner approvals needed
- Owner approves applying each migration to production, with a backup confirmed.

## Rollback
Each migration ships with a down-script note. Additive changes can stay unused safely.

## Report back (use the template in PROTOCOL.md section 9)
