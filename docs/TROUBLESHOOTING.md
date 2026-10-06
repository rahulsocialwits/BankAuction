# Troubleshooting, errors, known issues

## 1. "X is broken" → where to look

| Problem | Check in this order |
|---|---|
| **Properties are not importing** | 1) Data Engine card: state (Live/Paused/Blocked/Disabled by configuration) and the **message** (real error). 2) History row for that source. 3) Is a tick running at all? History → filter "Ticks": the newest "Scheduler tick" row should be < 40 min old (< 10 min during an import). 4) Vercel runtime logs for `[cron/ingest]`, `[crawler]`, `[baanknet]`. 5) The cursor: `SELECT "sheetState" FROM feed_sources WHERE name='…'` (keys `baanknet` / `web`). 6) Counts: `SELECT count(*) FROM auctions WHERE "statusSource"='feed:<name>'` |
| **Scheduler is failing** | GitHub → Actions → "Scheduler tick" → open the red run → step "Trigger tick": `HTTP 401` = `CRON_SECRET` differs between GitHub and Vercel; `HTTP 500` = read the JSON `error` and Vercel logs; "secret missing" = add the repository secret; curl timeout = tick > 295 s. Also confirm the workflow is the one on `main`. Without GitHub, visitors still start ticks (35 min / 5 min while importing) |
| **BAANKNET stopped importing** | source message → `lastError`; `sheetState.baanknet` (`page`, `si`, `done`, `lastError`); does `POST /api/v1/auction/detail/auction-listing` still answer (see [BAANKNET.md](BAANKNET.md))? robots.txt change? Is `importAll` still true (card badge)? Is the source Paused? Run `npx tsx scripts/baanknet-run.ts 30` locally to see the real error |
| **"Importing all…" never changes** | the run was killed before it could save (function limit) or nothing triggers ticks. Press Run once, wait 5 min; the message shows `Running: …` while working. Check the per-source lock rows (`source_run_logs` kind `ai-slot`, status `running`; stale after 6 min) |
| **AI errors (HTTP 401 "Invalid token")** | the AI key's quota is used up or the key is wrong: new key → Vercel `AI_API_KEY` → Redeploy → `/admin/ai` must say "Valid". BAANKNET, Google-Sheet and BankAuctions.in imports do **not** need AI |
| **Source shows "Blocked"** | the **website** refused (robots.txt, HTTP 401/403, CAPTCHA). Not worked around; remove the source or obtain permission/feed |
| **"Source disabled by project configuration"** | our own do-not-fetch list (`feeds/blockedHosts.ts`), not the website |
| **JS-only site returns 0 pages** | message contains "may load its listings with JavaScript" and, if the browser failed, "the JavaScript render fallback failed … <reason>". Run `scripts/diagnose-source.ts <url>`. Rendering costs 10–35 s per page on Vercel Hobby |
| **Site shows wrong/old data** | pages are cached (ISR `revalidate` 120 s / 300 s); `PropertyChange` rows show what changed; check the listing's `Auction` rows (the newest by `createdAt` is "current") |
| **Duplicates** | Admin → Data Engine → Duplicates; `autoCleanExactDuplicates` hides same bank+price+day pairs; `scripts/merge-duplicate-properties.ts` merges |

## 2. Error-handling matrix

| Error | Cause | Detected in | User/admin sees | System does | Manual action? |
|---|---|---|---|---|---|
| HTTP 400/404 from a source page | page gone / wrong URL | `fetchDoc` (`http_404`…) | rejection code in the message | listing skipped; seen-list updated when permanent | no |
| **HTTP 401 / 403** from a website | login / access denied | `fetchWithRetry` → `unauthorized`/`forbidden` | "Website returned HTTP 401/403 …"; source "Blocked" | page/source stops, **no retry, no bypass** | remove source or get permission |
| **CAPTCHA / anti-bot page** | challenge screen | `classifyBody`, browser check | "Automated access requires verification" | stops as refusal | same |
| robots.txt disallow | site rule | `RobotsGate`/`robotsCheck` | "Blocked by robots.txt" (source paused) | request not made | same |
| **HTTP 429 / 503** | rate limit / overload | `fetchWithRetry` | "Rate limited …" / "Temporary service unavailable …" | wait `Retry-After` (≤ 20 s), retry **once**; else temporary error, source stays Live | no |
| timeout / network error | slow or unreachable site | `fetchWithRetry` (`temporary_error`) | "Network error — no answer …" | retried next run; robots-unreachable sources every 12 h | no |
| `render_timeout` / `render_error` | browser slow / cannot start | `RenderingFetcher`, `fetchDoc` | scan note "render fallback failed N time(s) — <reason>" | page skipped, retried next scan (not marked seen) | if "no Chromium": check `next.config.ts` tracing |
| AI HTTP 401/429/5xx | key, quota, provider | `relayModelsClient` | the provider's message in the source card/History | model chain (configured → fallback → deepseek → qwen), backoff; else run fails | fix key/quota |
| AI invalid JSON | model reply | `chatJSONDetailed` | run error | tries next model | no |
| Malformed source (no listing found) | site changed | extractors | "no group of addresses looked like property pages" / `parser_failed` | nothing imported | update parser |
| Database error on a record | constraint / connection | `importRecords` catch | rejection `import_error: …` | half-created property deleted; other records continue | check DB |
| Database unreachable | provider outage | any query | HTTP 500 pages, tick 500 | next tick retries | check Supabase / `DATABASE_URL` |
| Duplicate listing | same property again | `importRecords` | counted "already on the site / updated" | updates or adds an auction round | no |
| Missing image / document | source has none | importer | property without photo (placeholder) / no docs | nothing invented | no |
| Scheduler failure | route throws / killed | `route.ts` / GitHub | red Actions run, `cron` row `error`, HTTP 500 + message | next trigger retries | read the message |
| Vercel function killed (300 s) | too much work in one call | — | message stuck on `Running: …` | cursors persisted per batch; locks expire in 6 min | wait one tick |
| Deployment failure | build error | Vercel | red deployment row, site stays on the previous version | — | fix and push |
| 401/429 on `/api/v1` | missing/invalid key, > 120 req/min | `authenticateApi` | JSON error | — | caller fixes |

## 3. Known issues and technical debt

| # | Issue | Severity | Location | Impact | Recommended fix |
|---|---|---|---|---|---|
| 1 | GitHub `schedule` is unreliable (2 runs in 4 h observed) | High | `.github/workflows/tick.yml` | imports depend on the visitor safety net or manual triggers | add an external pinger (cron-job.org / UptimeRobot) with the `x-cron-secret` header; or upgrade Vercel and use `vercel.json` crons |
| 2 | Visitor safety net only fires when someone visits | Medium | `api/me/route.ts` | quiet night = no ticks if GitHub is late | as above |
| 3 | AI key quota exhausted → AI sources fail | High (operational) | `AI_API_KEY` | list-page AI scans, location/AI review stop | top up / rotate key; monitor `/admin/ai` |
| 4 | PDFs not parsed (`unpdf` not installed) | Medium | `feeds/deepScan.ts` `pdfToText` | PDF-only notices yield no data | `npm install unpdf` |
| 5 | Registry marks `baanknet` as `RESTRICTED` while a dedicated importer is active | Low | `src/data-sources/registry.ts` | confusing; the registry only affects the built-in adapter | update the registry text |
| 6 | Stale wording: `tick.ts` comments and some UI text mention the old 00/06/12/18 IST AI schedule; code (`aiSchedule.ts`) uses always-open 15-minute slots | Low | `pipeline/tick.ts`, Data Engine UI | misleading | update text |
| 7 | `docs/DATA_PIPELINE.md` is outdated (30-minute scheduler, daily Vercel cron) | Low | docs | misleading | replace with this package |
| 8 | Unused dependency `p-limit`; unused env names (Supabase client keys, `AI_EXTRACTOR_PROVIDER`, `NEXT_PUBLIC_SITE_URL`) | Low | `package.json`, `.env.example` | clutter | remove after confirming |
| 9 | `FeedSource.sheetState` is a multi-writer JSON text column | Medium | `siteScan.ts`, `tabular.ts`, `baanknetImport.ts` | a careless writer can drop keys (BAANKNET uses its own top-level key to be safe) | split into proper columns/table |
| 10 | `Auction.statusSource` doubles as a source marker (`feed:<name>`); renaming a source orphans its counters/filters | Medium | `csvImport.ts`, admin filters | wrong "properties on site" counts after rename | add a real `sourceId` column |
| 11 | Fuzzy title matching can merge two units with near-identical titles | Medium | `csvImport.ts` | rare wrong merge | require price/date for all fuzzy matches |
| 12 | Import speed bound by sequential DB queries per record | Medium | `csvImport.ts` | full BAANKNET pass takes many ticks | batch inserts / `createMany`, fewer round trips |
| 13 | Render fallback is slow (10–35 s/page on Hobby) and untested at scale | Medium | `feeds/render.ts`, `scrapDemo/browser.ts` | JS-only sites import ~5–10 pages per run | more CPU (Pro), or use sources' own JSON / feeds |
| 14 | A literal `\n` sits inside a comment in `csvImport.ts` (line ≈ 531, "Missing borrower never blocks publication") | Low | `csvImport.ts` | harmless now, but the same corruption inside `route.ts` removed a `return` and caused HTTP 500 | clean up; grep for stray `\n` in code after bulk edits |
| 15 | The demo module (`lib/scrapDemo`, `/admin/scrap-demo`) shares the browser class used in production | Low | `lib/scrapDemo/browser.ts` | production code imports from a "demo" path | move the renderer to a new shared folder (for example `src/lib/browser/`) |
| 16 | No migrations; schema applied with `db push` | Medium | `prisma/` | no history/rollback of schema | adopt `prisma migrate` |
| 17 | Payments: settings only; checkout/webhooks absent | Info | `lib/payments`, `admin/payments` | no revenue flow | build when needed |
| 18 | Tests cover parsers/HTTP/robots/BAANKNET mapping/renderer; **no DB-backed importer tests** | Medium | `tests/` | `importRecords` regressions only show in production | add a test database harness |
