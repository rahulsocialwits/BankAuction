# Fix BankAuction with ChatGPT: start here

For the developer. Do these in order. One chat per prompt. Each prompt makes ChatGPT look at the real code first, tell you its plan, then do the work as a small pull request. You review and merge. Time per prompt: about 30 to 90 minutes.

## How to use (3 steps)
1. Open a new ChatGPT chat with GitHub access to `rahulsocialwits/BankAuction`.
2. Paste **Prompt 0** first, then the numbered prompt. Never skip Prompt 0.
3. Read ChatGPT's plan before it changes anything. If it says it cannot run commands, run the commands it lists yourself and paste the output back. Do not merge a PR whose checks are red.

Send the owner a 5-line update after each prompt: what changed, PR link, checks green or red, what is not verified, what you need from the owner.

---

## Prompt 0: paste this first, every time

```
You are helping fix BankAuction.co (repo rahulsocialwits/BankAuction, live site auction.bizsocio.com, Next.js 16 + Prisma + PostgreSQL on Vercel). Read AGENTS.md and docs/CLAUDE_CODE_PLAYBOOK.md first. This Next.js version has breaking changes: read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code.

Rules you must follow:
- Never use or scrape findauction.in. Never bypass robots.txt, 401/403 or CAPTCHA.
- Do not touch the production database. No migrations, backfills or deletes. If a data change is needed, write it as a script or SQL file in the PR and explain it; the owner approves and runs it.
- Do not merge or deploy. Open one small pull request per task.
- Never invent data (coordinates, dates, prices).
- Do not say something is tested unless it was run. If you cannot run commands, say so and list the exact commands I should run.

How to work: (1) Look at the real code and tell me what you found, with file names. (2) Tell me your plan in plain words and wait for my OK. (3) Make the smallest change that fixes the problem, with tests. (4) Report: what changed, tests added and run, what you did NOT verify, how I check it in the admin or on the site, and how to undo it.
```

---

## Prompt 1: Nashik shows 8 properties but admin has 64 (city not filled in)

```
Problem: Searching Nashik shows 8 properties, admin shows 64, keyword search "nashik" finds 68. About 5,200 published properties have no verified city (the field geoCity is empty), so city pages and counts miss them.

Look at src/lib/pipeline/geo.ts and tick.ts. I think the cause is: the job that fills the city handles only 96 listings per AI slot (every 15 minutes), and it takes the NEWEST listings first (orderBy createdAt desc), while about 10,000 new listings arrive per day, so older listings never get reached.

Do this:
1. Confirm or correct my guess by reading the code. Tell me what the real cause is.
2. Write a read-only SQL file (docs/launch/data/) that counts published properties with and without geoCity, and per city for Nashik. I will run it.
3. Propose the fix. Options to consider: process listings with upcoming auctions first, then the oldest backlog; fill the city from the address text with a simple safe rule when exactly one known city appears at the end of the address (no guessing); raise the batch size only if time allows. 
4. After my OK, implement it with tests (including a test that an old backlog row gets picked before a brand-new import).
Done when: the queue order is tested, and the count of properties without a city goes down on every run.
```

---

## Prompt 2: List pages stop at 48 and page 2 repeats page 1

```
Problem: /auctions, /auctions/upcoming, /auctions/live and /auctions/completed show at most 48 listings with no page buttons, and /auctions/upcoming?page=2 returns the same first listing as page 1. The headline count is misleading.

Do this: find the code behind these pages. Either add proper pagination with the true total, or redirect these pages to /properties with the right status filter (whichever is simpler and keeps the same filter rules as src/lib/queries/publishedWhere.ts). Do not create a second counting rule.
Also: ?keyword= is ignored and returns all listings; the working parameter is ?q=. Make both work.
Done when: page 2 shows different listings than page 1, the total shown equals the total on the page it links to, and a test covers pagination.
```

---

## Prompt 3: A forbidden source (Find Auction) exists in the admin

```
Problem: Admin -> Data Engine lists a source "Find Auction" (findauction.in), currently paused, last run 5 Oct 2026 (270 new listings, 138 read in full). Our rule is that findauction.in must never be accessed or ingested.

Do this (read-only first):
1. Find how this source is stored and how it was added (code and admin paths).
2. Write a read-only SQL query that counts and lists the properties that came from this source, so the owner can decide what to do. Do not delete anything.
3. Propose a code guard that blocks adding or running findauction.in (and its subdomains) with a clear error, plus a test. Add the guard in src/data-sources/registry.ts or wherever sources are validated.
4. Write the exact steps for the owner to remove the source in the admin.
Stop after this and wait for the owner's decision about the existing listings.
```

---

## Prompt 4: The scheduler runs late

```
Problem: Data Engine says the scheduler runs every 15 minutes, but the last tick was 37 minutes ago ("via visitor traffic"). Docs say a second independent trigger is needed (docs/SCHEDULER.md).

Do this: read docs/SCHEDULER.md, .github/workflows/tick.yml, scheduler-watchdog.yml and src/lib/pipeline/tick.ts. Tell me why ticks are late (GitHub Actions cron delays? missing second pinger? lease problems?). List the exact steps I need to do outside the code (for example setting up a free cron-job.org trigger with the secret header, without ever putting the secret in code or chat). Then propose and implement, if needed, a small change so a late tick (over 30 minutes) is clearly shown in the admin.
Done when: there are two independent triggers and the admin shows an obvious warning when ticks are late.
```

---

## Prompt 5: The map has no pins

```
Problem: Map views show 0 pins everywhere because Property.latitude and longitude are almost empty. Coordinates must never be guessed.

Do this (plan only, no code yet): read src/lib/map/ and PropertyMapView. Check how many properties could be located from data we already have (read-only SQL file for the owner to run). Then give me a written plan with 2 or 3 options for getting coordinates safely (source-provided coordinates; geocoding the full address with a quality flag such as exact / locality / city only), including provider terms, cost per 10,000 lookups, and how each handles bad addresses. Recommend one. Do not call any geocoding service until the owner approves the provider and budget.
```

---

## Prompt 6: Small wrong things on the live site (one PR each)

```
Fix these four, each as its own pull request, each with a test:
(a) "Similar Properties" on the property page shows other cities (a Nashik flat lists Bengaluru, Morbi, Surat). Restrict to the same city or state and the same type.
(b) City variants are split: Vasai / Vasai Virar and Aurangabad / Chhatrapati Sambhajinagar. Extend the alias list in src/lib/pipeline/locations.ts (do not rewrite existing data; list the rows that would change in a SQL file for the owner).
(c) A Nashik property (Flat Jail Road) shows "Pune" before the lender name on its page. Find where that label comes from and fix or explain it.
(d) Only the HSTS security header is set. Add X-Frame-Options, X-Content-Type-Options, Referrer-Policy and a safe Content-Security-Policy in next.config.ts, and check the site and the map still load (OpenStreetMap tiles must work).
```

---

## Prompt 7: Document every admin setting

```
Problem: The owner does not know what many admin settings and buttons do.
Do this: list every page under src/app/admin and every setting or button on it. Write docs/ADMIN_GUIDE.md in plain language: for each setting say what it does, what changes if you edit it, the default, and the risk. Mark anything you could not explain from the code as "unclear" instead of guessing. Do not change any behaviour. Done when every admin page has an entry.
```
