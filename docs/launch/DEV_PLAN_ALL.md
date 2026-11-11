# Whole-website plan for the developer + ChatGPT

This replaces the 5-task kickoff as the complete plan. It covers all 118 requirements in the matrix (today: 17 Done, 38 Partial, 47 Not built, 10 Not verified, 6 Needs decision). 10 tracks. Each track is one prompt to paste into ChatGPT (GitHub repo connected). Each track points to the detailed phase prompts already in `docs/launch/prompts/`, which hold the step-by-step work.

Order for a **free discovery launch**: Tracks 1 to 7 and 10. **Paid launch** adds Track 8. Track 9 is after launch.

| Track | What it fixes | Phase prompts (docs/launch/prompts/) | Needed for |
|---|---|---|---|
| 1 Data trust and location | Cities missing (Nashik 8 vs 64), forbidden source, source health, late scheduler, provenance | P03, P05, P06 | Free launch |
| 2 Counts, search and lists | Counts that disagree, lists stuck at 48, `keyword` param, active-count rule | P04, P07 | Free launch |
| 3 Cards and property page | Missing freshness, share/save, disclaimer, wrong similar properties, wrong "Pune" label | P08 | Free launch |
| 4 Coordinates and map | Zero pins; coordinate plan; map on detail page | P09 | Free launch (map can follow if needed) |
| 5 Home, city pages and SEO | 972 thin city pages, duplicate names, sitemap, content, FAQ and guides | P10, P18 (content) | Free launch |
| 6 Security, accounts, consent | Security headers, rate limits, sign-up/login, consent, privacy and Terms | P11, P12 | Free launch |
| 7 Admin, audit, support, analytics | Undocumented settings, audit log, run-health page, support, analytics | P16, P18 (analytics) | Free launch |
| 8 Plans, payments, alerts | Pricing vs spec, entitlements, checkout, invoices, alerts | P13, P14, P15 | Paid launch |
| 9 Risk, compare, reports, partners | Risk flags, compare, client reports, partner/team features | P17, P19 | After launch |
| 10 Release and acceptance | CI blocking, release checklist, backups, full acceptance test, go/no-go | P02, P20 | Free launch |

---

## PROMPT 0 (paste once at the start of each ChatGPT chat)

You are my engineering partner on BankAuction (repo rahulsocialwits/BankAuction, live https://auction.bizsocio.com, Next.js 16, Prisma, PostgreSQL, Vercel). First read AGENTS.md, CLAUDE.md, docs/launch/PROTOCOL.md, docs/launch/DEVELOPER_BRIEF.md and docs/launch/PHASE_STATUS.md.

Rules: never use or access findauction.in; never bypass robots.txt, 401/403 or CAPTCHA; do not change production data, run migrations or backfills, merge or deploy; no secrets in code or chat; one small branch and one PR per change; add tests for every change; never write that a test passed unless I pasted its output.

For each track: (1) audit what already exists in 5 to 10 lines; (2) list the work as small PRs; (3) do the work, one PR at a time; (4) if you cannot run commands, tell me exactly what to run and I will paste the output; (5) after each PR give: what changed, what to check in admin or on the live site, how to roll back. Do not stop after the audit. Ask me only for decisions that belong to the owner (pricing, policy, budget).
Reply "Ready".

---

## TRACK 1: Data trust and location
Follow docs/launch/prompts/P03, P05 and P06. Must include: (a) why the city job falls behind (it takes 96 per slot, newest first, while about 10,000 listings arrive per day) and a fix so the backlog reaches zero, preferably resolving the city at import; (b) remove "Find Auction (findauction.in)" from the system with a code guard and test, and give me read-only SQL counting stored listings from it (do not delete); (c) a decision per failing source (E Auctions and auction tiger blocked by robots.txt, Bank Auction Deals and yes bank timeouts, duplicate "yes bank" / "Yes Bank"); (d) why ticks are late (every 15 min configured, last tick 37 min ago) and a second pinger with an alert; (e) explain why about 10,600 new listings in 24 hours but 9,391 published; (f) AI token use (about 1.04 million per day): daily cap and alert.
Done when: Nashik's count in search equals its admin count; no-city count trends to zero; ticks arrive on time for 48 hours.

## TRACK 2: Counts, search and lists
Follow docs/launch/prompts/P04 and P07. Must include: real pagination on /auctions, /auctions/upcoming, /live, /completed (page 2 currently repeats page 1); `?keyword=` ignored (should match `?q=`); undated open auctions counted separately from "active" (owner confirms rule); one shared function for every count; a test that any count shown equals the total on the page it links to.
Done when: every list pages correctly and every count matches its destination.

## TRACK 3: Cards and property page
Follow docs/launch/prompts/P08. Must include: "Similar properties" limited to same city/state and type; find why a Nashik property shows "Pune"; last-checked / source freshness; share and save; a clear disclaimer ("verify with the bank before bidding"); labels "Not available in source" instead of blanks; no claims like "verified" or "guaranteed".
Done when: a property page matches spec section 4.7 for the items above.

## TRACK 4: Coordinates and map
Follow docs/launch/prompts/P09. Must include: how many properties have coordinates today (read-only SQL for me to run); a written plan to fill them from source data or address geocoding with a quality flag and never guessing, comparing two providers on cost and terms; code to store coordinates behind a feature flag; map on the detail page; no mass geocode on production without owner approval.
Done when: I approve the plan and a small test batch shows correct pins.

## TRACK 5: Home, city pages and SEO
Follow docs/launch/prompts/P10 and the content part of P18. Must include: merge duplicate city names (Vasai / Vasai Virar, Aurangabad / Chhatrapati Sambhajinagar) with owner-approved names, and tell me before changing stored data; index only city pages above a minimum listing count (about 972 city pages now, many thin); property-type counts sum to 8,919 of 9,304 (385 uncategorised, "Vehicles" shows 0); sitemap and metadata; city/bank/type page templates that use real data; FAQ and guides (how to bid, EMD, due diligence); pages for investors, brokers, lawyers and first-time buyers.
Done when: only useful pages are indexable and every page title and description is unique.

## TRACK 6: Security, accounts and consent
Follow docs/launch/prompts/P11 and P12. Must include: security headers (only HSTS now: add CSP, X-Frame-Options, nosniff, Referrer-Policy); rate limits on forms and APIs; sign-up, login, preferences; consent records; Privacy, Terms and disclaimer pages. Stop and ask me before deciding the borrower-data policy (the current Premium pitch sells "full borrower name and contact details", which conflicts with spec section 13).
Done when: headers verified on the live site, accounts work end to end on a preview, consent is stored.

## TRACK 7: Admin, audit, support, analytics
Follow docs/launch/prompts/P16 and the analytics part of P18. Must include: a Settings Guide for every admin page and setting (what it does, what changes, default, risk); an audit log of every admin change; one run-health page (sources, errors, ticks, AI use); a support/contact flow; analytics with a privacy-safe tool; review of the Vercel variables flagged as readable (no values pasted anywhere).
Done when: the owner can read the Settings Guide and understand every setting, and every admin change appears in the audit log.

## TRACK 8: Plans, payments, alerts (paid launch only)
Follow docs/launch/prompts/P13, P14 and P15. Start with a question to the owner: approved prices and plan split (live Rs 2,500/4,000/7,000 vs spec Rs 1,499/2,699/4,999, plus plan types not in the spec). Then: entitlements as data, checkout and webhook in TEST mode only, invoices, refunds policy, saved searches and email alerts. No real payments or real messages to real people until the owner approves.
Done when: a test purchase gives access and a test refund removes it.

## TRACK 9: Risk, compare, reports, partners (after launch)
Follow docs/launch/prompts/P17 and P19. Behind feature flags. Do not start before Tracks 1 to 7 and 10 are done.

## TRACK 10: Release and acceptance
Follow docs/launch/prompts/P02 and P20. Must include: merge order for open PRs (#36 lint cleanup first, then #34, #33, #35, #32); feature flag wired into the Map toggle; backup and restore facts confirmed with the database provider (provider, point-in-time recovery, retention, last restore test); the full 118-row acceptance check with evidence; a go / no-go report. Production smoke test after each deploy.
Done when: every launch-critical row is Done or has an owner-approved exception.

---

## DAILY REPORT (paste at the end of each day)
Write a short plain-language report for the owner: (1) PRs done today with links; (2) per item: implemented / tested (with the output I pasted) / merged / deployed / checked live, separately; (3) decisions I need from the owner; (4) what is next. Write NOT VERIFIED for anything not checked.
