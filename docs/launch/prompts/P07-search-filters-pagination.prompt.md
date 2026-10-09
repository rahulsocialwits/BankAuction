# Prompt for P07 - Search, filters, sort and pagination everywhere

Paste everything inside the fence.

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
