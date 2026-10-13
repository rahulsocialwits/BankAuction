# Source access status (12 Oct 2026)

Facts only. "Checked" means one plain GET with the honest user agent `BankAuctionBot/1.0`, today. Nothing here is permission to collect.

## How the engine pauses a source (from the code)
- `src/data-sources/feeds/run.ts`: a robots.txt disallow, HTTP 401/403, a CAPTCHA / challenge or an access-denied page raises a refusal. The source is saved with `active = false` and the message "Blocked: ... Paused automatically." Nothing is retried or worked around.
- A robots.txt that does not answer (timeout) is NOT a refusal: it is shown as "permission unknown" and tried again.
- Hosts the project forbids by its own configuration (`src/data-sources/feeds/blockedHosts.ts`) are reported separately as a project policy block, never as a website refusal.
- There is **no per-source "priority" or "critical" field** in the source registry or in `feed_sources`. "CRITICAL" in the code is a completeness verdict for a source whose run collapsed (source protection), not a priority. Changing a source's importance would not authorise anything and is not implemented.
- `active = false` is also what the admin switch does by hand.

## Sources
| Source | Checked today | Status for automated collection | What is missing |
|---|---|---|---|
| eAuctionsIndia (`eauctionsindia.com`) | `/robots.txt` answered **HTTP 403 with a Cloudflare "Just a moment" managed challenge** (12 Oct). The crawler's own run at 12 Oct 11:09 UTC on the configured start page `https://www.eauctionsindia.com/search` was recorded as **"Blocked: Automated access requires verification (the website shows a CAPTCHA / challenge page). Paused automatically"** | **BLOCKED by an access control (verified).** Source `E Auctions` is `active = false`. 0 auctions from this source are stored. The "Site scan: 0 listing pages found" line is a consequence, not a separate bug: the engine could not read the page, so there was nothing to discover (the note about JavaScript is only a hint the scanner always adds) | **Permission.** A CAPTCHA / Cloudflare challenge cannot and must not be solved by the importer. Needed: (1) written permission from the site owner for automated collection, or (2) a licensed API / data feed / export, with its terms (rate limits, attribution, retention). See `EAUCTIONSINDIA_PERMISSION_REQUEST.md` |
| Auction Tiger (`auctiontiger.in`) | not re-checked | BLOCKED (robots.txt explicit disallow, paused 5 Oct) | Same as above |
| Bank Auction Deals, yes bank / Yes Bank | not re-checked | PERMISSION UNKNOWN (robots.txt timeout). Not a confirmed block | Retry later; `yes bank` and `Yes Bank` are two entries with the same URL: owner decides which to keep |
| Find Auction (`findauction.in`) | not touched | FORBIDDEN by project rule (`blockedHosts.ts`) | 241 stored properties still came from it: owner decision (see `findauction_audit.sql`) |
| IBAPI (`ibapi.in`) | `/robots.txt` → no robots file (an ASP.NET 404 page). Home and "Sale Info" pages → HTTP 200, no challenge | No restriction seen, **but it has no listing catalogue**: the pages are information about the sale process (`Sale_Info_Home_Hindi.aspx?P1..P4` return the same page). The listing portal it points to is MSTC | Nothing to import from ibapi.in itself. The "Read, found nothing" result is correct: the source URL is not a listing page |
| MSTC (`mstcecommerce.com`, linked from IBAPI) | `/robots.txt` → an "Unauthorised Page Access" page | NOT importable until its terms are read and access is permitted | Terms of use; official data access |
| BAANKNET (`baanknet.com`) | working importer | Owner decision of 8 Oct (continue without written permission); status UNKNOWN. Do not widen without the owner's written decision | Written authorization from PSB Alliance |

## Recommended next steps (no code)
1. Write to eAuctionsIndia asking for a license / feed / written permission. Until an answer arrives it stays blocked.
2. Turn the `ibapi` source off (or point it at a real listing page if one is found): it can never yield listings.
3. Prefer permitted sources of unique inventory: official bank auction pages and notices, and the manual Bulk Import for notices you collect lawfully.

## What is ready the day eAuctionsIndia is authorised
Nothing is built for this source on purpose: an importer written against pages we are not allowed to read would be guesswork. The platform parts that any authorised source reuses already exist:
- **Scheduling:** the 5-minute tick (`.github/workflows/tick.yml` -> `/api/cron/ingest` -> `runTick`) runs every active feed source in turn with a lease, so two runs never overlap, and one source failing does not stop the others. The interval of a source is its own "unchanged page" and revalidation rules; a source can be given its own minimum interval in its adapter.
- **Import:** `importRecords` (`src/lib/import/csvImport.ts`) is idempotent: source-qualified external id (`src:<host>:<id>`), then the duplicate rules (`propertyIdentity.ts`), never overwriting a value with an empty one. Re-running does not create duplicates.
- **Checkpoints and resume:** a resumable cursor in `FeedSource.sheetState`, saved after every page (pattern: `src/data-sources/feeds/baanknetImport.ts`).
- **Health:** every run writes `SourceRunLog`; Run Health labels refusals, unknown permission, empty reads and unchanged pages.
With a licensed feed or an approved API, the adapter is a small file that maps the feed to `ListingRecord`s and returns them to `importRecords`; the first full import runs from a script like `scripts/baanknet-run.ts` with a page cursor.

## Authorised-feed framework (built, waiting for authorisation)
Code: `src/data-sources/authorized/` (`engine.ts`, `jsonFeed.ts`, `fieldMap.ts`, `eauctionsindia.ts`), hook in `src/data-sources/feeds/run.ts`, script `scripts/eauctions-import.ts`, simulated tests `tests/authorizedFeed.test.ts` (19 tests, simulated: they do not prove a live integration).
- States: awaiting_authorization, temporarily_unavailable, configuration_error, connected_no_listings, active, partial, completed. A challenge page / 401 / 403 is "awaiting authorization" and is never retried; an empty healthy feed is never "completed"; a temporary error keeps the cursor.
- The eAuctionsIndia feed source is read ONLY through this path (the web scanner is never used for it). With no authorisation recorded it answers at once and sends no request (verified: `npx tsx scripts/eauctions-import.ts` printed "Awaiting authorization ... Nothing is requested from the site", and wrote nothing).
- To switch on, after written authorisation: set `EAUCTIONS_AUTHORIZED=yes`, `EAUCTIONS_FEED_URL`, `EAUCTIONS_RECORDS_PATH`, `EAUCTIONS_CURSOR_PARAM` (+ `EAUCTIONS_NEXT_CURSOR_PATH` or `EAUCTIONS_PAGE_NUMBER_MODE=1`), `EAUCTIONS_FIELD_MAP` (JSON), optional token variables; run `--dry`, then `--sample=20`, then `--full`; then set the source active in Admin -> Feeds so the 5-minute tick keeps it fresh (a finished pass is repeated every `EAUCTIONS_MIN_INTERVAL_MIN`, default 60).

## Scheduler reality check (12 Oct, from GitHub and the run logs)
- `tick.yml` is configured for every 5 minutes, but GitHub's `schedule` event actually ran at 07:46, 01:28 (12 Oct), 22:25, 18:35, 13:56 (failure), 07:05, 01:05 (11 Oct): about every 3 to 6 hours. GitHub runs scheduled workflows on a best-effort basis and delays them heavily.
- Run logs, last 24 h: 21 ticks, 10 gaps over 20 minutes, longest gap 244 minutes. The ticks in between come from the visitor safety net (`/api/me`).
- So "configured every 5 minutes" is NOT "executed every 5 minutes". An external pinger is needed (cron-job.org or similar calling `/api/cron/ingest` with the `x-cron-secret` header); Vercel Cron on the Hobby plan runs once a day at most.

## eAuctionsIndia: free, authorised access checked again (12 Oct, evening)
- `/robots.txt` and now `/sitemap.xml` both answer **HTTP 403 with the Cloudflare "Just a moment" challenge**. No sitemap, RSS feed, export or documented endpoint is reachable without passing that challenge. Requests to the site were stopped there.
- A public web search found no official API, data feed, terms page or contact for the site (only a third-party marketplace listing that is not the operator's documentation).
- Therefore: **no parser has been written** (no real page or payload exists to build it from; selectors and field names would be invented), and **no real import has run**. The generic framework (`src/data-sources/authorized/`) is tested only against simulated fixtures.
- What is needed to proceed, any ONE of: (a) a CSV / JSON / XML export or API response sample that the operator gives you in writing, (b) written permission plus an allow-listed user agent so `BankAuctionBot/1.0` is not challenged, (c) a saved copy of a few listing pages that the operator allows you to use. With a real sample the provider-specific parser, fixtures and the field map are a few hours of work.

## eAuctionsIndia: list-page importer built from a real page (13 Oct 2026)
The user supplied the real HTML of `/category/residential` and reported that the operator agreed. The parser and importer exist now:
`src/data-sources/eauctionsindia/parse.ts` (tested on the real fixture `tests/fixtures/eauctionsindia-residential-page1.html`: 4 listings, headline 125,451, 10,455 pages, next link), `.../import.ts` (resumable, paced, refusal-aware), hook through `authorized/eauctionsindia.ts` and the scheduler.
- **Tested against real source data:** the parser only (on that one saved page). **Not tested live:** the crawler still gets a Cloudflare challenge until the operator allow-lists `BankAuctionBot/1.0`; then the run says "Awaiting authorization".
- **Switch on** (Vercel env for the scheduler, or your PowerShell session for the script): `EAUCTIONS_AUTHORIZED=yes` and `EAUCTIONS_AUTH_NOTE=<sender, date, subject of the written permission>`; optional `EAUCTIONS_CATEGORIES` (default `residential`), `EAUCTIONS_DELAY_MS`, `EAUCTIONS_PAGES_PER_RUN` (default 20 per tick), `EAUCTIONS_REFRESH_PAGES`, `EAUCTIONS_MIN_INTERVAL_MIN`.
- **Commands:** `npx tsx scripts/eauctions-import.ts` (dry run, 3 pages), `--sample=20`, `--full` (resumable; run again to continue), `--max-pages=N`, `--restart`.
- **What the list page does not give** (so it is empty, never guessed): state, EMD, coordinates, property photos (only generic stock pictures), bank name (an institution logo on some listings), detail-page fields (no sample of a detail page yet).
- **Size:** 125,451 residential listings = 10,455 pages = at least 4.4 hours of requests at 1.5 s; about 0.75 GB of database at ~6 KB per property. Check the database plan first.
- **Evidence still missing in the repository:** the operator's written permission itself. Keep it and name it in `EAUCTIONS_AUTH_NOTE`.
