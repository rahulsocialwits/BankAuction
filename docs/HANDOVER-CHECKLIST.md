# Handover checklist

Tick each item with the **outgoing owner present**. Never write passwords, API keys or secrets in this file, chat, tickets or commits — exchange them through a password manager.

## Access
- [ ] GitHub: access to `rahulsocialwits/BankAuction` (admin, to manage Actions secrets and branch settings)
- [ ] GitHub Actions: workflow "Scheduler tick" enabled; repository secret **`CRON_SECRET`** exists (and equals the Vercel value); last run green
- [ ] Vercel: access to the project `bank-auction` (Hobby plan today); production branch `main`; domain `auction.bizsocio.com` attached
- [ ] Domain registrar / DNS for `bizsocio.com` (who controls the record that points `auction.` to Vercel) — NOT VERIFIED from the repo
- [ ] Database (Supabase): project access, connection strings, backup/PITR status, connection limits
- [ ] AI provider "Relay Models": account, current key, **remaining quota/limit** (the previous key's 1M-token limit was exhausted on 2026-10-05), `AI_BASE_URL`
- [ ] Razorpay (only if payments will be built): account + keys (currently settings only)
- [ ] Admin credentials: master password (`ADMIN_PASSWORD`), existing `AdminUser` rows — handed over separately; **rotate** after handover
- [ ] External pingers / monitors (none are configured in the repository)

## Environment
- [ ] Every variable in [ENVIRONMENT.md](ENVIRONMENT.md) is present in Vercel (Production) and understood; secrets rotated: `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `USER_SESSION_SECRET`, `CRON_SECRET`, `AI_API_KEY`, DB password
- [ ] A **separate development database** exists (the old local `.env` pointed at production)
- [ ] Local setup works for the new developer: `npm install`, `npm run dev`, `npx tsc --noEmit`, `npm test`

## Production state
- [ ] Latest Vercel deployment "Ready"; `curl https://auction.bizsocio.com/api/cron/ingest` → HTTP 401 JSON
- [ ] Authenticated scheduler call returns HTTP 200 `{"ok":true,…}` (see [SCHEDULER.md](SCHEDULER.md))
- [ ] Data Engine: every source card understood (Live / Paused / Blocked / Disabled by configuration); BAANKNET cursor and "Import all completed" state read
- [ ] `/admin/ai` shows a valid AI key; History shows no repeating errors
- [ ] Do-not-fetch policy understood: `feeds/blockedHosts.ts` (`auctionbazaar.com`, `bankauction.co`, `findauction.in`) is the owner's policy; `baanknet.com` was removed on the owner's instruction (commit `6c3a504`)

## Operations
- [ ] Backup procedure agreed and tested (restore drill); retention known
- [ ] Monitoring/alerts decided: GitHub Actions failure e-mails, Vercel error alerts, uptime check on the home page and on `/api/cron/ingest` (401 expected)
- [ ] A second scheduler trigger decided (external pinger) because GitHub's schedule is best-effort
- [ ] Runbooks read: [OPERATIONS.md](OPERATIONS.md), [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [ ] Known issues list reviewed with the owner ([TROUBLESHOOTING.md](TROUBLESHOOTING.md#3-known-issues-and-technical-debt))
- [ ] Legal texts (privacy, terms, disclaimer, "shown as Not Available" wording) reviewed by a lawyer — the pages exist and are editable in Admin → Pages; legal review is NOT VERIFIED

## Documentation
- [ ] This package read in order ([PROJECT-HANDOVER.md](PROJECT-HANDOVER.md)); outdated `docs/DATA_PIPELINE.md` retired or corrected
- [ ] Emergency contacts recorded **outside the repository** (owner, hosting, database, AI provider, domain)
