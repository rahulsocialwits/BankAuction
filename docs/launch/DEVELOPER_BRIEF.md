# Developer brief: what must be solved, addressed and built

Date: 9 Oct 2026. From: Mayur (owner). For: the BankAuction developer.
Purpose: one complete list of what is wrong, what is missing and what is unverified. **You decide how to fix each item.** For every item below we state the problem, the evidence, and the outcome that must be true when it is done (the acceptance test). Please reply to each item with your approach, an estimate and an owner before starting.

Rules that stay in force: never use findauction.in; never bypass robots.txt, 401/403 or CAPTCHA; no production data changes, migrations, backfills or deploys without written owner approval and a rollback plan; no secrets in code or chat; do not claim "tested" unless it was run; state separately: implemented, tested, merged, deployed, smoke-tested.

Related files: `BankAuction_Requirement_Matrix.xlsx` (118 requirement rows, live audit, acceptance tests), `docs/launch/spec/PRD_v1.0.txt`, `docs/launch/BASELINE.md`, `docs/launch/DECISIONS.md`.

---

## A. Blocks launch (P0)

**A1. City pages and search show a fraction of the listings.**
- Problem: Nashik shows 8 properties in search; admin shows 64; keyword search finds 68. About 5,200 published properties have no canonical city (`geoCity`).
- Evidence: live `/properties?city=Nashik` = 8 (5 active, 3 completed); `?q=nashik` = 68. Data Engine shows the location job handling 96 listings per AI slot (every 15 min), picking newest first (`geo.ts`: `orderBy createdAt desc`), while about 10,600 new listings arrived in 24 hours.
- Done when: the number of published properties without a city is known (query Q2/Q3 in `docs/launch/data/baseline_queries.sql`) and trending to zero; Nashik (and any city) count in search equals its count in admin for the same definition; a document explains why the location job fell behind and what prevents it recurring.
- Open question for you: should city be resolved at import instead of by a later queue?

**A2. The map shows no pins.**
- Problem: map views return 0 pins everywhere (all properties, Mumbai, Bangalore, Pune, Chennai). `Property.latitude/longitude` are essentially empty.
- Rule: coordinates must never be guessed. Source-provided or address-geocoded only, with a quality flag.
- Done when: a written coordinate plan exists (source, method, accuracy flag, provider cost/terms); a measured percentage of properties with valid in-India coordinates; the map shows pins for those; properties without coordinates still list normally.

**A3. Auction list pages are capped at 48 and page 2 repeats page 1.**
- Evidence: `/auctions/upcoming?page=2` returns the same first listing; `/auctions`, `/live`, `/completed` have no pager.
- Done when: every list page paginates correctly, shows the true total, and a count shown anywhere equals the total on the page it links to.

**A4. A forbidden source exists in the system.**
- Problem: Admin → Data Engine lists "Find Auction (findauction.in)", paused, last run 5 Oct 2026: "413 listing page(s) found, 270 new, 138 read in full, 238,330 tokens". Our standing rule is never to access or ingest it.
- Done when: the source is removed from the admin; you identify which stored listings came from it and report the number; the owner decides what to do with them; a code-level guard prevents it being added again (a test); a note explains how it was added.

**A5. The scheduler is late.**
- Evidence: Data Engine says "Scheduler (every 15 min)" but "Last tick: 37 min ago, via visitor traffic". Documentation expects a second independent pinger (`docs/SCHEDULER.md`).
- Done when: ticks arrive within the configured interval for 48 hours (evidence: run history), the second pinger is in place, and an alert fires when a tick is more than 30 minutes late.

---

## B. Wrong or misleading on the live site (P1/P2)

- **B1. "Active" count may be inflated.** 6,988 of 9,304 count as active; undated open rounds are included. The spec says exclude them. Count undated separately and keep them out of headline numbers. (Owner confirms the rule.)
- **B2. "Similar properties" ignores location.** A Nashik flat lists Bengaluru, Morbi and Surat. Filter by city/state and type.
- **B3. Duplicate city variants.** Vasai / Vasai Virar; Aurangabad / Chhatrapati Sambhajinagar; about 972 city pages, many thin. Merge variants (owner confirms names); index only cities above a minimum listing count.
- **B4. Property types.** Counts add up to 8,919 of 9,304 published (385 uncategorised); "Vehicles" shows 0. Report the uncategorised, hide empty categories.
- **B5. Search parameter mismatch.** `?keyword=` is ignored and returns all listings; the working parameter is `?q=`. Accept both or reject unknown parameters visibly.
- **B6. Wrong location label.** A Nashik property (Flat Jail Road) shows "Pune" in front of the lender in the detail header. Find the source of that label.
- **B7. Detail page misses most of spec section 4.7.** No map, no last-checked/freshness, no risk flags, no save/share/compare/alert, thin disclaimer. Suggested order: freshness, map, share/save, disclaimer, then risk.
- **B8. Security headers.** Only HSTS is set. Missing CSP, X-Frame-Options, nosniff, Referrer-Policy; no rate limiting on public forms or APIs.

---

## C. Data and sources

- **C1. Source health (from the Data Engine on 9 Oct):** E Auctions and auction tiger are blocked by robots.txt and paused automatically (correct; do not work around). Bank Auction Deals, yes bank and Yes Bank do not answer the crawler (timeouts). "yes bank" and "Yes Bank" look like duplicates. Decide per source: keep, fix, or remove; record the reason.
- **C2. BAANKNET:** permission status is "unknown, requires business confirmation". The last full pass read 5,688 records: 946 new, 92 updated, 4,463 already present, 187 rejected (examples: invalid_property_type for vehicles and movables; reserve_price_missing). Confirm the rejection rules are intended.
- **C3. Intake versus published.** About 10,624 new listings in 24 hours but 9,391 published in total. Explain the difference (review, held, rejected, duplicates). NOT VERIFIED.
- **C4. AI usage.** About 1.04 million AI tokens in 24 hours. Report the cost per day and what drives it; add a daily cap and alert if there is none.
- **C5. Baseline queries Q1 to Q9** in `docs/launch/data/baseline_queries.sql` have never been run (read-only). Run them in a safe way and record results in `BASELINE.md`.

---

## D. Admin: nobody can say what every setting does

- Problem: many admin settings and buttons are undocumented and their effects unknown to the owner.
- Done when: a Settings Guide exists for every admin page and setting (what it does, what changes if edited, default, risk), reviewed by the owner; each admin action that changes data is logged in an audit log (who, what, when); the owner can see run health, source status and errors on one page.
- Also: Vercel environment variables flagged as readable (BASELINE exceptions): review and mark sensitive ones as such, without pasting values anywhere.

---

## E. Specified in the PRD but not built or only partly built

Full list with status in the Matrix workbook (sheet "Matrix", 118 rows). Main groups: accounts, consent and preferences; plans, entitlements and premium access control; payments, invoices, refunds (pricing differs from spec: live Rs 2,500/4,000/7,000 vs spec Rs 1,499/2,699/4,999, plus plan types not in the spec); alerts and notifications; saved searches; compare; risk flags; client reports; analytics; audit log; support tickets; consent records. 

Policy conflict to resolve before any paid launch: Premium is sold on "full borrower name and contact details", which conflicts with the data-minimisation rule in spec section 13. The owner decides the borrower-data policy.

---

## F. Process and quality (so this stops repeating)

- CI now blocks on lint, type-check, tests and the production build once PR #32 merges. PR #36 clears the 20 existing lint errors; merge it first.
- Open P02 PRs: #32 (CI lint + build), #33 (release checklist), #34 (feature flags; not wired to the Map toggle yet), #35 (backup/restore draft). Backup facts are unverified: provider, point-in-time recovery, retention, recovery window, last restore test.
- Every PR needs: what changed, tests added and actually run, what was not verified, how to check it in admin, and how to roll back.

---

## What the owner needs from you tomorrow

1. For each item A1 to A5: your approach, estimate, and owner.
2. A recommended order, with the reasons.
3. The list of items you think are wrong or already fixed, with evidence.
4. Questions for the owner (decisions you need).
5. A daily written status: implemented / tested / merged / deployed / smoke-tested, per item.

## Owner decisions still open

Pricing and plan split; borrower-data policy; city name merges; rule for undated auctions; geocoding provider and budget; BAANKNET permission; what to do with listings from the forbidden source.
