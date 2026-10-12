# Temporary Netlify preview (while Vercel is rate limited)

Status: DRAFT guide. Nothing here was run: every Netlify statement is **NOT VERIFIED** until someone does the steps. Do not change production DNS and do not move auction.bizsocio.com.

## 1. Situation (verified from GitHub, 2026-10-10)
- Vercel status on commits 214ae82 and 6a6ab9a: "Deployment rate limited, retry in 24 hours" (free plan build limit). GitHub CI `verify` is green on 6a6ab9a.
- Live site still lacks 214ae82: no security headers, `/auctions?page=2` has no pager, property page has no disclaimer (checked with curl).
- Live site HAS 924ba38 (keyword search works: `?keyword=nashik` shows 69 listings).
- The scheduler (GitHub Actions `tick.yml`) calls `https://auction.bizsocio.com/api/cron/ingest`; it keeps working on the existing deployment and does not depend on a new deploy.

## 2. Safest immediate options
1. **Wait ~24 h** for the Vercel limit to reset, or upgrade the Vercel plan. No code change, no risk. Do not push more commits (each push and PR preview consumes builds).
2. **Netlify preview for the client demo only** (below). Separate URL, same database. Not a replacement for production.

## 3. Netlify fit for this app (NOT VERIFIED, to confirm on a Netlify account)
| Area | Finding |
|---|---|
| Next.js 16 | Needs Netlify's current Next.js runtime (auto-detected). Confirm Next 16.3.6 is supported before relying on it. |
| Database | Same `DATABASE_URL` (Supabase Postgres). Netlify functions run in a different region than Vercel `bom1`: expect slower queries. Use the pooled connection string. |
| Prisma | `prisma generate` runs on `npm ci` (postinstall). The query engine binary must be bundled for the function runtime; if a "query engine not found" error appears, add `binaryTargets` for the Netlify runtime in `prisma/schema.prisma` (a code change, do it on a branch). |
| Function time | `/api/cron/ingest` sets `maxDuration = 300` and the tick runs up to 262 s. Netlify synchronous functions have a much shorter limit (seconds, plan dependent). **Do not run imports or the scheduler on Netlify.** Keep ingest on the Vercel deployment. |
| Headless Chromium | `@sparticuz/chromium` / playwright rendering will not fit Netlify function limits. Not needed for a read-only preview. |
| Scheduled jobs | Keep GitHub Actions pointing at auction.bizsocio.com. Do NOT add `CRON_SECRET` calls to the Netlify URL. |
| Images | Photos are bank CDN URLs rendered with plain `<img>` (no Next image optimiser), so no image configuration is needed. |
| Auth | Cookie sessions signed with `ADMIN_SESSION_SECRET` / `USER_SESSION_SECRET`. A Netlify URL is a different origin: sessions do not carry over. Use only for public pages; do not log in to admin there. |
| `vercel.json` | Only `regions: ["bom1"]`; ignored by Netlify. |

## 4. Environment variable NAMES (set values in the Netlify UI yourself; never paste values in chat, git or logs)
Required for a read-only public preview: `DATABASE_URL`, `DIRECT_URL`, `USER_SESSION_SECRET`, `NEXT_PUBLIC_SUPABASE_URL` (if used), `NEXT_PUBLIC_MAP_TILE_URL` (optional).
Leave UNSET on the preview (so it cannot write or spend): `CRON_SECRET`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `AI_API_KEY`, `AI_BASE_URL`, `RAZORPAY_*`.
Because the preview shares the production database, use a read-only database role if you can create one.

## 5. Steps
1. Netlify: Add new site, Import from GitHub, repo `rahulsocialwits/BankAuction`, branch `main`.
2. Build command `npm run build`, no publish directory override (the Next.js runtime sets it).
3. Add the variables from section 4, then Deploy.
4. Use the generated `*.netlify.app` URL. Do not attach auction.bizsocio.com.
5. Set the site to not index (Netlify "Deploys > Settings", or a password/visitor access) so the preview is not crawled.

## 6. Verification checklist (mark each yes / no / NOT VERIFIED)
- [ ] Build finished green; no "query engine" or "cannot find module" error.
- [ ] `/` loads with city cards and photos.
- [ ] `/properties?keyword=nashik` shows a total matching production (69 at the time of writing).
- [ ] `/auctions?page=2` shows "Page 2 of N".
- [ ] A `/property/<slug>` page shows the gallery, the disclaimer, and no "Coord quality" row.
- [ ] `curl -I <preview-url>` shows `x-frame-options`, `x-content-type-options`, `referrer-policy`.
- [ ] `/properties?view=map` renders pins.
- [ ] `/api/cron/ingest` without the secret returns 401 (and the preview has no `CRON_SECRET`, so ingest cannot run there).
- [ ] Production unchanged: auction.bizsocio.com DNS and tick workflow untouched.

## 7. Rollback
Delete the Netlify site. Nothing else changed.
