# Environment variables

Never commit values. `.env` / `.env.local` exist on the developer's machine (read by Next.js and by scripts through `dotenv`); `.env.example` lists the names only.
**The developer's local `.env` points at the PRODUCTION database** at the time of writing — scripts such as `npm run ingest`, `scripts/baanknet-run.ts` and `scripts/scan-site.ts` write to production unless you change it.

Legend — Safe to share: **No** for every secret. "Public" means the value is embedded in browser code (`NEXT_PUBLIC_*`) or is a harmless switch.

| Variable | Purpose | Required? | Where used (code) | Local / Prod | Type | Safe to share? |
|---|---|---|---|---|---|---|
| `DATABASE_URL` | Prisma runtime connection string (pooled Postgres) | **Yes** | `prisma/schema.prisma` `url`, `src/lib/db/prisma.ts` | both | database credential | No |
| `DIRECT_URL` | Prisma direct connection for `db push` / migrations | Yes for schema changes | `prisma/schema.prisma` `directUrl` | both | database credential | No |
| `ADMIN_SESSION_SECRET` | HMAC key that signs the `admin_session` cookie (12 h) | **Yes** (admin login throws without it) | `lib/auth/adminSession.ts` | both | authentication secret | No |
| `USER_SESSION_SECRET` | HMAC key for the visitor `user_session` cookie (30 days). Falls back to `ADMIN_SESSION_SECRET` | optional | `lib/auth/userSession.ts` | both | authentication secret | No |
| `ADMIN_PASSWORD` | the **master admin password** (login form with an empty e-mail) | Yes (unless every admin is an `AdminUser` row) | `app/admin/login/actions.ts` | both | admin credential | No |
| `CRON_SECRET` | authenticates `/api/cron/ingest` (`?secret=`, `x-cron-secret`, or Bearer). Must also be the GitHub Actions secret of the same name | **Yes** for the scheduler | `app/api/cron/ingest/route.ts`; `.github/workflows/tick.yml` | prod + GitHub | cron secret | No |
| `AI_API_KEY` | key of the AI provider "Relay Models" | Yes for any AI step | `lib/ai/aiConfig.ts` (always supplies the key) | prod (local `.env` may hold a non-working key) | AI key | No |
| `AI_BASE_URL` | base URL of the OpenAI-compatible API (`<base>/chat/completions`) | Yes for AI | `lib/ai/aiConfig.ts` | both | config (not secret) but keep private | Avoid |
| `AI_EXTRACTOR_MODEL` | default model name (fallback when `AiSettings.extractorModel` is empty; code default `glm-5.3-cursor`) | optional | `lib/ai/aiConfig.ts` | both | config | Yes |
| `RAZORPAY_KEY_ID` | Razorpay key id (fallback to the id saved in `PaymentSettings`) | optional (payments not live) | `admin/(shell)/payments/actions.ts` | prod | payment key id | No |
| `RAZORPAY_KEY_SECRET` | Razorpay secret (connection test only; no checkout code) | optional | same | prod | payment secret | No |
| `RAZORPAY_WEBHOOK_SECRET` | referenced by the payments screen (no webhook route exists) | optional | `payments/page.tsx` | prod | payment secret | No |
| `RENDER_JS_PAGES` | `0` switches the JavaScript render fallback off (default on) | optional | `feeds/deepScan.ts` | both | switch | Yes |
| `SCRAP_DEMO_CHROME_PATH` | explicit Chromium/Chrome path for the render fallback (local development) | optional | `lib/scrapDemo/browser.ts` | local | path | Yes |
| `NODE_ENV` | set by Next/Vercel; `secure` flag of the admin cookie in production | automatic | `admin/login/actions.ts` | both | system | Yes |
| `GITHUB_ACTIONS`, `GITHUB_EVENT_NAME` | set by GitHub; only label run logs in `scripts/ingest.ts` | automatic | `scripts/ingest.ts` | Actions | system | Yes |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | listed in `.env.example` | **not read anywhere in `src`/`scripts`** — leftover; NOT VERIFIED whether Vercel has them | — | — | URL/public key / **service-role secret** | URL: yes; service role: **No** |
| `AI_EXTRACTOR_PROVIDER`, `NEXT_PUBLIC_SITE_URL` | in `.env.example` only; the site URL is hardcoded as `SITE_URL` in `src/lib/seo.ts` (`https://auction.bizsocio.com`) | not read | — | — | config | Yes |

## GitHub repository secrets
`CRON_SECRET` (needed by `tick.yml`). For the manual `ingest.yml`: `DATABASE_URL`, `DIRECT_URL`, `AI_API_KEY`, `AI_BASE_URL`, `AI_EXTRACTOR_MODEL`.

## Changing a variable
* Vercel: Project → Settings → Environment Variables → edit → **Redeploy** (values are read at build/boot; an existing deployment keeps the old value).
* AI settings can also be overridden in the database (Admin → AI Admin: model, fallback, prompt, rules, max page size); the **key** can only come from the environment.
* After changing `AI_API_KEY`, open `/admin/ai`: it shows "API key: Valid (…)" or the problem text.
