# Admin Settings Guide

Written from the admin pages in `src/app/admin/(shell)/` and the sidebar in `src/components/admin/AdminSidebar.tsx`. Pages marked **Master** are visible only to the master admin (they are also locked on the server with `requireMaster()`). Risk: **Low** = cosmetic, **Medium** = changes what visitors see or what the engine reads, **High** = can change data, money or access.

If something here disagrees with the screen, the screen and the code are right: please fix this file.

| Page | Who | What it is for | Risk |
|---|---|---|---|
| Dashboard | All admins | Totals of properties, leads and recent activity. Read-only. | Low |
| Properties | All admins | List, filter, edit and delete listings. Bulk filter + delete exists for removing wrong source data. Edit page has the **Auction status** select (Postponed / Cancelled stay until the auction date changes). | **High**: delete and status changes are public and cannot be undone from the screen |
| Add Property | All admins | Create one listing by hand. | Medium |
| Blog | All admins | Articles shown under Insights. | Low |
| Locations | All admins | City and area names used in filters. | Medium: a wrong name hides listings from a filter |
| Data Engine (Overview, Link Sources, Bulk Import, Run History, Coverage, Duplicates) | **Master** | Sources, imports, run logs, coverage numbers and duplicate review. | **High** |
| Run Health | **Master** | One read-only page: ticks and gaps, source states (refused / permission unknown / read but nothing found / unchanged), counts, coordinate coverage, AI tokens. | Low |
| Home Page | **Master** | Hero text, tile order, city and property-type pictures, bank logos. | Low |
| Pages (About, Policies, FAQ) | **Master** | The text of the static pages. | Medium: legal pages are public |
| Media Library | **Master** | Uploaded images. | Low |
| Leads | **Master** | Enquiries sent from property pages. Contains personal data. | Medium |
| Registered Users | **Master** | People with an account. **Make Premium** (30 / 90 / 180 days or 1 year) and **Make normal**. A "Requested ..." badge means the user pressed Buy Premium and is waiting. | **High**: gives or removes paid access |
| Payments | **Master** | Razorpay switch, mode, key id, plans and prices, "Test gateway", recent payments. | **High** |
| AI Admin | **Master** | AI on/off, extraction model, fallback model, page size limit, extraction instructions. | **High**: changes cost and what gets extracted |
| API | **Master** | Create and revoke API keys for the public API. | **High** |
| AI Python Scrap (demo) | **Master** | Demo tool. | Medium |
| Admin Team | **Master** | Create and remove admins, set role. | **High** |
| Settings | **Master** | Logos and site icon, home page SEO (title, description, keywords), contact phone and emails. | Medium |

## Settings that need extra care

### Payments (Master)
- **Accepting payments** (switch): off = the pricing page shows "Buy Premium" as a request (no money is taken). On, with a key id and the secret in the environment = "Buy now" opens Razorpay.
- **Mode**: test or live. The key id must match (`rzp_test_...` for test, `rzp_live_...` for live). Use test first.
- **Key id**: the public key, saved here. The **secret** (`RAZORPAY_KEY_SECRET`) and the webhook secret (`RAZORPAY_WEBHOOK_SECRET`) live only in the environment (Vercel) and are never shown.
- **Plans**: name, price in rupees, days, note. The server charges the saved price, never a price sent by the browser.
- Verify: press **Test gateway**; make one test purchase; check the user's account shows Premium.
- Recover: switch Accepting payments off. A user wrongly made Premium: Registered Users → Make normal (nothing is deleted).

### Registered Users: Make Premium / Make normal (Master)
- Writes a row in the payments table (provider "admin"). Premium ends by date, or by "Make normal" (a "revoked" row), or by a refund.
- Verify: the user's My account page shows Premium and the date.

### AI Admin (Master)
- Cost control also exists in the environment: `AI_DAILY_TOKEN_CAP` (tokens per rolling 24 h; unset = no cap). At the cap, AI calls stop with a clear message; importing without AI continues. Run Health shows use against the cap.
- Recover: raise or remove the cap in Vercel and redeploy.

### Data Engine sources (Master)
- A source marked **Refused** means the website's robots.txt or an access rule said no. It is not retried and not worked around: use an official feed or the manual Bulk Import.
- **Permission unknown** (robots.txt timeout) is not a block; it is tried again.
- **Read, found nothing** usually means the site loads its list with JavaScript: change the source URL or use Bulk Import.
- BAANKNET: scope is recorded in `src/data-sources/registry.ts`. Do not widen it without the owner's written decision.

## Environment variables (names only)
`DATABASE_URL`, `DIRECT_URL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `USER_SESSION_SECRET`, `CRON_SECRET`, `AI_API_KEY`, `AI_BASE_URL`, `AI_EXTRACTOR_MODEL`, `AI_EXTRACTOR_PROVIDER`, `AI_DAILY_TOKEN_CAP` (optional), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_MAP_TILE_URL` (optional), `PIN_GEOCODE` (set to `off` to stop PIN lookups), `RENDER_JS_PAGES`. Values are never stored in this repository. See `docs/ENVIRONMENT.md`.

## Not yet built (do not assume it exists)
- A full admin **audit log** of every change. Today only some changes are recorded (property changes, payment rows). A complete log needs a database table (a schema change that the owner must approve).
- Analytics.
