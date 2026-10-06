# BAANKNET importer

BAANKNET (`https://baanknet.com`) is the public e-auction portal of the Indian public-sector banks (PSB Alliance). It is the largest source in this project:
at the time of writing its public listing reports **≈ 4,550 "upcoming" and ≈ 729 "live" auction properties** (counts change daily).
Importing "all" means: read **every page** of both lists until the site's own last page, with no fixed page limit.

> Policy: only data that the public listing page itself loads is used. robots.txt is checked first, the honest user agent is sent,
> no login / CAPTCHA / 401 / 403 handling is bypassed (a refusal stops the import). `baanknet.com` is **not** on the do-not-fetch list since commit `6c3a504` (project owner's decision).

## 1. How the site delivers data (verified by reading the live site)

| Place | What it contains | Used by this project? |
|---|---|---|
| Home page HTML `https://baanknet.com/` | a Next.js "Flight" payload (`self.__next_f.push([1,"…"])`) holding `auctionData.data[]` with **only the first 6 auctions** and the metadata `"currentPage":1,"totalPages":529` / total 3174. The query `?page=2` returns the same 6 records (page state is client-side) | `extractBaanknetEmbeddedAuctions` (deepScan.ts) still exists and has tests, but is **not** used for Import All: it cannot paginate |
| `https://baanknet.com/auction-listing/property`, `/property-detail/ID`, `/auction-detail/ID` | empty React shell (≈ 1.4 KB, no text); detail addresses typed directly show only an empty state — the real address carries a token added when a card is clicked | not used by the importer (the render fallback in `feeds/render.ts` can read them but is slow) |
| **`POST https://baanknet.com/api/v1/auction/detail/auction-listing`** | the JSON the listing page itself requests: `{"data":{"data":[{_index:"psba_auction_property", _id, _source:{…}}], "total":N, "currentPage":P, "totalPages":T}}` | **yes — this is the data source of Import All** |
| `GET https://baanknet.com/api/v1/auth/csrf-token` | HTTP 204; the page calls it first and sends the token back in header `x-csrf-token` | called first by the importer (token/cookies forwarded when present; the listing answered 200 without a token in testing) |

Request body (the same shape the page sends; `limit` is 10 on the page, **50 is used here** — the site accepted it):
```json
{"search":{},"range":{},"sort":{"type":"closest"},"page":1,"limit":50,"auctionStatus":"upcoming"}
```
`auctionStatus` values used: `"upcoming"` (≈ 91–92 pages of 50) and `"live"` (≈ 15 pages). Other values were not explored.
A request for a page beyond `totalPages` returns `rows: []`, which the importer treats as the end of that status.

### `_source` fields (what a record contains)
`auctionId`, `auctionFrom`/`auctionTo` (UTC), `auctionExtendedTo`, `auctionVerifiedOn`, `auctionBranch`, `checkerName`/`checkerDesignation` (authorised officer), `emd`, `emdStart`, `emdEnd`, `eoiStart`/`eoiEnd`, `reservePrice`, `incrementPrice`, `extendBy`/`extendTime`, `inspectionStart`/`inspectionEnd`/`inspectionName`/`inspectionMobileNo`/`inspectionBranch`, `auctionStatus`, **`propertyDetailId`**, `propertyUniqueId` (bank's property id), `pincode`, `cityName`, `stateName`, `districtName`, `locality`, `address`, `propertyPossessionType`, `propertyType`, `propertySubType`, `typeOfAction` (e.g. "Under SARFAESI"), `borrowerName`, `borrowerAddress`, `propertyBankName`, `propertyBranchName`, **`auctionDocuments[]`** (`filepath`, `filename`, `description`), **`propertyMedia[]`** (`filepath`, `url`, `ismainimage`), `carpetAreaSqft`, `builtupAreaSqft`, `projectName`, `noOfRooms`, `propertyHeading`, `cta`, … CDN base: `https://cdn.baanknet.com/<filepath>`.
Vehicles and machinery are in the same list; they are rejected by the importer (`invalid_property_type`).

## 2. Mapping to the database

`baanknetRecordsFromSources(rows)` (`deepScan.ts`) → `ListingRecord`:
| BAANKNET field | ListingRecord key | Database |
|---|---|---|
| `auctionId` (else `propertyDetailId`) | `external_id = "src:baanknet.com:<id>"`, `notice_number` | `Auction.externalAuctionId`, `noticeNumber` — **the identity used for duplicate detection** |
| `https://baanknet.com/auction-detail/<auctionId>` | `source_url` | `Auction.sourceUrl` |
| `propertyHeading` / built title | `title` | `Property.title`, slug |
| `propertyBankName`, `propertyBranchName` | `bank`, `branch` | `Bank` (canonicalised), `BankBranch` |
| `propertyType` + `propertySubType` | `category`, `source_property_type` | `Property.category`, attribute `source_property_type` |
| city / district / state / pincode / address | `location`, `legal_schedule` | `Property.addressText`, attribute `legal_schedule` |
| `reservePrice`, `emd`, `incrementPrice` | `reserve_price`, `emd`, `minimum_increment` | `Auction.reservePrice`, `emd`, `minimumIncrement` |
| `auctionFrom` / `auctionTo` / `emdEnd` (UTC → IST) | `auction_start`, `auction_end`, `application_deadline` | `Auction.auctionStart`, `auctionEnd`, `applicationDeadline` (status derived from the dates) |
| `borrowerName` | `borrower` | `Auction.borrower` (shown blurred on the site; **never in `/api/v1`**) |
| `checkerName`, inspection fields | `officer_name`, `inspection_*` | `Auction.authorizedOfficer`, `inspection*` |
| `propertyPossessionType`, `typeOfAction` | `possession_status`, `auction_type` | `Auction.possessionStatus`, `auctionType` |
| `auctionDocuments[]` | `documents` (JSON) | `Document` (unique `sourceUrl`) + `PropertyDocument` (max 12) |
| `propertyMedia[]` | `media` (JSON) | `Media` (`sourceUrl` = CDN URL) + `PropertyMedia` (max 12, ordered). **URLs only; nothing is downloaded** |

## 3. "Import All" — from the click to completion

Files: `src/data-sources/feeds/baanknetImport.ts` (importer), `run.ts` (`runWebDiscovery` branch, `runFeedSource` early return), `app/admin/(shell)/engine/actions.ts` (`importAllNow`), `lib/pipeline/tick.ts` + `run.ts` `runAllFeeds` (continuation).

1. **Click** (Data Engine → source card → "Import all now", or "Import ALL … every website"): `importAllNow` sets the source `active`, writes `web.importAll = true` into `FeedSource.sheetState`, sets the message "Importing all properties of this website…" and starts `runWebDiscovery(id, "manual", { all: true })` with `after()`. *`after()` work can be discarded by the platform, which is why nothing depends on it:* the flag and cursor live in the database and the next tick continues.
2. `runWebDiscovery` takes a per-source lock (`acquireAiLock`, 6 min stale) and, for baanknet.com, calls **`runBaanknetImport(feed, trigger, { budgetMs, force })`** instead of the generic scanner. Budget: manual Import all 230 s, other manual 180 s, scheduled 100 s (scheduler may pass up to 200 s, see below).
3. `runBaanknetImport`: reads the cursor `FeedSource.sheetState.baanknet` (none → starts at status `upcoming`, page 1); checks `robots.txt` for the API address (`RobotsGate`; disallowed → stops with "Blocked by robots.txt"); does the token request.
4. **Loop** until the budget minus 25 s is used: read up to 3 pages one after the other (`PARALLEL = 3`, 250 ms pause, each `fetchWithRetry` with the 429/503 one-retry rule) → import the 3 pages **side by side** with `importRecords(records, "feed:<source name>", "PUBLISHED", …, { enrich: true, strict: true })` → add the counters → **cursor `page += 3` only after those imports finished** → save cursor + progress message (`Running: BAANKNET import: status "upcoming" page 12/92 · 600 record(s) read · …`).
5. A page with no rows, or `page > totalPages`, ends the status: `si += 1`, `page = 1`. After `live` the import is **done**: `done = true`, `completedAt` set, `web.importAll = false`, message "Import all completed: …".
6. **Time over** (budget exhausted): the cursor is already saved; message "BAANKNET import in progress: … Continues automatically on the next scheduler tick."; `importAll` stays `true`.
7. **Continuation**: every tick (`runTick` → `runAllFeeds`) puts sources with `importAll` first (baanknet before AI-heavy ones), gives importing sources a share of a 150 s window (up to 200 s for one source) and calls `runWebDiscovery` again → `runBaanknetImport` resumes at the saved page. No click is needed. The tick comes from GitHub Actions (every 5 min requested) or from the visitor safety net (`/api/me`, every 5 min while an import is active, 35 min otherwise).
8. **After completion** the pass is repeated automatically every 6 hours (`REFRESH_AFTER_MS`) to pick up new auctions (a fresh cursor; existing records are updated, not duplicated). Pressing Import all after completion starts a new pass immediately; pressing it **mid-pass does not reset** the cursor.

### State machine (only states that exist in code)

| State | Where stored | Set by | UI shows |
|---|---|---|---|
| (no cursor) | `sheetState.baanknet` absent | never run, or admin cleared | normal source card |
| IMPORTING | `web.importAll = true`, `baanknet.done = false` | `importAllNow`, saved by `runBaanknetImport` after each batch | amber "Importing all…" badge, message `Running: BAANKNET import: … page N/T …` |
| CONTINUING | same as importing, message "…Continues automatically on the next scheduler tick." | `runBaanknetImport` when the time budget ended | "Importing all…" |
| ERROR (temporary) | `baanknet.lastError`, `web.importAll = true`, `FeedSource.lastStatus = "error"` | request failure / invalid JSON / import exception | red "Error", real error text + saved cursor; **retried from the same page on the next tick** |
| REFUSED | `web.importAll = false`, `lastStatus = "error"` | 401 / 403 / CAPTCHA / anti-bot answer | message "BAANKNET refused the request …"; automatic continuation OFF |
| BLOCKED BY ROBOTS | `importAll = false`, run log status `blocked` | robots.txt disallows the API address | "Blocked by robots.txt …" |
| PAUSED | `web.importAll = false` (cursor kept) | "Pause importing" (`pauseImportAll`) | "Import all paused."; **Run / Import all resumes from the saved page** |
| COMPLETED | `baanknet.done = true`, `completedAt`, `web.importAll = false` | end of the `live` list | "Import all completed: N page(s), M record(s) … Checked again automatically every 6 hours." |
| SOURCE PAUSED | `FeedSource.active = false` | admin "Pause" | "Paused"; the scheduler skips it |

## 4. Behaviour in each situation

| Situation | What happens |
|---|---|
| 1 page succeeds | its records are imported, counters and cursor saved, the next page is read |
| 1 page fails (HTTP error, timeout) | the 3-page batch stops; pages that were fully imported stay imported and the cursor moves only past them; `lastError` is shown; the next tick **retries from the failed page** |
| 429 / 503 | one retry after `Retry-After` (max 20 s); if it fails again the status is `rate_limited` / `service_unavailable` (temporary) and the next tick retries |
| 401 / 403 / CAPTCHA | refusal: continuation OFF, no retries (REFUSED state) |
| Vercel times out / function killed | the cursor was saved after the last finished batch; the per-source lock becomes stale after 6 min; the next tick continues. At most one batch (≤ 3 pages) of work is repeated, and repeated records are **updated, not duplicated** |
| Scheduler runs again while a run is active | the second run does not start (lock held) and returns quickly |
| Duplicate property found | matched by `src:baanknet.com:<auctionId>` → `enrichExisting` (fills gaps, keeps existing values) → counted "updated"/"already on the site" |
| Same property, new auction (re-auction) | different `auctionId` → title match → new `Auction` round on the same property (`addReauctionRound`) |
| Image missing / document missing | the record is imported without it (`media` / `documents` empty); nothing is invented |
| Borrower missing | the listing is **published** and gets attribute `borrower_status = not_available_from_source`; the property page simply omits the borrower row |
| BAANKNET changes its structure | JSON not parseable → "the answer was not valid JSON" error with cursor; unknown/missing fields → empty values; if the endpoint disappears the import errors every tick (visible in the source message/History). **Fix location:** `baanknetImport.ts` (request/response) and `baanknetRecordsFromSources` in `deepScan.ts` (field mapping) |
| `totalPages` missing | the loop ends when a page returns no rows (so it still terminates); the UI shows "page N" without "/T" |
| Page has no records | end of that status (next status / done) |
| Database insertion fails for a record | that record is rejected with `import_error: …` (and a half-created property is deleted); other records continue |
| Records are vehicles/machinery | rejected `invalid_property_type` (counted as rejected, listed with titles in the message) |

## 5. Tools
* `npx tsx scripts/baanknet-run.ts [seconds] [--force]` — runs **one batch** exactly like a tick against the database in `.env` and prints cursor + counts before/after (**writes to the database in `.env`**).
* `npx tsx scripts/render-one.ts <detail-url> [--via <list-url>] [--dump]` — read-only: shows how a rendered page is parsed (browser fallback path).
* `npx tsx scripts/diagnose-source.ts <url>` — read-only HTTP/robots/JS-shell diagnosis of any source.
* Tests: `tests/baanknet.test.ts` (record mapping, duplicate identity, cursor parsing), `tests/baanknetEmbedded.test.ts` (Flight reader), `tests/renderedParser.test.ts`, `tests/renderer.test.ts`.

## 6. Known limitations
* The listing API address and body are the site's own; **the site can change or protect them at any time** (no contract).
* `limit: 50` is larger than the page's own default (10). If BAANKNET ever rejects it, lower `PAGE_LIMIT` in `baanknetImport.ts`.
* Import speed is bounded by database round trips per record (≈ 0.3–0.5 s per record from a remote machine; much less inside Vercel's region — NOT VERIFIED numerically). A full pass takes many ticks.
* Only statuses `upcoming` and `live` are read. Completed/past auctions are not imported.
* Locations are not AI-verified by this path (`geoCity` etc. are filled later by the AI location step if the AI key works).
* The render fallback for BAANKNET detail pages exists but is slow (≈ 10–35 s per page on Vercel Hobby) and is not used by Import All.

## 7. Production verification log (2026-10-06, observed through the production database)
* Deployment of the dedicated importer (`2feebac`) and the tick-ordering fix (`b91e45b`) were live (the scheduler route answered `{"ok":false,"error":"Unauthorized"}` — the new JSON — to an unauthenticated call).
* Visitor-triggered ticks on Vercel (each started by a `claim` row in `source_run_logs`; the tick row `cron` carries the same start time): claim 06:36:16 UTC → cursor **p6 → p21** (auctions of the source **216 → 845**); claim 06:43:14 → **p21 → p36** (845 → **1,467**); claim 06:55:36 → p36 → p48 (at 06:57 UTC: 47 pages read, **2,350 records read, 1,887 new, 352 updated, 108 rejected** as vehicles/machinery, status `upcoming` page 48/91). So Import All advanced far beyond the old 12-record ceiling, automatically, tick after tick, from the saved cursor, **without any further click**.
* Tick logging: the 06:43 tick wrote its `cron` row (duration 220 s, status ok). The 06:36 tick wrote **no** `cron` row (it was cut off, probably by the deployment swap or the 300 s limit); this is why `runTick` now has a hard deadline (`hardEnd`, see [SCHEDULER.md](SCHEDULER.md)). Cursors are saved per batch, so nothing was lost.
* Duplicates: `count(auctions) = count(distinct externalAuctionId)` held after every batch (216 / 216, 101 / 101 in the first local batches); 23 records that an earlier importer had created were **updated**, not duplicated.
* Images / documents: after the first 250 records 212 of 216 properties had media and 216 of 216 had documents (`scripts/baanknet-run.ts` counters).
* Rejections observed: vehicles/machinery (`invalid_property_type`) — expected.
* **NOT VERIFIED**: a green GitHub Actions run of `tick.yml` (the last two scheduled runs, 2026-10-05 22:44Z and 2026-10-06 02:32Z, were red — they ran the old route code — and GitHub produced no newer scheduled run during the observation window); an authenticated `/api/cron/ingest` call returning HTTP 200 (the secret is not available to the person verifying); completion of the full pass (`done = true`); Vercel function logs (only the database was observable).
