# BankAuction.co — Project Handover (start here)

> Written 2026-10-06 from the repository `rahulsocialwits/BankAuction`, branch `main`. Every statement was checked against the code.
> Wording rules: **NOT VERIFIED** = not confirmed from the repository (needs a human to confirm). **PARTIALLY IMPLEMENTED** and
> **NOT IMPLEMENTED** are used literally. No secret values appear anywhere in these documents.

## Reading order

| # | File | What it answers |
|---|---|---|
| 1 | this file | what the product is, stack, folders, state of the project |
| 2 | [ARCHITECTURE.md](ARCHITECTURE.md) | how the pieces fit, diagrams |
| 3 | [DATABASE.md](DATABASE.md) | every table, who writes it |
| 4 | [DATA-IMPORT.md](DATA-IMPORT.md) | how a listing travels from a website into the database |
| 5 | [BAANKNET.md](BAANKNET.md) | the BAANKNET importer and "Import All" in detail |
| 6 | [SCHEDULER.md](SCHEDULER.md) | cron, GitHub Actions, one tick |
| 7 | [DEPLOYMENT.md](DEPLOYMENT.md) | Vercel, GitHub, rollback |
| 8 | [ENVIRONMENT.md](ENVIRONMENT.md) | every environment variable |
| 9 | [API.md](API.md) | every HTTP route |
| 10 | [OPERATIONS.md](OPERATIONS.md) | step-by-step procedures (SOPs) |
| 11 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | "X is broken" → where to look |
| 12 | [SECURITY.md](SECURITY.md) | auth, secrets, crawler ethics |
| 13 | [HANDOVER-CHECKLIST.md](HANDOVER-CHECKLIST.md) | what the receiving team must obtain |

`docs/DATA_PIPELINE.md` is an older developer note that pre-dates several changes (it still talks about a 30-minute scheduler and a
daily Vercel cron). Where it disagrees with these files, **these files and the code win**.

## 1. What the product is (plain language)

BankAuction.co (production: `https://auction.bizsocio.com`) is an Indian **bank-auction property discovery website**. When a bank
cannot recover a loan it sells the mortgaged property by public auction (under the SARFAESI Act). Those auctions are published on
many different websites, bank pages and PDF notices. This project:

1. **collects** those listings automatically from many sources into one database,
2. **cleans** them (one format, one name per bank, duplicates removed, vehicles/machinery excluded),
3. **shows** them to visitors with search, filters, city / bank / type pages and a detail page per property,
4. gives the owner an **admin console** to run, pause and monitor the collecting and to edit site content,
5. offers a small **read-only public API** (API-key protected) and a premium-plan teaser (Razorpay settings exist; checkout is not built).

Target users: property buyers/investors looking for bank-auction properties; the site owner/admin team; other systems reading `/api/v1`.

### Main user flows
* Visitor: home → search / filters (`/properties`) → property detail (`/property/[slug]`) → enquiry (lead) / register / save.
* Admin: `/admin/login` → Dashboard → Properties (edit/hide/publish/filter/bulk-hide) → Data Engine (sources, Run, Import all, history).
* System: scheduler → `/api/cron/ingest` → one **tick** → crawlers/importers → database → site pages (ISR cache refresh).

## 2. Technology stack (only what is in `package.json` / the code)

| Technology | Version | Why / where | If removed or changed |
|---|---|---|---|
| Next.js (App Router) | 16.3.6 | whole app: pages, API routes, server actions, `proxy.ts` (middleware), ISR (`revalidate`) | everything. **Next 16 differs from older docs** — read `node_modules/next/dist/docs/` (see `AGENTS.md`) |
| React | 19.2.8 | UI | UI |
| TypeScript | ^5 (`strict`) | all code; path alias `@/*` → `src/*` (`tsconfig.json`) | type checks (`npx tsc --noEmit`) |
| Node.js | local dev observed on v24; GitHub workflow `ingest.yml` uses 22; Vercel's Node version **NOT VERIFIED** (no `engines` field) | runtime (`runtime = "nodejs"` on the cron route) | — |
| Prisma + `@prisma/client` | ^6.19.3 | ORM; `prisma/schema.prisma`; `postinstall` runs `prisma generate` | all DB access |
| PostgreSQL (Supabase) | provider `postgresql`; `DATABASE_URL` + `DIRECT_URL` | data store. `.env.example` names Supabase | all data |
| Tailwind CSS | ^4 (`@tailwindcss/postcss`) | styling, brand classes (navy / gold) | styling |
| Vercel | Hobby plan seen in dashboard; region `bom1` (`vercel.json`) | hosting, auto-deploy from `main` | production |
| GitHub + GitHub Actions | — | source, scheduler (`tick.yml`), manual ingest (`ingest.yml`) | scheduler |
| cheerio | ^1.2.0 | HTML parsing (crawlers, link discovery, rendered-page parser) | all web scraping |
| robots-parser | ^3.0.1 | robots.txt check for the built-in BankAuctions.in crawler (`lib/fetch/politeFetch.ts`) | that crawler's robots check |
| playwright-core | ^1.63.0 | drives Chromium for pages that need JavaScript (`lib/scrapDemo/browser.ts`, `feeds/render.ts`) | JS-render fallback |
| @sparticuz/chromium | ^153.0.0 | Chromium build for serverless Linux (Vercel); needs `tar-fs` | JS-render fallback in production |
| sharp | ^0.35.5 | image processing for admin uploads (`src/lib/media.ts`) | image upload |
| dotenv | ^16.6.1 | loads `.env` in scripts | scripts |
| tsx | ^4.23.15 | runs TypeScript scripts and the test runner (`npm test`) | scripts, tests |
| ESLint 9 + eslint-config-next | — | `npm run lint` | lint |
| **p-limit** ^7.3.3 | declared but **no import found in `src` or `scripts`** | unused dependency | nothing |
| AI provider "Relay Models" | OpenAI-compatible `chat/completions` at `AI_BASE_URL` | page extraction, location checks, review, admin chat (`src/lib/ai/*`) | AI features only |
| Razorpay | settings table + admin form only | **PARTIALLY IMPLEMENTED**: no checkout/webhook route exists | — |

Not present (do not look for them): Supabase client library usage in `src` (env names exist in `.env.example` but are not read by code),
Redis/queues, Docker, Jest/Vitest (tests use Node's built-in runner through `tsx --test`).

## 3. Repository layout

```
.github/workflows/   tick.yml (scheduler), ingest.yml (manual ingest)
docs/                this documentation (+ older DATA_PIPELINE.md)
prisma/schema.prisma 43 models, see DATABASE.md        (no migrations folder: schema is applied with `prisma db push`)
public/              brand images, svgs
scripts/             ingest.ts, scan-site.ts, baanknet-run.ts, diagnose-source.ts, render-one.ts, merge-duplicate-properties.ts, seed-localities.ts
src/proxy.ts         admin gate (Next 16 "proxy" = middleware)
src/app/(site)/      public website pages
src/app/admin/       admin console ((shell) = pages inside the admin frame; login separate)
src/app/api/         HTTP routes (cron, me, media, public v1 API …)
src/components/      shared React components (+ admin/)
src/data-sources/    crawlers/importers: bankauctions/ (built-in), feeds/ (link sources, BAANKNET, rendering), registry.ts
src/lib/             ai, auth, db, import, pipeline (scheduler), queries, fetch, normalization, validation, pages, payments, scrapDemo …
tests/               tsx --test files + fixtures
next.config.ts       server-external browser packages + file tracing for Chromium
vercel.json          region only (no cron entries)
AGENTS.md / CLAUDE.md  note: this Next.js version has breaking changes — read the bundled docs
```
Details per folder: [ARCHITECTURE.md](ARCHITECTURE.md).

## 4. Current state (what works, what does not) — 2026-10-06

* **Public site, admin, API, data engine**: implemented and in production.
* **Built-in crawler for bankauctions.in**: complete (every sitemap page imported; "Import all" switch exists).
* **Website "link sources"** (AI page reading): implemented; stops working when the AI key has no quota (observed: HTTP 401 "Invalid token" when the key's 1M-token limit was used up).
* **BAANKNET**: dedicated resumable importer over the site's public listing JSON — see [BAANKNET.md](BAANKNET.md). Production verification status is recorded there.
* **Scheduler**: the HTTP-500 bug of `/api/cron/ingest` (response swallowed inside a comment) was fixed in commit `2feebac`. GitHub's `*/5` schedule is **not reliable** (only 2 runs in ~4 h were observed); the visitor safety-net tick (`/api/me`) covers it.
* **Razorpay checkout / webhooks**: NOT IMPLEMENTED.
* **PDF reading**: `unpdf` is **not installed**; PDFs are linked as documents but their text is not read (`deepScan.ts` reports "PDF reader not installed").
* See "Known issues" in [TROUBLESHOOTING.md](TROUBLESHOOTING.md#known-issues-and-technical-debt).
