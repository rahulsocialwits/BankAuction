# Data pipeline — developer guide

How listings get into BankAuction.co. Everything that reads an outside source, removes duplicates or
publishes a property lives behind the flow below. **Only Relay Models is used for AI at runtime.**

```
scheduler (every 30 min)
   │  GET /api/cron/ingest?secret=CRON_SECRET     (or scripts/ingest.ts from GitHub Actions)
   ▼
┌───────────────────────────── one tick ─────────────────────────────┐
│ 1. Built-in crawler      src/data-sources/bankauctions/adapter.ts   │
│ 2. Link sources (DB)     src/data-sources/feeds/run.ts  runAllFeeds │
└─────────────────────────────────────────────────────────────────────┘
        │ each source produces ListingRecord[]  (src/lib/import/csvImport.ts)
        ▼
  importRecords()  →  quality gate → duplicate check → create Property + Auction (PUBLISHED)
        │
        ▼
  SourceRunLog row (src/lib/pipeline/runLog.ts)  →  Admin → Data Engine → Run History
```

## Stages and where to change them

| Stage | File | Notes |
|---|---|---|
| Schedule | `vercel.json` (daily backstop), `.github/workflows/ingest.yml`, external pinger | One URL runs everything. Each call is logged as a "Scheduler tick". |
| Fetch | `data-sources/feeds/run.ts` `runFeedSource` | Sheet/CSV link: fetched as CSV. Web page: robots.txt must allow (`webScan.ts robotsAllows`). 401/403/robots refusal ⇒ source is auto-paused as **Blocked**. Never bypass. |
| Extract (AI) | `data-sources/feeds/webScan.ts` `scanWebPage` | HTML → text → Relay Models → JSON array. Page text hash is stored in `FeedSource.contentHash`; unchanged page ⇒ **no AI call**. |
| AI client | `lib/ai/relayModelsClient.ts`, `lib/ai/aiConfig.ts` | Model, fallback model, prompt, max page size come from `ai_settings` (Admin → AI Admin) with env fallback. Returns token usage. |
| Dedup | `lib/import/csvImport.ts` `importRecords` | Same bank + (title token Jaccard ≥ 0.8 **or** same reserve price + same auction day). Bank-scoped list is preloaded once per run. The built-in crawler also has an AI check: `lib/deduplication/aiDuplicateCheck.ts`. |
| Dedup clean-up | `lib/pipeline/duplicates.ts`, Admin → Data Engine → Duplicates | Finds groups already in the DB; keeps the oldest, marks the rest `DUPLICATE`. |
| Quality gate | `importRecords` | Title ≥ 8 chars and (bank or location), else counted as *rejected*. |
| Publish | `importRecords` | Creates `Property` + `Auction` as `PUBLISHED` (no review step). |
| Hide / delete | `admin/properties/actions.ts` | "Delete" sets `REMOVED` (row kept so a crawler can't resurrect it). `DUPLICATE` is the same idea. |

## Locations (AI-verified)

`lib/pipeline/geo.ts` `enrichLocations()` runs on every tick (and after imports). It sends new listings to the
Relay AI in batches of 12 and stores the real `geoCity`, `geoLocality` and `geoState` on the property
(`geoCheckedAt` marks it done). The City / Area filters, `/cities`, `/city/[slug]` and the home "Browse by
Location" use these fields (`lib/queries/cities.ts`, `lib/queries/localities.ts`, `lib/queries/listProperties.ts`).
Listings not yet checked fall back to a text match. Manually added properties set the place themselves.

## Spreadsheets with any column layout

`lib/import/tabular.ts` `importTabular()`: a CSV with a `title` column goes straight in; anything else is mapped by
the AI **once** (header row + a few sample rows → which column is title/bank/price/date …), then applied to every
row in code. Dates are read day-first (12/10/2026) and prices like "₹ 45,00,000" are cleaned. The mapping is kept
in `FeedSource.sheetState` while the header is unchanged, and a tab whose content hash is unchanged is skipped.
For a Google Sheet, `data-sources/feeds/sheets.ts` lists **every tab** (public `htmlview` page) and exports each as
CSV. The sheet must be shared "Anyone with the link".

## Admin roles

`AdminUser.role` is `MASTER` or `ADMIN`; the master password (no email) is always a master. The session cookie
carries the role (`lib/auth/adminSession.ts`). `proxy.ts` limits a normal admin to Dashboard, Properties, Add
Property, Blog and Locations (`canAccessAdminPath`), and every master-only server action calls `requireMaster()` /
`isMasterAdmin()` as a second lock. A normal admin sees no source, duplicate or pipeline information anywhere.

## Payments

`PaymentSettings` / `Payment` tables, Admin → Payments (master only). Keys: the public Razorpay key id is stored in the
DB; `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` live only in environment variables. Plans are edited there and
shown on `/pricing`. Online checkout and the webhook handler are not built yet (the page is the foundation).

## Adding a new kind of source

1. Write a function that returns `ListingRecord[]` (see the type in `csvImport.ts`) — via CSV parsing, an API, or `scanWebPage`.
2. Pass it to `importRecords(records, "<source label>", "PUBLISHED", sourceUrl?)`. Dedup, quality gate and publishing are already there.
3. Call `logRun({ source, kind, trigger, status, created, ... })` so it appears in Run History.
4. Call your function from `route.ts` / `scripts/ingest.ts` next to `runAllFeeds()`.

A plain website needs **no code at all**: add its link in Admin → Data Engine → Link Sources.

## Compliance rules (do not remove)

- Respect robots.txt and site terms. `BLOCKED_HOSTS` in `feeds/run.ts` lists hosts that must never be added
  (Baanknet, AuctionBazaar, eAuctionsIndia, bankauction.co). Do not solve CAPTCHAs or evade Cloudflare.
- Identify honestly: user agent `BankAuctionBot/1.0` (`webScan.ts`).

## Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Supabase Postgres (pooled / direct) |
| `AI_API_KEY`, `AI_BASE_URL` | Relay Models key and `https://api.relaymodels.com/v1` — keep as **Secret** in Vercel |
| `AI_EXTRACTOR_MODEL` | Fallback model name when none is saved in AI Admin |
| `CRON_SECRET` | Protects `/api/cron/ingest` |

The same AI variables must exist as GitHub Actions secrets for the GitHub-triggered run.

## Tables

`feed_sources` (link sources), `source_run_logs` (history), `ai_settings` (developer AI config),
`sources` / `source_records` / `import_jobs` (built-in crawler), `properties` / `auctions` (published data).

## Known limitations

- Existing listings are not updated when a link-source page changes price or date (only new listings are created).
- JavaScript-rendered sites (e.g. DRT AuctionTiger) return no listings because only server HTML is read.
- Category is whatever the AI/CSV says; "Land and Building" may be typed Residential.
