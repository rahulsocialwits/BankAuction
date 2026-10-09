# P04 - Lifecycle and counting core

**Launch-critical:** Yes  |  **Depends on:** P03  |  **Spec sections:** 3.2, 3.3
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P04`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
One central rule decides status and counts everywhere. Counts equal what users see.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- Undated open rounds currently count as ACTIVE; spec says exclude and report separately.
- 'Active' is 6,988 of 9,304 (75%), likely inflated.
- Cancelled and Postponed are excluded from active but not reported separately.
- /auctions has no Auction Today view.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| Which functions decide status and where else is status computed? | src/lib/domain/auctionLifecycle.ts, deriveAuctionStatus.ts, resolveAuctionStatus.ts; grep for 'status' comparisons in src/app and src/components |
| What does DECISIONS.md D01 say about undated rounds? | docs/launch/DECISIONS.md |
| Are IST day boundaries tested? | tests/auctionLifecycle.test.ts, resolveAuctionStatus.test.ts |
| Which pages count properties and do they all use publishedWhere/activeAuctionWhere? | grep -rn count src/app src/lib/queries |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- If D01 is OPEN, use the default (exclude undated from the active headline) but ship it behind a flag and state it in the PR.
- Never add a second status implementation. Extend the central helper and its tests.
- Report counts for: active, completed, cancelled, postponed, undated, no-round, unassigned city.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP4.1 Add Undated/Needs-Review handling to the central helper with boundary tests.
- WP4.2 Add a data-quality counts function used by admin and by tests (active, completed, cancelled, postponed, undated, end-before-start, no-round).
- WP4.3 Replace any component-local status logic.
- WP4.4 Add 'today' to status vocabulary where the UI lists statuses.

## Step 4 - Tests required
- AT-02 lifecycle boundaries incl. Undated, Cancelled, Postponed.
- AT-03 distinct property counting.
- AT-04 no-round properties.

## Exit gate (all must be true before this phase is DONE)
- [ ] AT-02, AT-03, AT-04 pass in CI.
- [ ] Homepage, city, search and admin counts come from the same helper.
- [ ] Undated count visible to admin.

## Owner approvals needed
- Owner confirms D01 (undated rule).

## Rollback
Revert PR; flag off restores previous counting.

## Report back (use the template in PROTOCOL.md section 9)
