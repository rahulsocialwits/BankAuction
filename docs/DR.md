# BankAuction — Disaster Recovery Runbook

This document tells Mayur (the owner) what to do when something goes wrong. It is written for someone who is not a developer. Each section is a named failure scenario with step-by-step instructions.

**Production site:** https://auction.bizsocio.com  
**Repo:** https://github.com/rahulsocialwits/BankAuction  
**Database:** Supabase PostgreSQL — log in at https://supabase.com and choose the BankAuction project.  
**Hosting:** Vercel — log in at https://vercel.com and choose the BankAuction project.

---

## 1. The site is down (shows an error or blank page)

1. Open https://vercel.com → BankAuction → **Deployments**.
2. Look at the most recent deployment. If it shows a red ✗, click it and read the build log.
3. If the build log mentions a **database connection error**, go to Supabase → Settings → Database and check that the connection string is still correct. Vercel may need the env var `DATABASE_URL` updated.
4. If the most recent deployment is green but the site is still down, click **Redeploy** on the green deployment.
5. If you cannot find the problem, **revert**: on the Deployments page, find the last green deployment before the problem, click its three-dot menu, and choose **Promote to Production**.

---

## 2. No new auction rows in Admin → Engine → History for 15+ minutes

1. Open https://github.com/rahulsocialwits/BankAuction/actions and look for the **tick** workflow. If it is failing (red), click the most recent run and read the error.
2. The most common cause is a wrong or missing `CRON_SECRET`. To check: Vercel → BankAuction → Settings → Environment Variables → confirm `CRON_SECRET` is set. GitHub → repo → Settings → Secrets → confirm `CRON_SECRET` matches.
3. If both match and the workflow still fails, copy the full error from GitHub Actions and send it to your developer.
4. If the **tick** workflow is green but Admin → History shows no rows, the site is running but the ingestion route is failing silently. Open Admin → Engine → History and copy the last row's text; share it with your developer.

---

## 3. Property count dropped sharply overnight

This means listings were removed or hidden. **Do not run any import or cleanup yourself.**

1. Open Admin → Engine → History. Look for a row that says CRITICAL or INCOMPLETE for the BankAuctions.in source. If you see one, that source's protection gate fired correctly and no listings were removed automatically.
2. Take a screenshot of the last 5–10 History rows and send them to your developer.
3. Do NOT press "Import all" or "Accept new baseline" until your developer has confirmed it is safe.
4. The most recent data-safe state is in Supabase. Go to Supabase → Table Editor → properties and confirm the row count is roughly what you expected. If rows are missing, they may need to be restored from a Supabase backup (see §6).

---

## 4. A Vercel deployment failed (build error)

1. Open Vercel → BankAuction → Deployments → click the failed deployment.
2. Read the **Build Logs** section. The last red line is the error.
3. Common errors:
   - **Type error / TS error**: a code change introduced a TypeScript problem. The fix is a code change — send the error to your developer.
   - **Prisma client not generated**: very rare on Vercel; usually a transient error. Click **Redeploy**.
   - **Environment variable missing**: add the missing variable under Vercel → Settings → Environment Variables, then redeploy.
4. If you need to restore service immediately, promote the last green deployment (see §1 step 5).

---

## 5. A bad code change was merged and the site is broken

1. Find the PR that caused the problem: https://github.com/rahulsocialwits/BankAuction/pulls → Closed. Look at the most recently merged PR.
2. Open that PR and click **Revert** (GitHub shows this button on merged PRs). This creates a new PR that undoes the change.
3. Merge the revert PR. Vercel will deploy the reverted code automatically.
4. Send a note to your developer explaining what broke.

---

## 6. Data loss — listings are missing from the database

Supabase keeps **daily Point-in-Time Recovery (PITR)** backups on paid plans. On the free plan, Supabase keeps database snapshots.

**To restore from a backup:**

1. Log in to https://supabase.com → choose the BankAuction project.
2. Go to **Settings → Backups** (or **Database → Backups** depending on your plan).
3. Find the most recent backup before the data loss occurred.
4. Click **Restore** and follow the prompts. **Warning: this overwrites all data with the backup state.**
5. After the restore completes, run a full import in Admin → Engine → "Import all" to bring listings back up to date.
6. Send a note to your developer describing what happened and when.

**Manual backup before a risky operation:**

Your developer should dump the database before any migration or mass import:
```
pg_dump <DATABASE_URL> > bankauction_backup_YYYYMMDD.sql
```
This command is run by the developer, never from this document.

---

## 7. The CRON_SECRET was exposed or needs to be rotated

1. Generate a new secret: go to https://generate-secret.vercel.app/32 and copy the value.
2. Update it in **two places**:
   - Vercel → BankAuction → Settings → Environment Variables → `CRON_SECRET` → Edit → paste the new value → Save. Then **Redeploy** (Vercel does not automatically redeploy on env var changes).
   - GitHub → https://github.com/rahulsocialwits/BankAuction → Settings → Secrets and variables → Actions → `CRON_SECRET` → Update → paste the same value → Save.
3. The old secret is now invalid. Any external pingers (cron-job.org, UptimeRobot) that use the secret in a URL parameter must be updated too.

---

## 8. Admin login stopped working

The admin password is stored as the `ADMIN_PASSWORD` environment variable in Vercel.

1. Vercel → BankAuction → Settings → Environment Variables → `ADMIN_PASSWORD`.
2. If the variable is there, the value may have been changed accidentally. Set it back to the correct password and redeploy.
3. If you have lost the password entirely, generate a new one, set it in Vercel, and redeploy.

---

## Contacts and escalation

- **Developer escalation:** raise an issue at https://github.com/rahulsocialwits/BankAuction/issues with the error text and a screenshot.
- **Vercel support:** https://vercel.com/support
- **Supabase support:** https://supabase.com/support

---

## What your developer must do before any production data operation

Per the project rules, **no migration, mass import, cleanup, backfill, or destructive operation** runs against production without:

1. A written description of what the operation does and why.
2. A rollback plan (how to undo it).
3. Your explicit written approval (a message saying "go ahead").
4. A backup taken immediately before the operation.

This document does not grant that approval. It is a break-glass reference for the owner only.
