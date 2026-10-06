# Operations (step-by-step procedures)

Every command is run from the repository root. **Never paste secrets into chat, tickets or commits.**

## Local development
1. Install Node.js (22 or newer; the project was developed on Node 24) and Git.
2. `git clone https://github.com/rahulsocialwits/BankAuction.git && cd BankAuction && npm install` (also runs `prisma generate`).
3. Create `.env` from `.env.example` and fill the names listed in [ENVIRONMENT.md](ENVIRONMENT.md). Minimum for the site: `DATABASE_URL`, `DIRECT_URL`, `ADMIN_SESSION_SECRET`, `ADMIN_PASSWORD`. **Use a separate database for development** — the owner's `.env` points to production.
4. `npm run dev` → http://localhost:3000 (admin: http://localhost:3000/admin/login). The Claude/Cursor launch config is `.claude/launch.json` (`bankauction-dev`).
5. Checks: `npx tsc --noEmit`, `npm run lint`, `npm test` (Node's test runner via `tsx --test tests/*.test.ts`; the browser-renderer tests are skipped when no Chrome/Edge is installed), `npm run build`.
6. Next.js 16 has breaking changes versus older versions — read `node_modules/next/dist/docs/` before changing framework-level code (`AGENTS.md`).

## Database
* Generate client: `npx prisma generate`. Apply schema: `npx prisma db push` (prints a diff; read it — it can drop columns). Browse: `npx prisma studio`.
* No migrations folder. Seed only localities: `npx tsx scripts/seed-localities.ts`.
* Merge duplicate properties by script: `npx tsx scripts/merge-duplicate-properties.ts` (writes to the DB in `.env`).

## Deploy / roll back
See [DEPLOYMENT.md](DEPLOYMENT.md). Push to `main` → Vercel builds → check "Ready". Roll back by promoting the previous deployment in Vercel and reverting the commit in Git.

## Trigger the scheduler manually
1. GitHub → Actions → "Scheduler tick" → "Run workflow" (needs the `CRON_SECRET` repository secret), **or**
2. `curl -sS -m 295 -H "x-cron-secret: $CRON_SECRET" "https://auction.bizsocio.com/api/cron/ingest?limit=100"` (expect `{"ok":true,…}`).
3. Check Admin → Data Engine → Run History for the new "Scheduler tick" row.

## Admin console (how to operate safely)
Login: `/admin/login`. Master admin = the `ADMIN_PASSWORD` login (empty e-mail) or an `AdminUser` with role MASTER; role ADMIN only sees Dashboard, Properties, Add Property, Blog, Locations (`proxy.ts` + `ADMIN_ALLOWED`). Master-only: Data Engine, Home Page, Pages, Media Library, Leads, Registered Users, Payments, AI Admin, API, AI Python Scrap — DEMO, Admin Team, Settings.
* **Properties**: filters (status tabs, search, source, bank, missing-information), Publish/Delete (Delete = hide, never a real delete), green "publish all drafts" button (`publishAllDrafts`), the filter "No borrower name" (Missing-information filter), amber box "no reserve price" → `fixThinListings`, "Delete all N filtered" (master; needs a narrowing filter; asks to confirm; reversible one by one from the Removed tab).
* **Data Engine** (`/admin/engine`): one card per source. **Run** starts a source now and keeps it automatic; **Pause** stops it; **Import all now** reads everything the source has; **Pause importing** stops the big reading but keeps the source Live; "Import ALL … every website" does it for all; the built-in BankAuctions.in card has its own Import all. History: `/admin/engine/history` (filter Problems/Ticks). Duplicates: `/admin/engine/duplicates`.

## Add a source (website, Google Sheet or CSV)
Admin → Data Engine → "+ Add a link source" → name + https URL → it is validated (`checkSourceUrl`: https only, not on the do-not-fetch list) and starts importing. A Google Sheet must be shared "Anyone with the link". Addresses on the do-not-fetch list are refused with "Source disabled by project configuration". The AI-Python-Scrap demo (`/admin/scrap-demo`) can test a site first, then "Add as Live source".

## Remove / pause a source
Data Engine → source card → **Pause** (keeps data) or **Remove** (appears for blocked/disabled sources; deletes the source row only — imported properties stay).

## Start / pause / resume Import All
* Start: source card → "Import all now". Pause: "Pause importing" (cursor kept). Resume: press "Import all now" again (BAANKNET continues from the saved page; it only restarts after a completed pass).
* Built-in crawler: its own card (⚡ Import all now / ⏸ Pause importing); it switches itself off when no unseen page remains.
* Nothing needs to be pressed repeatedly: the scheduler continues active imports.

## Debug a failed import
1. Source card message (the real error), then History row (full message and counts).
2. `npx tsx scripts/diagnose-source.ts <url>` (status, robots, content type, JS shell?).
3. Vercel runtime logs (`[crawler]`, `[baanknet]`).
4. [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Recover after a database problem
1. Check the Supabase project status/connection limits; confirm `DATABASE_URL` / `DIRECT_URL` in Vercel.
2. Restore from the provider's backup if data was lost (backup configuration NOT VERIFIED).
3. After restore: redeploy, then press Run on each source — cursors live in `feed_sources.sheetState`, so an old backup resumes from an older cursor; imports are idempotent (records are matched, not duplicated).

## Manual BAANKNET batch (writes to the DB in `.env`)
`npx tsx scripts/baanknet-run.ts 60` runs one 60-second batch and prints the cursor and counts. Add `--force` to start a new pass.

## Production smoke test (after every deployment)
1. Vercel latest deployment "Ready".
2. `curl -s https://auction.bizsocio.com/api/cron/ingest` → `{"ok":false,"error":"Unauthorized"}` (401).
3. Home page loads; `/properties` lists properties; a `/property/<slug>` page shows summary, no "Not Available" rows; the sitemap `/sitemap.xml` loads.
4. `/admin/login` → Dashboard; Data Engine shows sources with recent "Last run" times; History has a recent "Scheduler tick".
5. GitHub Actions "Scheduler tick": latest run green (HTTP 200).
6. `/admin/ai` shows "API key: Valid".
7. Spot-check one imported BAANKNET property: price, dates, bank, images, notice link.
