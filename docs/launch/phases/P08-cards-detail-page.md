# P08 - Property cards and detail page to spec

**Launch-critical:** Yes  |  **Depends on:** P04, P06, P07  |  **Spec sections:** 4.4, 4.7
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P08`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
A buyer sees the right facts, where each came from, how fresh it is, and honest limits.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- Detail page lacks last-checked, source freshness, risk indicators, save/share/compare/alert, full disclaimer.
- Similar Properties ignores location (Nashik flat shows Bengaluru/Surat/Morbi).
- Premium copy promises borrower names (privacy conflict, see P11).
- Placeholder/media rules unverified.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| Which spec 4.7 items exist on the detail page? | src/app/(site)/property/[slug]/page.tsx |
| How is missing data shown ('Not available in source')? | detail and PropertyCard components |
| Is media shown only when permitted? | src/lib/media.ts, api/media, api/img routes, Media model fields |
| What freshness data exists per property? | lib/pipeline/lastSeen*.ts (from P06) |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- Build in this order: freshness line, honest missing-data labels, disclaimer block, similar-by-area, save/share, then compare/alert hooks (stubs gated by P12-P15).
- If media permission fields do not exist, use neutral placeholders everywhere until P17.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP8.1 Last-checked + source notice link.
- WP8.2 Missing-data labels and uncertainty labels.
- WP8.3 Disclaimer block per spec 4.7 and no forbidden claims (test).
- WP8.4 Similar properties by city/state/type.
- WP8.5 Share/save actions; compare and alert buttons wired when P12/P15 land.
- WP8.6 Reserve-price history with per-value source.

## Step 4 - Tests required
- publicClaims test extended to detail page.
- Similar-properties unit test.
- Rendering tests for missing-data states.

## Exit gate (all must be true before this phase is DONE)
- [ ] Detail page meets spec 4.7 items that do not depend on later phases.
- [ ] No forbidden claim strings.

## Owner approvals needed
- Owner approves disclaimer wording.

## Rollback
Revert PR.

## Report back (use the template in PROTOCOL.md section 9)
