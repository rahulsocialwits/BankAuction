# P17 - Risk intelligence, compare, client reports and media rights

**Launch-critical:** Partial  |  **Depends on:** P08, P13, P16  |  **Spec sections:** 4.7, 4.8, 5, 10
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P17`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Evidence-backed descriptive risk flags (never a score), comparison and branded reports, and media shown only where rights are cleared.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- No risk model or UI; no compare; no client card/report; media permission fields unconfirmed.
- Risk rubric and media policy are open decisions.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| What risk-related facts are already stored (possession text, completeness)? | Auction.possessionStatus; pipeline/completeness.ts |
| Which media exist and with what permission fields? | Media, MediaAsset, SourceMedia models; MediaLibrary admin |
| Which decisions are answered? | DECISIONS.md D05 (risk rubric), D07 (media policy), D12 (legal boundary) |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- Show only flags with cited evidence and a review state; unknown is never displayed as clear.
- No numeric score unless D05 approves a rubric.
- Unknown/unreviewed media shows a neutral placeholder.
- Reports carry timestamp, source links and missing-data markers; never claim legal opinion.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP17.1 RiskFlag + review state models; reviewer UI in admin.
- WP17.2 Display flags with evidence and date.
- WP17.3 Compare page and URL.
- WP17.4 Client card/report generator with expiring, revocable share links.
- WP17.5 Media rights fields, gating and placeholder rule.

## Step 4 - Tests required
- AT-12 risk provenance.
- AT-15 client report.
- AT-16 media rights.

## Exit gate (all must be true before this phase is DONE)
- [ ] AT-12, AT-15, AT-16 pass.
- [ ] Risk copy reviewed by owner/legal.

## Owner approvals needed
- Owner: D05, D07, D12.

## Rollback
Flag off each feature.

## Report back (use the template in PROTOCOL.md section 9)
