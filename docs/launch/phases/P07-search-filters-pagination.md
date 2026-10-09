# P07 - Search, filters, sort and pagination everywhere

**Launch-critical:** Yes  |  **Depends on:** P04, P05  |  **Spec sections:** 4.3
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P07`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Every list on the site filters, sorts and paginates predictably, shows true totals and never silently truncates.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- /auctions and /auctions/<status> show '48 auction(s)', no pager, page 2 repeats page 1.
- /auctions/today returns not found.
- ?keyword= returns everything; real param is ?q=.
- No sort options; no PIN-code, date-range or possession filter; chips/clear-all unconfirmed.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| Which pages list properties and how does each paginate? | src/app/(site)/properties, auctions, city, bank, property-type pages |
| Which filter params exist and how are they parsed? | properties/page.tsx, PropertyFilterForm.tsx, publishedWhere.ts |
| Is ordering deterministic (tiebreak by id)? | listProperties.ts |
| Is pinCode stored anywhere queryable? | prisma Property fields and addressText parsing |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- Prefer redirecting /auctions/* to /properties with the matching status filter over maintaining two list implementations. If the auctions pages have unique UX value, reuse the shared query and pager component.
- Add PIN filter only on a real column. If PIN exists only inside addressText, store it in P05/P03 migration first; do not regex at query time.
- Unknown params are ignored visibly or aliased, never silently return everything.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP7.1 Shared pager component and true totals on all lists.
- WP7.2 Fix /auctions/* and add Today view.
- WP7.3 Sort: newest, deadline, reserve low/high, relevance with id tiebreak, URL param.
- WP7.4 Filters: PIN, date range, possession; chips and clear-all.
- WP7.5 Param aliases (keyword->q).
- WP7.6 Empty-state with reset suggestions that do not broaden matching.

## Step 4 - Tests required
- AT-07 pagination and stable sorting.
- Filter combination tests.
- Param alias tests.

## Exit gate (all must be true before this phase is DONE)
- [ ] AT-07 passes on every list page.
- [ ] No page shows a count that differs from its total.

## Owner approvals needed
- None (code only). Owner reviews previews.

## Rollback
Revert PR.

## Report back (use the template in PROTOCOL.md section 9)
