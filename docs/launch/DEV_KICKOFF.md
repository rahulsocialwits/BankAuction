# Developer kickoff (use with ChatGPT)

How to use: open ChatGPT with the GitHub repo `rahulsocialwits/BankAuction` connected. Paste PROMPT 0 once. Then paste one task prompt at a time (T1 to T5), in order. After each task, paste the DAILY REPORT prompt and send the answer to Mayur.
Full detail for any task is in `docs/launch/DEVELOPER_BRIEF.md`. You do not need to read all of it first.

---

## PROMPT 0 (paste first, once)

You are my engineering partner on BankAuction (repo rahulsocialwits/BankAuction, live site https://auction.bizsocio.com, stack Next.js 16, Prisma, PostgreSQL, Vercel). Before writing any code, read AGENTS.md, CLAUDE.md, docs/launch/DEVELOPER_BRIEF.md and docs/CLAUDE_CODE_PLAYBOOK.md.

Rules you must follow: never use or access findauction.in; never bypass robots.txt, 401/403 or CAPTCHA; do not change production data, run migrations or backfills, merge or deploy; no secrets in code or chat; one small branch and one pull request per change; add tests for every change.

How we work: for each task I give you, (1) look at what already exists and tell me in 5 lines, (2) propose the smallest fix and ask me only if a decision is really mine, (3) write the code, tests and PR, (4) if you cannot run commands, tell me exactly which commands to run and I will paste the output back; never say a test passed unless I pasted its output, (5) finish with: what changed, what I should check in admin, how to roll back. Do not stop after the analysis; do the work.

Reply "Ready" and wait for the first task.

---

## T1: Cities show too few listings (Nashik 8 vs admin 64)

Task: About 5,200 published properties have no city (`geoCity`), so city pages and counts show only a fraction. In `src/lib/pipeline/geo.ts` the AI location job takes 96 listings per slot, newest first, while about 10,000 new listings arrive per day, so older ones never get processed.
Do: (a) read geo.ts, tick.ts and aiSchedule.ts and explain in plain words why the backlog does not drain; (b) propose and implement a fix so the oldest and soonest-auction listings are handled first and the backlog reaches zero; consider setting the city at import time and from clear address text (a city name at the end of the address) before using AI; never guess; (c) add tests; (d) give me read-only SQL to count properties without a city, by status, before and after.
Done when: Nashik's count in search equals its count in admin for the same definition, and the no-city count is trending to zero.

## T2: Map shows no pins

Task: `Property.latitude/longitude` are essentially empty, so the map has no pins.
Do: (a) check how many properties have coordinates and where they come from (read-only SQL for me to run); (b) propose a plan to fill coordinates from source data or by geocoding the address, with a quality flag, never guessing; compare 2 geocoding options and their cost and terms; (c) implement the safe part (the code that stores coordinates and the quality flag) behind a feature flag, with tests; do not run a mass geocode on production.
Done when: I have a written plan I can approve, and the code can store valid in-India coordinates for a small test batch.

## T3: Pagination on /auctions pages

Task: `/auctions`, `/auctions/upcoming`, `/live`, `/completed` show at most 48 listings and page 2 repeats page 1.
Do: fix it by adding real pagination with the true total, or redirect these pages to `/properties` with a status filter. Add tests. Make sure any count shown anywhere equals the total on the page it links to.
Done when: page 2 shows different listings and the totals match.

## T4: Remove the forbidden source and check the scheduler

Task: Admin → Data Engine lists a source "Find Auction (findauction.in)" that ran on 5 Oct (270 new listings). Our rule is never to use it. Also the scheduler says "every 15 min" but the last tick was 37 minutes ago.
Do: (a) find how the source got added and add a code-level guard plus a test so it can never be added or run; (b) write read-only SQL for me to run that counts how many stored listings came from it; do NOT delete anything; (c) read docs/SCHEDULER.md and the tick workflows, tell me why ticks are late, and propose a second pinger and an alert when a tick is more than 30 minutes late.
Done when: the guard test passes, I have the listing count, and I know why ticks are late.

## T5: Wrong things on the live site (quick fixes)

Do these as separate small PRs, each with a test:
1. "Similar properties" must be limited to the same city or state and property type.
2. `?keyword=` is ignored; make it work the same as `?q=` or show a clear message.
3. A Nashik property shows "Pune" in the detail header: find where that label comes from.
4. Add security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy) in next.config without breaking the map or analytics.
5. Merge duplicate city names (Vasai / Vasai Virar, Aurangabad / Chhatrapati Sambhajinagar) in `src/lib/pipeline/locations.ts`, and tell me before changing any stored data.

---

## DAILY REPORT (paste at the end of each day)

Write a short report for the owner in plain language:
1. Done today (with PR links).
2. For each item: implemented / tested (with the command output I pasted) / merged / deployed / checked on the live site, shown separately.
3. What I need from the owner (decisions only).
4. What is next.
Be honest: write NOT VERIFIED for anything that was not checked.
