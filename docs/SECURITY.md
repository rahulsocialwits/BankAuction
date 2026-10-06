# Security

## Authentication and authorization
| Area | Implementation | File |
|---|---|---|
| Admin gate | `src/proxy.ts` (Next 16 middleware; matcher `/admin/:path*`) redirects to `/admin/login` without a valid cookie; a normal ADMIN is sent back to `/admin` when opening a master-only path (`canAccessAdminPath`) | `src/proxy.ts`, `lib/auth/adminSession.ts` |
| Admin cookie | `admin_session`, value `expiresAt.role.adminId.signature` signed with HMAC-SHA256 (`ADMIN_SESSION_SECRET`), compared with `timingSafeEqual`; `httpOnly`, `sameSite=lax`, `secure` in production, 12 h; no server-side session store (cannot be revoked individually — rotate the secret to log everyone out) | `adminSession.ts`, `admin/login/actions.ts` |
| Admin credentials | `AdminUser` rows (scrypt hash, `verifyPassword`) or the master password from the env `ADMIN_PASSWORD` (string comparison with the form value) | `lib/auth/password.ts`, `admin/login/actions.ts` |
| Server-side re-check | every master-only server action starts with `requireMaster()` (`lib/auth/adminAuth.ts`) — the proxy alone is not relied on | `admin/(shell)/**/actions.ts` |
| Visitor accounts | `user_session` cookie, HMAC (`USER_SESSION_SECRET` or `ADMIN_SESSION_SECRET`), 30 days; passwords scrypt | `lib/auth/userSession.ts` |
| Scheduler endpoint | shared secret `CRON_SECRET` (header `x-cron-secret`, `?secret=` or Bearer). The comparison is a plain `!==`; a missing server secret returns HTTP 500 (never "open"). Prefer the header over `?secret=` (URLs get logged) | `app/api/cron/ingest/route.ts` |
| Public API | API keys: random key shown once, only its sha256 stored; per-key 120 req/min limit kept **in memory per server instance** (so the effective limit can be higher with several instances) | `lib/apiKeys.ts` |

## Public vs private data
* The public pages and `/api/v1` never expose **officer contact details or document links** in the API; the borrower name is blurred behind "Unlock" on the property page and excluded from the API (`lib/apiShape.ts`). On the property page the borrower is only rendered when present.
* Users' e-mails/hashes, leads and payments are only readable inside the admin (master).
* `robots.ts` disallows `/admin`, `/api/` (except image routes), `/login`, `/register`, `/my-alerts`, `/saved-properties`.
* Uploaded site images/media are stored **in the database** and served by `/api/img/[key]`, `/api/media/[id]` with strict key patterns and `X-Content-Type-Options: nosniff`.

## Secrets
Held only in Vercel environment variables, GitHub repository secrets and the developer's local `.env` files (`.env`, `.env.local` exist locally; `.gitignore` ignores `.env*` and `git ls-files` shows no env file is tracked — verified). Rotate on handover: `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `USER_SESSION_SECRET`, `CRON_SECRET` (+ GitHub secret), `AI_API_KEY`, database passwords, Razorpay keys. See [ENVIRONMENT.md](ENVIRONMENT.md).

## Input validation
* Source URLs: `checkSourceUrl` — https only, valid URL, not on the do-not-fetch list. Fetchers only follow redirects that stay on the same site (`sameSite`), never other hosts.
* The AI-Python-Scrap demo crawler additionally resolves the host and refuses non-public addresses (`assertPublicHost` in `lib/scrapDemo/crawl.ts`) — **SSRF protection exists in the demo crawler**. The production link-source fetchers rely on https-only + same-site checks; a private-IP check there is NOT VERIFIED (only master admins can add sources).
* Import records are normalised and length-limited (`normalizeListing`, `toListings`); amounts parsed defensively; SQL goes through Prisma (parameterised).
* Admin forms are server actions guarded by the admin cookie; CSRF protection is Next.js's built-in server-action origin check (NOT separately tested).

## Crawler ethics and access control (hard rules)
1. `robots.txt` is read before any page or data request (`RobotsGate`, `robotsCheck`, `politeFetch`) and obeyed (wildcards, `$`, longest rule, Crawl-delay). A disallowed address is never requested.
2. Honest user agent `BankAuctionBot/1.0 (+https://auction.bizsocio.com)`. No user-agent rotation, no proxies, no stealth.
3. HTTP **401 / 403, CAPTCHA, login walls and anti-bot pages are never bypassed or retried**; the page/source stops and is reported as such. Only 429/503 get **one** retry after `Retry-After` (max 20 s).
4. `src/data-sources/feeds/blockedHosts.ts` lists hosts that must never be fetched (`auctionbazaar.com`, `bankauction.co`); it is a policy list owned by the project owner — do not edit it without their decision. The message for a match says "Source disabled by project configuration" (it is not a website refusal).
5. Browser rendering only executes the JavaScript of a public page that the plain crawler was already allowed to fetch; data requests made by the page are robots-checked and limited to the same site family; downloads/service workers are blocked.
6. BAANKNET: only the public listing data the site's own pages request; stops on any refusal.
7. Vehicles/movables are never imported; borrower and documents are not exposed through the public API.

## Rate limiting and abuse
* Outbound: ≥ 400 ms between requests (150 ms for baanknet.com, 2 s for bankauctions.in), fixed batch sizes, per-source locks.
* Inbound: only `/api/v1` is rate-limited (in memory). Other public routes have no application-level limiter (Vercel's platform protections apply — NOT VERIFIED).

## Database
Prisma only (no raw SQL found in `src`); two URLs (`DATABASE_URL` pooled, `DIRECT_URL` direct). Restrict Supabase network access/RLS settings: NOT VERIFIED (outside the repo). Binary images are stored in the DB (`Bytes`) — keep upload limits (server actions body limit 4 MB, `next.config.ts`).
