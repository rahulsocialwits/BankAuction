# Scheduler (cron / ticks)

There is **no separate worker**. Everything that runs "automatically" is one HTTP-triggered function call named a **tick**.

| Trigger | File | Frequency | Notes |
|---|---|---|---|
| **GitHub Actions** | `.github/workflows/tick.yml` | cron `*/5 * * * *` requested | the intended primary scheduler. GitHub's `schedule` event is **best-effort**: on 2026-10-05/06 only 2 runs happened in ≈ 4 h (they failed because of the route bug fixed in `2feebac`). Do not rely on exact 5-minute spacing |
| **Visitor safety net** | `src/app/api/me/route.ts` → `claimTick()` in `src/lib/pipeline/tick.ts` | any page view may start a tick | starts one **in the background (`after()`)** if no tick ran in the last **35 min**, or in the last **5 min while an "Import all" is active** (a source with `"importAll":true` or the built-in switch). A claim row (`SourceRunLog kind=claim`) stops two visitors from starting two ticks; a claim older than 6 min is considered dead |
| Vercel Cron | `vercel.json` has **no `crons`** entry (the project is on the Hobby plan; commit "Fix Vercel Hobby deployment cron limit") | — | NOT IMPLEMENTED |
| Manual ingest of the built-in crawler | `.github/workflows/ingest.yml` (`workflow_dispatch` only) → `npm run ingest -- <source> <limit>` (`scripts/ingest.ts`) | manual | needs repository secrets `DATABASE_URL`, `DIRECT_URL`, `AI_API_KEY`, `AI_BASE_URL`, `AI_EXTRACTOR_MODEL` |
| Admin buttons | Data Engine (`engine/actions.ts`) | on click | Run / Import all start work with `after()`; they are a convenience, not the scheduler |

## The endpoint: `GET /api/cron/ingest`
File: `src/app/api/cron/ingest/route.ts` — `runtime = "nodejs"`, `maxDuration = 300`, `dynamic = "force-dynamic"`.

* **Auth** (any one): query `?secret=<CRON_SECRET>`, header `x-cron-secret: <CRON_SECRET>`, or `Authorization: Bearer <CRON_SECRET>`.
* **Query**: `limit` (default 100) = page limit for the built-in crawler.
* **Behaviour**: runs `runTick({ limit, via: "HTTP", trigger: "cron" })` **inside the request** and answers only when it is finished.
* **Responses**
  * `200 {"ok":true,"ms":<duration>,"result":{…}}` — the tick completed (result = built-in summary + the list of feeds that ran).
  * `401 {"ok":false,"error":"Unauthorized"}` — wrong/missing secret.
  * `500 {"ok":false,"error":"CRON_SECRET is not set on the server"}` — server mis-configuration.
  * `500 {"ok":false,"ms":…,"error":"<message>"}` — the tick threw (also logged with `console.error("[cron/ingest] tick failed:")` and as a `SourceRunLog` `cron`/`error` row).
  * A platform timeout at 300 s would appear as HTTP 504 (NOT observed).
* History of the earlier bug: before commit `2feebac` the final `return NextResponse.json(...)` had been written **inside a `//` comment** (literal `\n` characters), so the handler returned nothing and Vercel answered **HTTP 500** to every authenticated call.

### Trigger one manually (never paste the secret into chat or commits)
```bash
curl -sS -m 295 -H "x-cron-secret: $CRON_SECRET" "https://auction.bizsocio.com/api/cron/ingest?limit=100"
```
or GitHub → Actions → "Scheduler tick" → "Run workflow". An unauthenticated call (`curl https://auction.bizsocio.com/api/cron/ingest`) must answer `401 {"ok":false,"error":"Unauthorized"}`; that proves the route is alive.

## GitHub Actions workflow (`tick.yml`)
* Name "Scheduler tick"; triggers: `schedule` (`*/5 * * * *`) and `workflow_dispatch`; `concurrency.group: scheduler-tick` (no overlapping runs, no cancel); job `tick` on `ubuntu-latest`, `timeout-minutes: 7`.
* Secret needed: **`CRON_SECRET`** (repository secret; must equal the Vercel env var of the same name). Missing → the job fails with "CRON_SECRET repository secret is missing".
* Step: `curl --max-time 295` to `https://auction.bizsocio.com/api/cron/ingest?limit=100` with header `x-cron-secret`; prints status and the first 3,000 characters of the body; **fails unless HTTP 200 and the body contains `"ok":true`**.
* Debugging a failed run: open the run → step "Trigger tick" → read `HTTP <code>` and the JSON. 401 = secret mismatch; 500 = read the `error` text and the Vercel runtime logs; curl timeout = the tick exceeded 295 s (see budgets below); "secret missing" = add it in Settings → Secrets and variables → Actions.
* Workflow files run from the **default branch** (`main`) — a change only takes effect after it is merged/pushed there.

## What one tick does (`runTick`, `src/lib/pipeline/tick.ts`)
1. `aiWindow()` — currently **always open** (slots are 15-minute marks in IST, `aiSchedule.ts`); `claimAiSlotWork` lets exactly one tick per slot run the slot-wide jobs (location AI + AI review). *The comments in `tick.ts`/UI text still mention the old 00/06/12/18 IST schedule and the admin "Next auto-run" label may still say so — stale text, not logic.*
2. Built-in crawler `runBankAuctionsIngestion`: normal tick ≤ 60 s budget (`limit` pages); if the built-in "Import all" switch is on ≤ 110 s and only unseen pages; the switch turns itself off when nothing is left.
3. `runAllFeeds` (`feeds/run.ts`):
   * **Web scan loop** (≤ 150 s): all active website sources; **sources in the middle of "Import all" first** (BAANKNET before AI-heavy ones), the rest oldest-scanned first; an importing source gets a share of the window (≥ 70 s each, 200 s when alone), others ≤ 60 s. Each call is `runWebDiscovery(id, "schedule", { budgetMs })`. BAANKNET goes to `runBaanknetImport` (resumes its cursor).
   * **Per-source loop**: sources whose last run says "Continues automatically." are resumed on every tick for 24 h; Sheet/CSV sources run at most hourly; AI page sources run once per slot (`aiSlotStart`); sources that did not answer robots.txt are retried every 12 h.
4. `autoCleanExactDuplicates` (hide exact duplicates: same bank + reserve + day).
5. If this tick owns the slot: `enrichLocations(96)` (AI) and `autoReviewPending(100, { useAi: true })`; otherwise rule-based review only (60).
6. Writes one `SourceRunLog` row (`kind=cron`) with the summary; returns `{ ...summary, feeds }`.
Time budget (must stay < 300 s): `runTick` computes `hardEnd = start + 262 s` and passes it to `runAllFeeds`: the web-scan window ends 70 s before `hardEnd` (BAANKNET starts no batch with less than 55 s left, because a batch can overrun by up to ~55 s), no per-source run is started with less than 45 s left (it is deferred to the next tick), per-source reading budgets shrink to what is left, and the AI location/review steps are skipped when less than 60 s remain. Before this guard (commit after `ddd2b7f`) a production tick that ran too long was killed by the platform and left **no** `cron` log row (observed 2026-10-06 06:36 UTC). Observed durations of production ticks: 220 s, 286 s (before the 70 s margin was added), 294 s on 2026-10-06 05:27 UTC — close to the 300 s limit, which is why the guard exists.

## Import All continuation (summary)
Flag `FeedSource.sheetState.web.importAll = true` + saved cursor → every tick resumes the source → when finished the importer sets the flag to false. Details: [BAANKNET.md](BAANKNET.md#3-import-all--from-the-click-to-completion).

## Failure behaviour
| Failure | Result |
|---|---|
| Tick throws | HTTP 500 with the message; `cron` row status `error`; GitHub job fails; nothing is hidden |
| One source fails | its card shows the real message, other sources continue (each runner catches its own errors) |
| Function killed at 300 s | no response; per-source locks expire after 6 min; cursors were saved per batch; the next tick continues |
| GitHub schedule late/skipped | the visitor safety net starts ticks (35 min, or 5 min during an import). With no visitors and no GitHub run nothing runs — add an external pinger (e.g. cron-job.org) as a second trigger (NOT configured in the repository) |
| Wrong/missing `CRON_SECRET` | 401 / 500 as above |

## Phase 3 PR 5: fair budgets, tick lease, second trigger, alert (added 2026-10-08)

**Fair time slices** (`tickPlan.ts`, used by `runAllFeeds`): the scan window is still at most 150 s and ends 70 s before the tick's 262 s hard deadline. Order: sources not scanned for 3 h (or never) first, then sources in the middle of "Import all" (BAANKNET first), then the one waiting longest. Each source gets a weighted share of what is left (importing sources count double, never exclusive): at least 25 s (importing: 70 s, the minimum for a BAANKNET batch), at most 60 s (importing: 200 s). A source that does not fit is deferred and is first in line next tick, so with more sources than one tick can serve, every source is still served within a few ticks. The sheet/CSV/AI-page loop is also ordered oldest-run first.

**Tick lease** (`tickLease.ts`, `acquireTickLease` in `tick.ts`): every trigger takes a lease before running a tick: a `claim` row in `SourceRunLog`. Refused while another claim is younger than 6 minutes, or when the previous tick started less than 3 minutes ago. The earliest simultaneous claim wins (same answer for every claimant). The tick releases the lease when it ends (`claim_done`); a claim from a cut-off run expires after 6 minutes. `/api/cron/ingest` answers `200 {"ok":true,"skipped":true,"reason":...}` when it did not run a tick, so a second pinger is always safe. Visitors use the same lease.

**Alert:** `/api/cron/health` (same secret) answers 200 while a successful tick happened in the last 60 minutes, otherwise 503. The workflow `.github/workflows/scheduler-watchdog.yml` calls it every 15 minutes and fails (GitHub e-mails the failure) on anything but 200. The Engine page uses the same rule (60 minutes, successful ticks only).

### Second trigger and alert (owner setup, about 10 minutes, outside GitHub)
GitHub's schedule is best-effort and can stop on its own, so add an independent pinger (cron-job.org is free):
1. Sign up at cron-job.org and create a cron job. URL: `https://auction.bizsocio.com/api/cron/ingest?limit=100`. Schedule: every 5 minutes. Request timeout: 300 seconds (the maximum, a tick can take that long).
2. Under "Advanced", add the request header `x-cron-secret` with the same value as the `CRON_SECRET` environment variable in Vercel (the same value stored as the GitHub secret `CRON_SECRET`). Do not put the secret in the URL if you can avoid it.
3. Turn on failure notifications for the job (e-mail). A duplicate trigger is harmless: it answers `skipped`.
4. Create a second cron job: URL `https://auction.bizsocio.com/api/cron/health`, every 15 minutes, same header, and enable notifications on failure. It answers 503 when the scheduler has been late for about 60 minutes, so you get an e-mail even if GitHub is down.

