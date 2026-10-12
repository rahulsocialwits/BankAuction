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
