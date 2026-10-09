# P10 - Homepage, city/region/institution pages and SEO

**Launch-critical:** Yes  |  **Depends on:** P05, P07, P08  |  **Spec sections:** 4.1, 4.2, 4.6, 11
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P10`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Discovery pages are accurate, useful and indexable without thin or misleading pages.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- 930 city URLs in sitemap, many tiny cities (thin-page risk).
- Coverage counters hidden; no 'as of' timestamp.
- Mumbai vs MMR not separated; MMR list is a draft.
- No auction calendar, Auction of the Day, partner page.
- Indexation/pagination policy undocumented.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| What is in sitemap.ts and which pages are indexable? | src/app/sitemap.ts, robots.ts, JsonLd.tsx, generateMetadata in pages |
| Which homepage sections from spec 4.2 exist? | src/app/(site)/page.tsx |
| How many cities exceed the minimum-count threshold? | cities.ts output; owner threshold in DECISIONS |
| Is structured data accurate (no fabricated fields)? | JsonLd.tsx and property page output |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- Index a city page only if it has at least N verified properties (default N=5, owner can change).
- MMR view only after the owner validates the list (D09). Until then do not create it.
- Coverage counters must come from defined metrics with an as-of time or stay hidden.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP10.1 Index threshold and canonical/noindex rules + tests (AT-18).
- WP10.2 Coverage counters with definitions and as-of.
- WP10.3 City page map/list toggle and pager (after P07/P09).
- WP10.4 Auction calendar/deadlines page.
- WP10.5 Nav completion per 4.1.
- WP10.6 MMR page when approved.

## Step 4 - Tests required
- AT-18 SEO checks.
- Sitemap content test (no tiny cities, no duplicates).

## Exit gate (all must be true before this phase is DONE)
- [ ] AT-18 passes.
- [ ] Sitemap lists only indexable pages.
- [ ] Homepage claims all trace to metrics.

## Owner approvals needed
- Owner: index threshold; MMR list (D09).

## Rollback
Revert PR; sitemap regenerates.

## Report back (use the template in PROTOCOL.md section 9)
