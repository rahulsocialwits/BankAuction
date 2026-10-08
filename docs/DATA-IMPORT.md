# Data import system

Every listing in the database came through one function: **`importRecords()`** in `src/lib/import/csvImport.ts`
(except the built-in crawler, which has its own write path in `bankauctions/adapter.ts`, and admin "Add property").
Sources differ only in how they produce `ListingRecord[]`.

```
SOURCE → DISCOVERY → FETCH → PARSE/EXTRACT → NORMALIZE → VALIDATE → DEDUPLICATE → INSERT/UPDATE → MEDIA → DOCUMENTS → LOG → STATUS
```

## 1. The record format: `ListingRecord`
`type ListingRecord = Record<string, string | undefined>` (csvImport.ts). Keys used by the importer (all lower-case strings):
`title, bank, branch, category, location, description, borrower, reserve_price, emd, minimum_increment, auction_start, auction_end, application_deadline, inspection_date, inspection_time, inspection_text, auction_method, auction_type, possession_status, officer_name, officer_phone, officer_email, notice_number, external_id, source_url, legal_schedule, source_property_type, latitude, longitude, documents (JSON array of {type,title,url}), media (JSON array of {type?,url}), dsc_required, accept_reserve_first, auto_extension, extension_mins, extension_trigger, deep_done ("1" = already read in depth), ended_long_ago ("1" = auction ended more than 14 days ago), borrower_status`.
Amounts are digit strings in rupees; dates are IST ISO strings (`2026-10-06T10:00`); a date without an offset is read as IST (`parseListingDate`).

## 2. Source types and their path

| Source type | Discovery / fetch | Parser | Runner |
|---|---|---|---|
| **Built-in: bankauctions.in** | sitemap `https://bankauctions.in/wp-sitemap-auctions-1.xml` (URLs containing `/auction/`), `pickUrls` = ~70 % never-stored (newest first) + ~30 % oldest-checked; `politeFetch` (2 s between requests, robots-parser) | `extractBankAuctionsListing` + `normalizeBankAuctionsRecord` (code, no AI) | `runBankAuctionsIngestion` (each tick; "Import all" = only unseen pages) |
| **Website link source** (list page) | the feed URL; `robotsCheck` then `fetchWithRetry` | AI: `scanWebPage` (`webScan.ts`) reads page text → JSON array | `runFeedSource` → `importRecords(..., { deepen, strict })` |
| **Website whole-site scan** | `discoverListingUrls` (`siteScan.ts`): index pages → address "shapes" (`first-path|depth|kind`) → groups with ≥ 3 links that look like property pages (verified by a sample page with reserve price + auction words + money) | new listing pages are read by `makeDeepener(...).fromUrl` (detail page + notice PDFs + 1 AI call; or code parser for rendered pages) | `runWebDiscovery` |
| **Google Sheet** (`docs.google.com/spreadsheets/…`) | `listSheetTabs` (reads Google's htmlview JS), `fetchTabCsv` per tab | `importTabular` (`tabular.ts`): known layouts by code; unknown columns mapped once by AI; "Raw Source Records" rows by `richRaw.ts` (no AI) | `runFeedSource` → `runSheet` |
| **CSV link / pasted CSV / bulk import page** | CSV URL or admin upload (`/admin/properties/import`) | `importCsvText` (header must include `title`) | `importCsvText` |
| **BAANKNET** | the site's public listing data, page after page | `baanknetRecordsFromSources` (code) | `runBaanknetImport` — see [BAANKNET.md](BAANKNET.md) |
| **JavaScript-only websites** | normal fetch first; if the HTML is a shell (`isJsShell`) the page is opened in Chromium | rendered pages: `parseRenderedProperty` (code) first, AI only if the basics are missing | `realDeps().fetchDoc` (deepScan.ts) |
| **Admin "Add property"** | form | — | `admin/(shell)/properties/new` |

### AI usage
* Client: `src/lib/ai/relayModelsClient.ts` → `POST {AI_BASE_URL}/chat/completions`, temperature 0, 120 s timeout. Model chain: configured model → fallback → `deepseek-v4-flash` → `qwen3.7-plus`; short backoff retries for 429/503/capacity. Default model `glm-5.3-cursor` (`aiConfig.ts`). Token counts are returned and logged (`SourceRunLog.aiTokens`).
* Prompts: `DEFAULT_EXTRACTION_PROMPT` (`webScan.ts`, list pages; overridable in `AiSettings.extractionPrompt`) and `DEEP_PROMPT` (`deepScan.ts`, one listing). Standing owner rules (`AiSettings.rules`) are appended to every prompt.
* **AI is skipped when**: the page text hash equals `FeedSource.contentHash` ("Unchanged: AI skipped"); the same text was already processed by another source (hash found in other feeds); a per-source AI lock is held; BAANKNET and Google-Sheet rows (read by code); BankAuctions.in (read by code).
* Page text is cut to `maxPageChars` (default 40,000) and read in 12,000-character chunks, 4 at a time.
* Error behaviour: an AI failure makes that source run fail with the real message (for example `Relay Models request failed: HTTP 401 … Invalid token` when the key's quota is exhausted); it is stored in `FeedSource.lastMessage` and History.

## 3. Fetch rules (all website fetching)
* `blockedHosts.ts` `BLOCKED_HOSTS = ["auctionbazaar.com", "bankauction.co", "findauction.in"]` (project policy; message "Source disabled by project configuration"). `baanknet.com` was removed from the list by the owner (commit `6c3a504`).
* robots.txt: `RobotsGate` (read once per site, wildcard `*` and `$`, longest rule wins, Allow wins ties, Crawl-delay honoured) — implemented in `lib/fetch/robotsRules.ts`.
* One retry only for HTTP 429/503 (`fetchWithRetry`, `Retry-After` honoured, max 20 s). 401 / 403 / CAPTCHA / anti-bot page = refusal: the page or source stops (source "Blocked"), never retried or bypassed. 5xx/timeouts = temporary errors; the source stays Live.
* User agent: `BankAuctionBot/1.0 (+https://auction.bizsocio.com)` (`webScan.ts` `UA`); the built-in crawler sends `BankAuctionBot/0.1 …` (`politeFetch.ts`).
* Request spacing: ≥ 400 ms between requests (150 ms for baanknet.com) in `realDeps`; 2 s for the built-in crawler. HTML ≤ 2.5 MB, PDF ≤ 4 MB.

## 4. Deep scan of one listing (`deepScan.ts`)
`readDetail`: fetch the detail page (via the list page for single-page apps) → collect notice links (`noticeLinks`: PDF/Word/Excel files, "Download" links without extension, embedded iframes, images only when named notice; max 14) → read up to 4 text PDFs (**requires `unpdf`, not installed**) → one AI call, or the code parser for rendered pages → `toListings`. Caps: `DEEP_MAX_LISTINGS = 8` per list-page run, detail text 14,000 chars, PDF text 12,000.

## 5. `importRecords` — normalize, validate, deduplicate, write
Per record, in this order (`csvImport.ts`):
1. `normalizeListing` (`import/normalize.ts`): strips markdown/HTML, Title-Cases SHOUTING text, converts amounts ("Rs. 25.5 Lakh", "₹1.2 Cr") to rupees, drops reserve < 1,000 and EMD < 100 or "%" values, validates e-mail, one bank name per real bank (`canonicalBankKey`).
2. Quality gate: title ≥ 8 chars and (bank or location) → else rejection `title_missing` / `address_missing`.
3. Excluded: vehicles (`isVehicleListing`) and movables (machinery, jewellery, going concern) → rejection `invalid_property_type`.
4. Bank resolved once per run (`resolveBank`).
5. Duplicate search among the bank's existing auctions (`known()`, up to 20,000): same `external_id` (when `enrich` is on **or the id starts with `src:`**), or title token Jaccard ≥ 0.8, or same reserve + same auction day, or same reserve + title overlap ≥ 0.4.
6. If a hit: **re-auction check** `addReauctionRound` (same property, later date, ≥ 36 h after every known round → new `Auction` row, old round's status recomputed, `PropertyChange` `re_auction`); else `enrichExisting` (fills empty fields, fixes unit-less prices, same-feed times; strong match when ids equal, otherwise needs price or date support); else for thin listings the deep-read backfill; counted as `skipped`/`updated`.
7. New listing: ended > 14 days ago → `stale` (not added); `deepen` hook reads its own page first; `strict` mode requires reserve price + auction date + address/schedule → else rejection with codes `reserve_price_missing`, `auction_date_missing`, `address_missing` (+ the page-read failure code if any).
8. Last database look (`auction.findMany({ where: { reservePrice } })`, 60 rows) catches duplicates created meanwhile by another source/run.
9. Create `Property` (status = the caller's status, normally `PUBLISHED`) + `Auction` + attributes (`legal_schedule`, `source_property_type`, `borrower_status=not_available_from_source` when no borrower) + documents + media. If anything after the property insert fails, the property is deleted again (no orphan).
10. Returns `{ created, skipped, failed, updated, stale, reauctions, held, rejections[] }`. `held` is always 0 now: listings **without a borrower are published** (commits `b4de099`, `75201f3`); the older "DRAFT + needs_enrichment" hold survives only as a promotion rule in `enrichExisting`. The Properties filter "No borrower name" finds them; with a narrowing filter the master can bulk-hide them ("Delete all N filtered"). The earlier one-click "hide all without borrower" button was removed (commit `5056213`); `publishAllDrafts` publishes any DRAFT left by the old hold.
`MAX_ROWS = 500` records per call.

### Media and documents
* `attachDocuments`: upsert `Document` by unique `sourceUrl` (type guessed, `OTHER` fallback) and link `PropertyDocument` (max 12 per record).
* `attachMedia`: find/create `Media` by `sourceUrl`, link `PropertyMedia` with `sortOrder` (max 12). **Only URLs are stored — no file is downloaded or copied.** Broken/missing URLs are not detected at import time (NOT VERIFIED whether the property page hides broken images).

## 6. Logging and status
* `FeedSource.lastMessage` / `lastStatus` / `lastRunAt` (what the admin sees on the source card). Messages starting `Running:` are live progress (overwritten by the final result).
* `SourceRunLog` rows via `logRun` (`pipeline/runLog.ts`): `kind` builtin/feed/csv/cron; History page `/admin/engine/history`.
* Rejections are reported with exact codes (`rejectionNote` in `run.ts`).

## 7. Scheduling of source types
See [SCHEDULER.md](SCHEDULER.md). In short: website sources are scanned about hourly (`SITE_SCAN_GAP_MS` 50 min) or on every tick while "Import all" is active; Sheet/CSV sources hourly (`MIN_INTERVAL_MS` 55 min); the built-in crawler every tick; unfinished first imports ("Continues automatically.") on every tick for 24 h.

## 8. Known limitations
* PDF text is not read (`unpdf` missing) — notices are linked, not parsed.
* Fuzzy title matching can merge near-identical titles of different units (two flats in one building); enrichment of fuzzy matches requires price or date support.
* Existing listings are not updated when a website changes, except via sheet/BAANKNET/thin-backfill paths.
* A listing whose page needs login, CAPTCHA or JavaScript that cannot be rendered in time is rejected with a code (`http_401`, `captcha`, `render_timeout`, …), not guessed.
