# HTTP API

All routes live in `src/app/api/**` (Next.js route handlers, `GET` only). Server **actions** (admin forms, contact form, login) are not HTTP endpoints you call by URL; they are listed at the end.

## Public website helpers (no authentication)
| Method | Path | Output | Cache / notes |
|---|---|---|---|
| GET | `/api/me` | `{ "user": { "name", "email" } \| null }` (current visitor from the `user_session` cookie) | `Cache-Control: private, no-store`. **Side effect:** may start a scheduler tick in the background (`claimTick`) — see [SCHEDULER.md](SCHEDULER.md). `maxDuration = 300` |
| GET | `/api/places` | places tree for the search box (`getPlaces()`) | `public, s-maxage=300, stale-while-revalidate=600` |
| GET | `/api/localities` | map of city → localities (admin-managed `localities`) | same caching |
| GET | `/api/img/[key]` | binary image from `site_images` (hero, city/type tiles). `key` must match `^[A-Za-z0-9_-]{3,80}$` else 404 | ETag + 304; `public, max-age=31536000, immutable` when `?v=` is present, else 300 s |
| GET | `/api/media/[id]` | binary image from the media library (`media_assets`); `id` must match `^[A-Za-z0-9]{10,40}$` | `immutable` 1 year |

## Scheduler endpoint (secret)
| GET | `/api/cron/ingest?limit=100` | header `x-cron-secret: <CRON_SECRET>` (or `?secret=`, or `Authorization: Bearer`) | `200 {"ok":true,"ms":N,"result":{…}}`, `401 {"ok":false,"error":"Unauthorized"}`, `500 {"ok":false,"error":"…"}`. Runs the whole tick inside the request (≤ 300 s). Full description: [SCHEDULER.md](SCHEDULER.md) |

## Admin-only
| GET | `/api/media-list` | master admin cookie (`isMasterAdmin`) | `403 {"error":"Not allowed"}` otherwise; returns up to 300 media-library rows (`private, no-store`) |

## Public data API (API key) — `/api/v1`
Authentication: header `Authorization: Bearer <key>` **or** `x-api-key: <key>`. Keys are created in Admin → API (stored as sha256; the key is shown once). Rate limit **120 requests/minute per key** (in-memory per server instance), over the limit → `429` with `Retry-After: 30`.
Errors share one shape: `{ "error": { "code", "message" } }` — `401 missing_key`, `401 invalid_key`, `429 rate_limited`, `404` for an unknown slug.
The public property shape (`src/lib/apiShape.ts`) **deliberately omits borrower name, officer contact details and document links** (kept behind the premium plan on the website).

| Method | Path | Query parameters | Response |
|---|---|---|---|
| GET | `/api/v1/properties` | `state`, `city`, `locality`, `category` (RESIDENTIAL, COMMERCIAL, INDUSTRIAL, LAND_PLOT, AGRICULTURAL), `bank` (bank **slug**), `q` (text), `status` (`active` default, `completed`, `all`), `priceMin`, `priceMax`, `updatedSince` (ISO date), `page` (from 1), `limit` (1–50, default 20) | `{ data: [...], page, limit, total, hasMore }`, newest first (`createdAt desc`) |
| GET | `/api/v1/properties/[slug]` | — | `{ data: {...} }` or `404` |
| GET | `/api/v1/banks` | — | `{ data: [{ name, slug, listings }] }` (banks with at least one published listing) |
| GET | `/api/v1/places` | — | `{ data: <places> }` |

Example (no real key):
```bash
curl -H "x-api-key: $BANKAUCTION_API_KEY" "https://auction.bizsocio.com/api/v1/properties?city=Mumbai&limit=5"
```
Database effect: each authenticated call increments `api_keys.requestCount` and sets `lastUsedAt` (failure of that write never fails the request).

## Public pages (not JSON)
`/`, `/properties` (filters: `q`, `category`, `bank`, `state`, `city`, `locality`, `status`, `priceMin`, `priceMax`, `page`), `/property/[slug]`, `/auctions`, `/auctions/[status]`, `/bank/[slug]`, `/banks`, `/city/[slug]`, `/cities`, `/property-type/[slug]`, `/property-types`, `/blog`, `/blog/[slug]`, `/about`, `/faq`, `/how-it-works`, `/pricing`, `/contact`, `/privacy-policy`, `/terms-and-conditions`, `/disclaimer`, `/login`, `/register`, `/saved-properties`, `/my-alerts`, plus `/sitemap.xml` and `/robots.txt` (`src/app/sitemap.ts`, `robots.ts`; robots disallows `/admin`, `/api/` (except `/api/img/`, `/api/media/`), `/login`, `/register`, `/my-alerts`, `/saved-properties`).

## Server actions (forms)
| File | Actions |
|---|---|
| `app/admin/login/actions.ts` | `loginAdmin` (sets `admin_session`, 12 h) |
| `app/admin/(shell)/engine/actions.ts` | `toggleBuiltIn`, `toggleFeedSource` (Run/Pause), `deleteFeedSource`, `runFeedSourceNow`, `importAllNow`, `importEverythingNow`, `pauseImportAll`, `pauseImportingEverything`, `fixThinNow`, `importAllBuiltIn`, `pauseBuiltInImportAll` — all `requireMaster()` |
| `app/admin/(shell)/properties/actions.ts` | `approveProperty`, `rejectProperty`, `removeProperty` (soft delete = `REMOVED`), `restoreProperty`, `bulkRemoveProperties` (master), `publishAllDrafts` (master: publishes every DRAFT and removes its `enrichment_status` attribute), `updateProperty`, property create (`properties/new`) |
| `app/admin/(shell)/scrap-demo/actions.ts` | `runScrapDemo` (in-memory demo), `addAsLiveSource` (creates a `FeedSource` and starts its import) |
| `app/admin/(shell)/{ai,api,home,pages,media,leads,users,payments,admins,settings,blog,localities}/actions.ts` | content/settings CRUD (master or admin per sidebar) |
| `app/(site)/contact/actions.ts`, `property/[slug]/actions.ts` | create `Lead` |
| `app/(site)/{login,register}` | user sign-in/up (`user_session` cookie) |
