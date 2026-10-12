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
| eAuctionsIndia (`eauctionsindia.com`) | `/robots.txt` answered **HTTP 403 with a Cloudflare "Just a moment" challenge** | **BLOCKED** (access control). Source `E Auctions` is `active = false` since 5 Oct ("robots.txt says automated access is not allowed") | Written permission from the site owner, or a licensed API / feed, or a signed bulk-export agreement. Terms / contact page not read: that is the first thing to ask them for |
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
