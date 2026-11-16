# BankAuction — Project Completion Checklist

Last updated: 2026-11-16. This file is updated with every session; completed items stay for audit.

Legend: ✅ Merged to main | 🟡 PR open, CI green | 🔴 PR open, CI failing (fix in progress) | ⬜ Not started

---

## Priority 1 — Phase 1 Requirements

| Item | Status | PR | Notes |
|------|--------|----|-------|
| P1.1 — Cron 202 async | 🟡 | #69 | Returns 202 immediately; background ingestion via `after()` |
| P1.2 — Run log fields + zero-yield alerts | 🟡 | #66 (index), #67 (fields), #70 (zero-yield fix) | cursorPage, endedAt, 2-consecutive + 7-day median |
| P1.3 — sourcePublishedAt extraction | 🔴→🟡 | #74 (stagnation), #75 (sourcePublishedAt) | Fix pushed 2026-11-16: parseIndianDate for DD/MM/YYYY |
| P1.4 — Dedup / re-auction protection | 🔴→🟡 | #76 | Fix pushed 2026-11-16: test boundary updated |
| P1.5 — 7-day expiry lifecycle | 🟡 | #71 | Daily 02:00 IST / 20:30 UTC cron |
| P1.6 — DB-backed AI daily budget | 🟡 | #73 (cache), #77 (reservation) | SERIALIZABLE tx; default 50k; fix pushed 2026-11-16 |
| P1.7 — Data quality dashboard | 🟡 | #68 | /admin/data-quality; field completeness |
| P1.8 — Sources health dashboard | 🟡 | #72 | /admin/sources/health redirect |

**Owner merge order:** #66 → #67 → #69 → #70 → #71 → #73 → #74 → #75 → #76 → #77 → #68 → #72
(Each must wait for the previous migration; #74/#75/#76/#77 can merge in parallel after #73)

---

## Priority 2 — Phase 2 Requirements

| Item | Status | Branch | Notes |
|------|--------|--------|-------|
| P2.1 — PDF extraction (unpdf, deepScan.ts) | ⬜ | — | DEEP_MAX_LISTINGS 8→50; carpet/built-up/floor/unit/survey/inspection date |
| P2.2 — Officer info from HTML | ⬜ | — | Designation + email from bankauctions.in HTML |
| P2.3 — Distinguishing attributes migration | ⬜ | — | unit_or_door_number, floor_number, building_name, survey_or_khasra, plot_number, area_sqft, area_type |
| P2.4 — Inspection date | ⬜ | — | inspection_date DateTime? on Auction |
| P2.5 — Property image pipeline | ⬜ | — | First valid image from authorized source; PropertyMedia; display on detail page |
| P2.6 — Two-tier deduplication classifyPair | ⬜ | — | same/ambiguous/different; Tier A hard gates; Tier B → admin review |
| P2.7 — Duplicate review /admin/duplicates | ⬜ | — | Side-by-side, Same/Different/Keep actions, soft-merge |
| P2.8 — Historical false-merge investigation | ⬜ | — | Read-only investigation; restoration script if needed |
| P2.9 — Freshness timestamp | ⬜ | — | "Last verified: X hours ago" using Auction.updatedAt |
| P2.10 — Search indexing (GIN/trigram) | ⬜ | — | Inspect actual queries; add indexes where useful |

---

## Priority 3 — Admin Dashboard UI/UX Redesign

| Item | Status | Notes |
|------|--------|-------|
| Overview stats (total, published, upcoming, live, completed, etc.) | ⬜ | |
| Upcoming auctions section | ⬜ | |
| Recent property activity section | ⬜ | |
| Data Engine health section | ⬜ | |
| Source health section | ⬜ | |
| Failed runs and alerts section | ⬜ | |
| Data quality section | ⬜ | |
| AI budget section | ⬜ | |
| Admin activity section | ⬜ | |
| All cards navigate correctly | ⬜ | |

---

## Priority 4 — Properties Panel (Admin)

| Item | Status | Notes |
|------|--------|-------|
| Server-side search (title, ID, borrower, bank, city, state, PIN, source) | ⬜ | |
| Filters (city, state, category, type, auction status, pub status, source, price, date, missing, dupes) | ⬜ | |
| Pagination (prev/next/pages/page-size/accurate total) | ⬜ | |
| Sorting (upcoming-first, date asc/desc, recently added/updated, price, status) | ⬜ | |
| URL sync (filter params preserved in URL) | ⬜ | |

---

## Priority 5 — Filter URL and Click Navigation

| Item | Status | Notes |
|------|--------|-------|
| /properties?city=X works correctly | ⬜ | |
| /properties?category=X works correctly | ⬜ | |
| Combined filters work | ⬜ | |
| Filter controls reflect URL state | ⬜ | |
| All dashboard card links navigate correctly | ⬜ | |
| Navigation tests written | ⬜ | |

---

## Priority 6 — Upcoming Auctions First (Default Sort)

| Item | Status | Notes |
|------|--------|-------|
| Default sort: UPCOMING → AUCTION_TODAY → LIVE → COMPLETED → POSTPONED/CANCELLED | ⬜ | |
| DB-level sort (not JS-only) | ⬜ | |
| Applied across public listings, search, filters, API, pagination, homepage, map | ⬜ | |

---

## Priority 7 — Master Admin Locations Panel

| Item | Status | Notes |
|------|--------|-------|
| City management (add/edit/remove/search) | ⬜ | |
| Area management with parent-city relationships | ⬜ | |
| Duplicate prevention and validation | ⬜ | |
| Synced with public search / homepage / filters | ⬜ | |

---

## Priority 8 — Data Engine Redesign

| Item | Status | Notes |
|------|--------|-------|
| Source cards (name, URL, type, status, last attempt, last success, counts, errors) | ⬜ | |
| Functional run/pause/resume/edit/remove/history actions | ⬜ | |
| Clear error type display (robots, CAPTCHA, 401/403, timeout, parse failure, etc.) | ⬜ | |
| Scheduler panel (last tick, next tick, current run, duration, failure reason) | ⬜ | |

---

## Priority 9 — Testing and Quality

| Item | Status | Notes |
|------|--------|-------|
| All existing tests pass on main | 🟡 | Blocked on P1.3/P1.4 fix merges |
| Cron route tests (202, 401, overlap, completion, lease) | 🟡 | In #69 |
| AI budget concurrency tests | 🟡 | In #77 (pure functions only; DB tests via CI) |
| Dedup / re-auction tests | 🟡 | In #76 |
| Pagination / filter / sort / navigation tests | ⬜ | |
| Production build passing | 🟡 | Vercel green on all open PRs |

---

## Blocked on Owner Actions

- **Merge queue:** Owner must merge PRs in the order listed above. Each PR is independent after its migration dependency.
- **P1.1 runtime verify:** After merging #69, check Admin → Engine → History for new rows every ~5 min.
- **P1.5 runtime verify:** After merging #71, verify daily expiry job runs at 02:00 IST.
- **No production DB operations** may proceed without explicit approval and a rollback plan.
