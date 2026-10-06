# Deployment

## Setup (as observed)
| Item | Value | Source |
|---|---|---|
| Production domain | `https://auction.bizsocio.com` | `src/lib/seo.ts` `SITE_URL`, dashboard |
| Hosting | Vercel, project **`bank-auction`**, account plan **Hobby** | Vercel dashboard screenshots |
| Region | `bom1` (Mumbai) | `vercel.json` `"regions": ["bom1"]` |
| Source | GitHub `rahulsocialwits/BankAuction`, branch `main` | git remote |
| Deploy trigger | every push to `main` creates a **Production** deployment (the dashboard shows each commit as "Production", ≈ 1.1–1.6 min build) | dashboard |
| Framework | Next.js 16.3.6, App Router | `package.json` |
| Build / install commands | Vercel defaults (`npm install`, `next build`); no overrides in the repo; `postinstall` runs `prisma generate` | NOT VERIFIED in the project settings page |
| Node version | not pinned (`engines` absent); Vercel project setting NOT VERIFIED | — |
| Function limits | routes that run imports declare `maxDuration = 300` (`/api/cron/ingest`, `/api/me`, admin engine/scrap-demo pages) | source |
| Chromium for JS pages | `next.config.ts`: `serverExternalPackages` + `outputFileTracingIncludes` for `/api/cron/*`, `/api/me`, `/admin/*` (packages **and all their dependencies**, e.g. `tar-fs`) | source |
| Cron | none in `vercel.json` (Hobby limit); scheduling is GitHub Actions + visitor safety net | [SCHEDULER.md](SCHEDULER.md) |

Preview deployments: Vercel creates them for other branches/PRs by default (NOT VERIFIED whether any are used). They share the same environment variables only if configured so — and previews that run the importer against the production `DATABASE_URL` would write to production.

## Deploy
```bash
git checkout main && git pull
npm install && npx tsc --noEmit && npm test         # local checks
git push origin main                                # Vercel builds and deploys automatically
```
Verify **READY**: Vercel → Deployments → the latest row must say "Ready" (Production). A red "Error" row means the build failed — open it and read the build log. Then check the live site and the scheduler endpoint:
```bash
curl -sS https://auction.bizsocio.com/api/cron/ingest     # expect {"ok":false,"error":"Unauthorized"} (HTTP 401) = the new route code is live
```
(An authenticated call is documented in [SCHEDULER.md](SCHEDULER.md).)

## Logs
* **Build logs**: Vercel → Deployments → select deployment → Build Logs.
* **Runtime logs**: Vercel → project → Logs (filter by path `/api/cron/ingest`, `/api/me`, level Error). Crawler lines are prefixed `[crawler]`, `[baanknet]`, `[cron/ingest]`.
* **Application history**: Admin → Data Engine → Run History (`SourceRunLog`).

## Rollback
Vercel → Deployments → pick the last good deployment → "⋯" → **Promote to Production / Instant Rollback**. Then revert the bad commit in Git (`git revert <sha> && git push`) so the next push does not redeploy the bug. Database changes are not rolled back by this.

## Database changes
There are no migration files. Apply schema edits with `npx prisma db push` (uses `DIRECT_URL`) **before** deploying code that needs them; take a backup first (see HANDOVER-CHECKLIST).

## Known deployment gotchas
* Local `.env` → production DB; do not run destructive scripts casually.
* An `after()` callback or a long request is killed at the function limit; every long job is therefore resumable.
* The build finishing is not enough: confirm (1) Ready, (2) `/api/cron/ingest` answers 401 unauthenticated and 200 with the secret, (3) the GitHub "Scheduler tick" run is green, (4) Data Engine messages are updating.
* Hobby plan limits (execution time, memory, no per-minute cron) shape the whole design; moving to Pro would allow `vercel.json` crons and more CPU for the render fallback.
