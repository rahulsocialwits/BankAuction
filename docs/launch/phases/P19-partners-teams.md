# P19 - Partner programme and team features

**Launch-critical:** No (post-launch, behind flags)  |  **Depends on:** P13, P14, P16  |  **Spec sections:** 9
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P19`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Referral codes, attribution, commissions, payouts, partner dashboard, and team seats/pipeline, built only after the commission rulebook is approved.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- Not built. Commission references in the strategy conflict; no approved rulebook.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| Is D09/D11 (commission schedule, team scope) answered? | DECISIONS.md |
| Do payments (P14) support refunds and clawback data? | P14 gate evidence |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- Commission on money actually collected; pay after refund window; claw back refunds.
- Partners see only their own referred users in aggregate.
- Never pay bank/NBFC/ARC officers.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP19.1 Partner application and agreement acceptance.
- WP19.2 Codes/links and 30-day last-code attribution.
- WP19.3 Commission engine, clawback, statements.
- WP19.4 Partner dashboard and exports.
- WP19.5 Team: seats, roles, shared shortlist, pipeline, access log.

## Step 4 - Tests required
- AT-14 partner attribution.
- AT-17 team separation and private notes.

## Exit gate (all must be true before this phase is DONE)
- [ ] AT-14 and AT-17 team parts pass on sandbox data.

## Owner approvals needed
- Owner: single commission schedule, tax rules, team scope.

## Rollback
Flags off; tables unused.

## Report back (use the template in PROTOCOL.md section 9)
