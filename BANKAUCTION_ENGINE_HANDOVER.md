# BANKAUCTION_ENGINE_HANDOVER

Master engineering handover for the BankAuction.co auction data engine.
Written 2026-10-08 (first session; the "Phase 2 final hardening" section below supersedes sections marked FIXED) from `rahulsocialwits/BankAuction` (`main` = `f9ff8a5`, `phase2-data-acquisition-foundation` = `d5d1c4d`).

**Evidence tags used throughout.** **[V] verified** = read in code or executed in this session. **[I] inferred** = follows from code but not executed or not observed in production. **[U] unknown** = could not be established (usually needs the production database or a working Prisma client).

**How to read this with the existing docs.** `docs/PROJECT-HANDOVER.md` and the 12 files beside it (written 2026-10-06) already describe the website, database, scheduler, deployment and environment in depth. This document does not duplicate them. It adds what they lack: the engine-level view, the Phase 2 verification result, the risks found, and the playbooks. Where this file and `docs/DATA_PIPELINE.md` disagree, this file and the code win.

---

## Phase 2 final hardening (second session, 2026-10-08): READ THIS FIRST

Branch `phase2-final-hardening` (local commit on top of `phase2-data-acquisition-foundation` `d5d1c4d`; delivered as a patch because this session has no push access). Scope: only the verified Phase 2 problems. No source onboarding, no scheduler/UI/SEO/payment changes, no production command run (the fresh clone has no `.env`, so nothing could reach any database).

### What was fixed
| # | Problem | Fix | Where | Status |
|---|---|---|---|---|
| P0-1 | TS2367 at `completeness.ts:167` would likely break `next build` | removed the dead condition (`evaluationEligible === false` already returned earlier); nothing suppressed, `next.config.ts` untouched | `src/lib/pipeline/completeness.ts` | **FIXED, verified** (module type-checks clean in isolation; full-project `tsc` error list shrank 173 → 170, none added) |
| P0-2 | Healthy BAANKNET run (2,000 records / 40 pages) scored CRITICAL "pages dropped 98%": pages were compared with the record median | record and page baselines are now built from their own history (`pageMedian7d`, `pageMin7d/Max7d`, sample counts); result reports `recordHealth`, `pageHealth` and the overall status (worst of both); page check is skipped when there are fewer than 2 page samples, when the collector sets `pageCountComparable:false`, or when the source's own 7-day page counts vary by more than 2x | `completeness.ts` | **FIXED, verified** (old module returns CRITICAL for the scenario, new module HEALTHY, same input) |
| P0-3 | `protectExistingData` was computed but never read | stored in every run record; read back by `getSourceProtection` (`runLog.ts`); pure decision logic in `sourceProtection.ts`; **both automatic paths that hide an existing listing because of what a source returned now go through `removeListingFromSource` (`sourceRemoval.ts`)**: `thinFix.ts` (admin "fix thin listings") and the deep-scan notice removal in `csvImport.ts`. Fails closed if history cannot be read. | see above | **FIXED at the logic and wiring level, verified by tests** (the Prisma-backed wrapper itself could not execute here) |
| P0-4 | BAANKNET authorization | documented, not changed in behaviour: `registry.ts` now carries `authorization: "UNKNOWN_REQUIRES_BUSINESS_CONFIRMATION"` and a corrected note (the old "not built" wording was wrong), a compliance banner in `baanknetImport.ts` and in `docs/BAANKNET.md`; a test forbids marking any source CONFIRMED without evidence text | `registry.ts`, `baanknetImport.ts`, `tests/sourceCompliance.test.ts` | **DOCUMENTED. No evidence of consent exists in the repository.** |
| extra | BankAuctions.in: the last tick of an Import-all pass reports only its leftover page count, which the old logic would have scored CRITICAL on every complete pass | `pageCountComparable:false` in the adapter metrics; the record check (sitemap size) still applies | `bankauctions/adapter.ts` | FIXED, tested |
| extra | The JSON header of a run record could be cut mid-way by the 2,000-character column limit (killing that run's history) | header is always kept intact; only the human text is truncated; very long `error` strings are capped | `completeness.ts` `formatMetricsMessage` | FIXED, tested |

### The real answer to "where could an anomalous run remove valid records?"
Traced through every writer of `Property.status` and `Auction.status`. **There is no disappearance-based expiry, deletion or hiding anywhere in the code** (nothing reads `lastSeenAt` for visibility; a listing is visible iff `Property.status = PUBLISHED`; auction `COMPLETED` comes only from dates). So a 2,000 → 400 collapse could not remove records before this change either. Two paths hide existing listings from what a source returns *now* (thin-listing fix, notice removal); those were the only ones an anomalous run could plausibly affect, and they are now gated. Other automatic status writers were reviewed and deliberately **not** gated because they are not source-disappearance driven: exact-duplicate hiding (`duplicates.ts`), auto-review of pending (never-published) listings (`review.ts`), admin actions, and date-derived auction status (`deriveAuctionStatusFromDates`, which has no dependency on the protection modules and is covered by a test).
Two policies exist in `sourceProtection.ts`: `allowsAutomaticRemoval` (blocks only when the latest evaluated run is anomalous, so nothing changes for sources without a verdict) and the stricter `allowsDisappearanceAction` (needs a positive HEALTHY verdict). **Any future "this listing is no longer on the source" action must go through the second one.** Incremental runs (verdict RECOVERING) are skipped when finding the latest verdict, so they neither trigger nor clear protection.

### Tests (what actually ran)
Environment limit: `prisma generate` cannot download its engine (HTTP 403 from `binaries.prisma.sh`, also with `--no-engine`), so no Prisma client exists in this sandbox.
| File | Result |
|---|---|
| `completeness.test.ts` (17 original + 12 new) | **PASS 29/29** |
| `sourceProtection.test.ts` (new) | **PASS 14/14** |
| `sourceCompliance.test.ts` (new) | **PASS 2/2** |
| `httpStatus.test.ts` | **PASS 15/15** |
| `robotsRules.test.ts` | **PASS 11/11** |
| `sourceClassification.test.ts` | **PASS 10/10** |
| `baanknet.test.ts` (4), `baanknetEmbedded.test.ts` (1), `renderedParser.test.ts` (9), `renderer.test.ts` (7) | **BLOCKED BY ENVIRONMENT** (21 tests, `Cannot find module '.prisma/client/default'`) |
Totals: 81 pass, 0 genuine failures, 21 tests unable to load. `npx tsc --noEmit`: **BLOCKED BY ENVIRONMENT** for a clean full-project result (170 errors remain, all in the set that existed before and all downstream of the missing generated types; none introduced). `next build`: **BLOCKED BY ENVIRONMENT** ("Can't resolve .prisma/client/index-browser"). ESLint on the changed files: 2 findings, both pre-existing and untouched (`adapter.ts` unused `existingProperty`; `csvImport.ts` `held` should be `const`).
**Test-coverage honesty:** there is still no test that executes `removeListingFromSource` against a real database; the write-layer tests exercise the exact gate (`removeListingIfSourceTrusted`) it calls, using the real evaluate → format → parse → protection chain and an in-memory store, plus a structural test that fails if `thinFix.ts` or `csvImport.ts` write `status: "REMOVED"` directly again.

### Remaining P1 issues
1. **BankAuctions.in baseline (decision made, not implemented).** Option A (judge only full passes, current) is correct but starves the baseline; option B (a separate incremental health metric) would not detect inventory loss; **recommended: option C**, report the sitemap size (`discoveredCount`, already computed every tick) as a full-inventory observation on every run, with page counts left non-comparable. This is more than a hardening change because the baseline query takes only the 60 newest rows (`runLog.ts`), and BankAuctions logs a row every 5 minutes, so the window would cover about 5 hours and a slow decline would never register. Needs a downsampled/daily baseline first. Also unverified and worth checking: WordPress core splits sitemaps at 2,000 URLs, and the adapter reads only `/wp-sitemap-auctions-1.xml`; if the site has more than 2,000 listings the rest are never discovered (not verified, needs a live check of `-2.xml`).
2. **Baseline drift on a persistent anomaly.** Anomalous runs still feed the median. If a source stays collapsed long enough (roughly half of the 7-day samples), the collapse becomes the new normal and protection lifts by itself. Fix: exclude non-HEALTHY runs from baselines, with an explicit admin "accept new baseline" action for genuine shrinkage.
3. **`AuctionEvent` has no writer.** No minimal safe fix was required by the Phase 2 changes, so it is left for the lifecycle phase.
4. **POSTPONED / CANCELLED are never set from source data.** Left for the lifecycle phase; no Phase 2 regression depends on it.
5. **BAANKNET refused-at-start run logs no metrics** (`baanknetImport.ts` ~l.119 logs status `blocked` without `metrics`), so that case does not set protection.
6. Generic link-source runs are always evaluation-eligible with `inventoryCount = created + skipped + failed`; expect noisy WARNING/INCOMPLETE verdicts on AI page scans (only blocks the two gated removals, never normal lifecycle).
7. Pre-existing lint findings (see above); `autoCleanExactDuplicates` 0.4 Jaccard rule (section 15) unchanged.

### BAANKNET compliance status
**BAANKNET ACCESS AUTHORIZATION: UNKNOWN / REQUIRES BUSINESS CONFIRMATION.** The only mention of PSB Alliance or consent in the repository is the restriction note itself. No evidence of written permission was found in code, docs, workflows or commit messages. The importer does not bypass access controls (robots.txt honoured; 401/403/CAPTCHA stop it), was not modified in behaviour, and must not be expanded or described as legally cleared until the owner confirms and records the authorization in `registry.ts`.

### Merge decision
**SAFE TO MERGE** (updated 2026-10-08). Commit `842dfef` passed the Vercel build with Prisma generation, full TypeScript checking and `next build` (29 pages). 81 non-Prisma tests pass locally. 21 tests in 4 Prisma-dependent files (`baanknet`, `baanknetEmbedded`, `renderedParser`, `renderer`) have not been executed in any environment yet: this is a verification gap, not a known failure. Run `npm ci && npm test` once where Prisma generates to close it. BAANKNET authorization remains UNKNOWN and needs separate business/compliance confirmation before any expansion of BAANKNET ingestion.

---

## 0. Verification report (read this first)

### A. Executive summary
- The engine is a working incremental pipeline (BankAuctions.in crawler + BAANKNET importer + generic link sources, one scheduler tick every 5 minutes). The architecture is sound and should not be rewritten.
- **Phase 2 is not merged.** It lives on `phase2-data-acquisition-foundation`, 11 commits ahead of `main`, 0 behind [V].
- **Phase 2 is not production-safe yet.** Its 17 unit tests pass, and the 10/30/60% thresholds behave exactly as specified. But three real defects were found (section D) and its central promise, "protect existing data", is not connected to anything.
- **No data-destroying path from source disappearance exists today** [V]: nothing in the code expires, hides or deletes a listing because a source returned less. That is good news for safety and bad news for completeness: the protection flag has nothing to protect yet, and any future "expire stale listings" job must be built to honour it.
- **A legal/compliance question needs the owner's decision before more BAANKNET work** (D4).

### B. Current technical state
| Item | State |
|---|---|
| `main` | `f9ff8a5` "docs: complete handover manual as one Word file"; 205 commits visible in the clone history [V] |
| Phase 2 branch | `d5d1c4d`, 7 files, +570 / −9 lines vs `main` [V] |
| Production | https://auction.bizsocio.com on Vercel region `bom1`, auto-deploy from `main` (per docs) [I] |
| Production DB / counts | Not accessible from this session [U] |
| `.env` warning | Per `docs/ENVIRONMENT.md` the developer's local `.env` points at the **production** database. `npm run ingest`, `scripts/baanknet-run.ts`, `scripts/scan-site.ts` write to production. |

### C. Phase 2 verification result
| Required check (brief §25) | Result |
|---|---|
| 2,000 → 400 scenario | **Verified by execution**: CRITICAL, `protectExistingData=true`, "dropped by 80%" |
| 10 / 30 / 60 % thresholds | **Verified by execution** (baseline 2,000): 1,850 → HEALTHY; 1,799 → WARNING; 1,400 / 1,399 → INCOMPLETE; 800 / 799 → CRITICAL |
| Zero inventory | **Verified**: 2,000 → 0 is CRITICAL; first run with 0 is NO_DATA with protect=true |
| Pagination failure | **Verified** (unit test 6): INCOMPLETE, protect=true |
| Baseline handling | **Verified** (tests 7, 14): first comparable run is RECOVERING, not falsely HEALTHY. See D5 for how rarely BankAuctions.in builds a baseline |
| Recovery | **Verified** (test 17) |
| Blocked sources | **Verified**: BLOCKED, protect=true |
| Structure change | **Verified** (test 12): CRITICAL, protect=true |
| Incremental BankAuctions.in behaviour | **Verified** (test 8 and adapter diff): `evaluationEligible=false` → RECOVERING, no verdict |
| Data protection (flag actually prevents anything) | **FAILED / not wired**: see D2 |
| No unintended expiry/deletion | **Verified for ingestion paths**: no sweeper exists. See section 17 |

### D. Critical issues found
1. **[FIXED in final hardening] Type error will likely break `next build` [I].** `src/lib/pipeline/completeness.ts:167` compares `metrics.evaluationEligible !== false` after an earlier `=== false` early return (line 136), so TypeScript reports TS2367 ("no overlap"). That file imports nothing from Prisma, so the error is real, not a sandbox artifact [V]. `next.config.ts` does not set `ignoreBuildErrors`, so Next's build type-check should fail [I, `next build` was not run]. Unit tests did not catch it because `tsx` does not type-check.
2. **[FIXED at logic/wiring level in final hardening] `protectExistingData` is advisory only [V].** It is computed in `evaluateCompleteness`, asserted in tests, and then never read by any non-test code (`grep` of `src/` and `tests/`). `formatMetricsMessage` stores `dataStatus`, score, reason and baseline in the run-log message, but not the flag. Today nothing consumes the verdict except the admin history badge.
3. **[FIXED in final hardening] False CRITICAL for healthy BAANKNET runs [V, executed].** `evaluateCompleteness` computes `pageReference = baseline.median7d` (line 152), which is the median of **record counts**, and compares it with `pagesFetched`. BAANKNET reads 50 records per page. A healthy run of 2,000 records over 40 pages against a 2,000-record baseline reports "Fetched pages dropped by 98%" and CRITICAL with protect=true. BankAuctions.in (one page per record) happens to pass only because pages ≈ records. The unit test for page collapse (test 9) does not use a realistic pages-versus-records ratio, which is why it missed this.
4. **[DOCUMENTED in final hardening; still needs the owner] BAANKNET permission conflict [V code, U facts].** `src/data-sources/registry.ts` marks `baanknet` as `RESTRICTED` with the note: Terms prohibit copying content without written consent from PSB Alliance, "Not built, and blocked in link sources, unless written permission is obtained." Yet `src/data-sources/feeds/baanknetImport.ts` exists, calls BAANKNET's own listing API (`POST /api/v1/auction/detail/auction-listing`) and is the largest source. I found no record of written consent in `docs/BAANKNET.md`, `docs/SECURITY.md` or `docs/HANDOVER-CHECKLIST.md`. The registry note is stale or the consent exists outside the repo. **This is a business/legal decision for the owner. Do not onboard more BAANKNET-dependent features until it is settled and recorded.**
5. **Completeness is nearly dormant for BankAuctions.in [V].** The adapter marks a run evaluation-eligible only when `opts.all` is set and nothing remains (`adapter.ts` metrics block). Routine ticks (limit 100, 60 s budget) are all RECOVERING. A baseline only accrues from complete "Import all" passes, which are manual. Until that changes, the engine cannot detect a BankAuctions.in drop.
6. **Generic feeds are always eligible [I].** `run.ts` sets `evaluationEligible: true` and `inventoryCount = created + skipped + failed` for every run. For AI page scans, counts vary naturally, so false WARNING/INCOMPLETE alarms are likely.
7. **`AuctionEvent` has no writer [V].** The model exists in `prisma/schema.prisma` but nothing under `src/`, `scripts/` or `tests/` references it. Lifecycle history (postponed, cancelled, completed) is therefore not recorded.
8. **Four test files could not run in this session [V]**, for an environment reason only: see F.

### E. Files changed during this session
- **No tracked file in the repository was modified.**
- Created: this file (`BANKAUCTION_ENGINE_HANDOVER.md`, untracked, repo root of the `main` checkout, not committed, not pushed).
- Local only: a git worktree `/home/claude/phase2-wt` on a local branch `phase2-verify` (identical to the Phase 2 branch, no commits), plus `node_modules` there and a scratch script outside the repo. This session has read-only access to the repo and cannot push.

### F. Tests actually executed
Run: `npm test` on `phase2-verify` (= `d5d1c4d`) after `npm ci --ignore-scripts`. Prisma's postinstall `prisma generate` could not run: the sandbox's network allowlist returned **403 for `binaries.prisma.sh`**, so no Prisma client was generated.

| Test file | Tests | Result |
|---|---|---|
| `completeness.test.ts` | 17 | **17 pass** |
| `httpStatus.test.ts` | 15 | **15 pass** |
| `robotsRules.test.ts` | 11 | **11 pass** |
| `sourceClassification.test.ts` | 10 | **10 pass** |
| `baanknet.test.ts` | 4 | did not run: `Cannot find module '.prisma/client/default'` |
| `baanknetEmbedded.test.ts` | 1 | did not run (same cause) |
| `renderedParser.test.ts` | 9 | did not run (same cause) |
| `renderer.test.ts` | 7 | did not run (same cause) |

Runner summary: 57 reported, 53 pass, 4 fail (the 4 failures are the 4 files that could not load). **Those 21 tests are unverified, not failing code.** Additionally, `npx tsc --noEmit` reported 173 errors without a Prisma client; only `completeness.ts:167` was confirmed independent of Prisma. The rest are expected consequences of missing generated types [I]. Also executed: a scratch script driving `evaluateCompleteness` with realistic numbers (source of the threshold table in C and defect D3).

### G. Handover document path
`/BANKAUCTION_ENGINE_HANDOVER.md` (repository root of the `main` checkout). Commit it on whichever branch Phase 2 is finally merged into.

### H. Recommended next engineering phase
**Phase 2.1: make Phase 2 mergeable and real**, before any source onboarding:
1. Fix D1 (remove the redundant condition) and D3 (baseline pages separately from records; add a regression test with the 2,000-records / 40-pages shape).
2. Persist and expose the protection verdict (a single helper "is this source currently protected?") and define the invariant that any future expiry/hide/removal job must call it.
3. Make BankAuctions.in produce an eligible full-inventory observation on a cadence (D5), for example a sitemap-count check that does not require re-reading every page.
4. Run the full suite, `tsc --noEmit` and `next build` in an environment that can download Prisma engines (a GitHub Actions job or a local machine), then merge.
5. Resolve D4 with the owner and record the outcome in `registry.ts` and `docs/SECURITY.md`.

### I. Exact first task for Claude Code after handover
In an environment with network access to `binaries.prisma.sh`, check out `phase2-data-acquisition-foundation`, run `npm ci`, `npx tsc --noEmit`, `npm test` and `npx next build` to get the real baseline, then fix D1 and D3 in `src/lib/pipeline/completeness.ts` with a new failing-first test in `tests/completeness.test.ts` (healthy 2,000 records over 40 pages must be HEALTHY; a collapse from 40 to 8 pages must be CRITICAL). Do not touch ingestion adapters in that change.

---

## 1. Project purpose
BankAuction.co is an India-wide auction property intelligence platform. It discovers legitimate auction properties from banks, NBFCs/HFCs, ARCs, DRT and liquidation sources, normalises them into one database, removes duplicates, detects changes and publishes trustworthy current inventory. Live: `https://auction.bizsocio.com`.

## 2. Business objective
Maximum **current, valid, fresh** auction data. North-star metric: how many currently valid, actionable auction properties can be discovered and published today. Ordered priorities: coverage → completeness → freshness → accuracy → provenance → deduplication. Explicitly not now: see section 41. FindAuction.in is a benchmark only; never a source (section 31).

## 3. Current architecture
Next.js 16.3.6 / React 19.2.8 / TypeScript strict / Prisma ^6.19.3 / PostgreSQL (Supabase) / Tailwind 4 / Vercel `bom1` / GitHub Actions scheduler [V from `package.json`, docs]. **`AGENTS.md` warns that this Next.js has breaking changes; read `node_modules/next/dist/docs/` before writing Next code** [V].

```
GitHub Actions (every 5 min) ──► GET /api/cron/ingest  (src/app/api/cron/ingest/route.ts)
Visitor safety net (/api/me → claimTick) ──┘            │
                                                        ▼
                                         runTick  (src/lib/pipeline/tick.ts, hard end 262 s)
        ┌───────────────────┬────────────────────┬──────────────┬────────────────┐
        ▼                   ▼                    ▼              ▼                ▼
 BankAuctions.in      runAllFeeds           autoCleanExact   enrichLocations   autoReviewPending
 (adapter.ts)     (feeds/run.ts: BAANKNET,   Duplicates       (AI slots only)   (rules each tick,
                   link sources, CSV/Sheet,  (hides, never                      AI in slot)
                   AI page scans)            deletes)
        └──────────────► importRecords (src/lib/import/csvImport.ts) ──► Property / Auction / Documents / Media
                                                        │
                                                        ▼
                              logRun (src/lib/pipeline/runLog.ts) ──► SourceRunLog  [Phase 2: metrics + verdict]
```

The intended long-term flow (Source → Discovery → Fetch → Parse → Extract → Normalize → Validate → Deduplicate → Change Detection → Auction/Property Resolution → Documents/Media → Completeness → Provenance → Publish) exists today in partial form: discovery/fetch/parse/normalise/dedup/publish are real; completeness is Phase 2 (unmerged); provenance is source-level only.

## 4. Repository structure
| Path | Purpose |
|---|---|
| `src/app/(site)/` | public site (pages, property detail, search) |
| `src/app/admin/(shell)/` | admin console; `engine/` = Data Engine (`page.tsx`, `history/page.tsx`, `duplicates/`, `actions.ts`) |
| `src/app/api/` | `cron/ingest`, `me`, `v1` (public read API), `media`, `places`, `localities`, `img` |
| `src/data-sources/` | `registry.ts`, `bankauctions/` (adapter, extract, normalize), `feeds/` (baanknetImport, run, deepScan, siteScan, webScan, render, renderedParser, robotsGate, blockedHosts, sheets) |
| `src/lib/pipeline/` | `tick.ts`, `runLog.ts`, `completeness.ts` (Phase 2), `duplicates.ts`, `review.ts`, `thinFix.ts`, `geo.ts`, `aiSchedule.ts`, `locations.ts` |
| `src/lib/import/` | `csvImport.ts` (central writer, 613 lines), `tabular.ts`, `normalize.ts`, `richRaw.ts` |
| `src/lib/domain/`, `normalization/`, `validation/`, `deduplication/` | `deriveAuctionStatus.ts`, `parsers.ts`, `classifyPropertyType.ts`, `validateAuctionRecord.ts`, `aiDuplicateCheck.ts` |
| `src/lib/fetch/` | `httpStatus.ts` (status classification), `robotsRules.ts`, `politeFetch.ts` |
| `prisma/schema.prisma` | all models |
| `scripts/` | `ingest.ts`, `baanknet-run.ts`, `diagnose-source.ts`, `scan-site.ts`, `render-one.ts`, `merge-duplicate-properties.ts`, `seed-localities.ts` |
| `tests/` | 8 `node:test` files run through `tsx` (`npm test`); `tests/fixtures/baanknet-detail.txt` |
| `.github/workflows/` | `tick.yml` (scheduler), `ingest.yml` (manual) |
| `docs/` | 13-file handover package + `BankAuction-Handover-Manual.docx` + older `DATA_PIPELINE.md` |

## 5. Important files
| File | Purpose | Key symbols | Limits |
|---|---|---|---|
| `src/lib/pipeline/tick.ts` | one scheduler tick | `runTick`, `claimTick` | tick can run close to the 300 s platform limit (observed 220–294 s per docs) |
| `src/lib/import/csvImport.ts` | single writer for properties/auctions/docs/media | `importRecords`, `enrichExisting`, re-auction round logic (~l.327–360) | large; many responsibilities; the only deletions are in a failure-cleanup block (l.605–608) |
| `src/data-sources/bankauctions/adapter.ts` | BankAuctions.in collector | `runBankAuctionsIngestion`, `discoverListingUrls`, `pickUrls`, `ingestOnePage`, `upsertSourceRecord`, `logFieldChanges` | completeness metrics only eligible on full "Import all" |
| `src/data-sources/feeds/baanknetImport.ts` | BAANKNET importer | `runBaanknetImport`, cursor in `FeedSource.sheetState`, id `src:baanknet.com:<id>` | see D4 |
| `src/data-sources/feeds/run.ts` | runs all link sources | `runFeedSource`, `runAllFeeds`, `isAiFeed` | AI scans gated to IST slots |
| `src/lib/pipeline/completeness.ts` | Phase 2 engine (pure, no I/O) | `buildSourceBaseline`, `evaluateCompleteness`, `formatMetricsMessage`, `parseMetricsMessage` | D1, D2, D3 |
| `src/lib/pipeline/runLog.ts` | run log writer | `logRun`, `dataHealthFromRunMessage` | metrics stored inside the `message` text column (`[DATA_ENGINE_V1] {json}\n…`, truncated to 2,000 chars) |
| `src/lib/domain/deriveAuctionStatus.ts` | date-derived status | `deriveAuctionStatusFromDates` | dates only; no source-provided status |
| `src/data-sources/registry.ts` | access posture per candidate source | `SOURCE_REGISTRY`, `getSourceDefinition` | D4 |
| `src/data-sources/feeds/blockedHosts.ts` | do-not-fetch list | `BLOCKED_HOSTS`, `checkSourceUrl` | owner-controlled policy list |

## 6. Database / domain model
Full table-by-table detail: `docs/DATABASE.md`. Engine-relevant models in `prisma/schema.prisma` [V]:
- **Property** (`PropertyStatus`: DRAFT, PENDING_REVIEW, PUBLISHED, DUPLICATE, EXPIRED, REMOVED) and **Auction** (`AuctionStatus`: UPCOMING, LIVE, AUCTION_TODAY, COMPLETED, POSTPONED, CANCELLED, EXPIRED). Property 1 → N Auction. Preserve this separation.
- **Auction** carries `externalAuctionId` (dedup priority 1), `noticeNumber` (priority 2), reserve/EMD/increment, start/end/application/inspection dates, `statusSource`.
- **Source** / **SourceRecord**: one raw record per `[sourceId, sourceUrl]` (unique), with `contentHash`, `etag`, `rawData`, `extractionMethod`, `extractionConfidence`, `firstSeenAt/lastSeenAt/lastCheckedAt`, links to property/auction.
- **PropertyChange**: field-level log (`field`, `oldValue`, `newValue`, `sourceRecordId`). **AuctionEvent**: lifecycle log, **no writer** (D7).
- **Document / PropertyDocument / SourceDocument**, **Media / PropertyMedia / SourceMedia**.
- **FeedSource** (link sources + cursor state in `sheetState`), **SourceRunLog** (one row per run; Phase 2 metrics ride in `message`).

## 7. Ingestion pipeline
1. Tick starts (`runTick`), claims AI slot work if inside an IST slot (00/06/12/18 h + ~50 min).
2. BankAuctions.in: `runBankAuctionsIngestion` (limit 100, 60 s; or "Import all", 110 s).
3. `runAllFeeds`: BAANKNET first when mid-import, then link sources, each time-boxed by `hardEnd`.
4. `autoCleanExactDuplicates` → hides exact duplicates.
5. `enrichLocations`, `autoReviewPending`.
6. `logRun` for the tick; every source also logs its own run (with Phase 2 metrics on the Phase 2 branch).

## 8. BankAuctions.in architecture
`adapter.ts`: sitemap `/wp-sitemap-auctions-1.xml` → `discoverListingUrls` → `pickUrls` (oldest/unseen first; `onlyNew` for Import all) → `politeFetch` → `ingestOnePage` (extract → normalise → validate → upsert Property/Auction/SourceRecord/Document, change logging via `logFieldChanges`). Registry: ALLOWED (robots disallows only WordPress internals). A pause switch exists (`Source.status = DISABLED`). Do not replace with AI ingestion.

## 9. BAANKNET architecture
`baanknetImport.ts`: resumable importer reading `auction-listing` pages (50 per page, 3 parallel, 250 ms pause) for statuses `upcoming` then `live`; cursor saved **after** each imported page so a cut-off tick resumes; records matched by `src:baanknet.com:<id>` so re-reads update; 401/403/CAPTCHA stop and are never bypassed; a finished pass repeats every 6 h. Detail: `docs/BAANKNET.md`. **Subject to D4.** Reconciliation with official bank sites does not exist yet.

## 10. Generic ingestion architecture
`feeds/run.ts`, `siteScan.ts`, `webScan.ts`, `deepScan.ts`, `render.ts` (headless Chromium via `@sparticuz/chromium`), `renderedParser.ts`, `sheets.ts`; AI extraction in `src/lib/ai/` gated by `aiSchedule.ts`. Handles HTML, JS-rendered pages, CSV/Google Sheets, PDFs. Fallback tool, not the long-term trust mechanism for critical fields.

## 11. Source registry
Two lists, both owner-controlled: `SOURCE_REGISTRY` (access posture) and `BLOCKED_HOSTS` (hard refusal). Production `FeedSource` rows (the actual list of link sources) are in the database [U].

## 12. Completeness engine (Phase 2, unmerged)
Pure functions in `completeness.ts`. Statuses: HEALTHY, WARNING, INCOMPLETE, CRITICAL, BLOCKED, FAILED, NO_DATA, RECOVERING. Order of evaluation [V]: not eligible → RECOVERING; blocked → BLOCKED; structure change → CRITICAL; failed with no count → FAILED; pagination incomplete → INCOMPLETE; zero vs baseline → CRITICAL; no count → RECOVERING; no baseline → RECOVERING/NO_DATA; page drop ≥60% → CRITICAL; count drop ≥60% CRITICAL, ≥30% INCOMPLETE, ≥10% WARNING; rejection ≥30% of count → WARNING; else HEALTHY. Reference for count drop = 7-day median, else 30-day median, else previous run. `logRun` loads up to 60 runs of the last 30 days for that source name, builds the baseline **before** inserting the current run, and writes the verdict into the message. Source-specific baselines [V]; no global baseline. Defects: D1, D2, D3, D5, D6.

## 13. Freshness system
Per source: `Source.lastSuccessfulSync/lastAttemptedSync`, `SourceRecord.lastSeenAt/lastCheckedAt`, `FeedSource.lastRunAt`, BAANKNET 6-hour refresh. There is **no freshness SLA, no per-source "last verified" shown to visitors, no stale-listing detector** [V by absence]. The north-star questions in brief §2 are not answerable from the database today.

## 14. Change detection
`logFieldChanges` (`adapter.ts` ~l.557) writes `PropertyChange` rows for BankAuctions.in [V]. `csvImport.ts` writes `PropertyChange` for `re_auction`, `needs_enrichment`, `deep_scan`. I did not find field-level diffs (reserve, EMD, dates) in the generic/BAANKNET `importRecords` path [U, not exhaustively traced]. `AuctionEvent` unused (D7).

## 15. Deduplication
Identity priority implemented in `csvImport.ts`: source-qualified id `src:<host>:<id>` updates the same listing; `externalAuctionId`/`noticeNumber` checks (l.214, l.329); reserve-price + bank + title near-match for possible matches (l.536). Pipeline cleanup `autoCleanExactDuplicates` (`duplicates.ts`) runs every tick: exact = same bank + normalised title + same reserve price; second pass = same bank + same reserve price + title Jaccard ≥ 0.4. It **hides** (`status = DUPLICATE`), never deletes, on up to 20,000 properties. **Risk [I]:** the 0.4 Jaccard rule can hide two different flats in one building at the same price. This conflicts with the brief's rule "possible duplicate beats silent merge"; review before scaling. Manual tools: `/admin/engine/duplicates`, `scripts/merge-duplicate-properties.ts` (the only hard delete of properties, besides the import failure-cleanup).

## 16. Re-auction handling
`csvImport.ts` ~l.327–360: a new auction date/price for a known property creates a **new Auction round** under the same Property; the earlier round's status is recomputed from its own dates; a `PropertyChange(field="re_auction")` is written. Property detail page shows "Not sold — listed again" for earlier rounds. Matches the brief's rule [V].

## 17. Auction status
`deriveAuctionStatusFromDates` is the only status logic: dates → UPCOMING / AUCTION_TODAY / LIVE / COMPLETED. It runs at import time (`adapter.ts` l.307, `csvImport.ts` l.188/266/351/358/586, admin create). POSTPONED/CANCELLED exist in the enum, but I found **no code path that sets them from source data** [V by grep]. No job re-derives status for listings that are not re-ingested [U: the site may compute display status at read time; not verified]. **Source disappearance does not change status** anywhere [V]: correct per the brief, and also why stale listings are an open gap.

## 18. PDF / document system
Documents are stored as URLs (`Document`, `PropertyDocument`, `SourceDocument`); writers at `adapter.ts` l.423/501, `csvImport.ts` l.150, admin create. PDF text reading exists inside `deepScan.ts`. Per brief, immutable archival, OCR and field verification from PDFs are not built [not re-verified]. A PDF URL must never be treated as a verified field.

## 19. Media system
`csvImport.ts` l.135–140 (`Media` keyed by `sourceUrl`, `PropertyMedia` ordering); image proxy under `src/app/api/img` and `media`; `sharp` in dependencies. No archival of source images [I].

## 20. Provenance
Source-level only: `SourceRecord` (URL, hash, raw data, extraction method/confidence), `Auction.statusSource` (e.g. `feed:<name>`), `PropertyChange.sourceRecordId`. Field-level provenance (which document/method produced reserve price) does not exist. Implement incrementally, no schema redesign.

## 21. Scheduler
`.github/workflows/tick.yml`: cron `*/5 * * * *`, calls `/api/cron/ingest?limit=100` with `x-cron-secret`, fails the job unless HTTP 200 and `"ok":true`. Safety net: `claimTick` (35 min idle, 5 min during Import all). `hardEnd = start + 262 s`; BAANKNET starts no batch with <55 s left. Details and observed timings: `docs/SCHEDULER.md`. No external pinger configured [per docs].

## 22. Admin / Data Engine
`/admin/engine` (sources, run, pause, Import all), `/admin/engine/history` (run log; on Phase 2 shows the data-health badge parsed from the message), `/admin/engine/duplicates`. Technical status (`SourceRunLog.status`) and data health (Phase 2 verdict) are separate fields by design.

## 23. Existing tests
8 files, 74 tests: completeness 17, httpStatus 15, robotsRules 11, sourceClassification 10, renderedParser 9, renderer 7, baanknet 4, baanknetEmbedded 1. **No tests exist for**: `csvImport.ts`, the BankAuctions.in adapter, dedup, status derivation, `logRun`, any DB-touching code. Four files need a generated Prisma client to load (section 0F).

## 24. Current branch / state
`main` f9ff8a5 (docs). `phase2-data-acquisition-foundation` d5d1c4d, 11 commits ahead (completeness engine, BankAuctions/BAANKNET/generic metrics, history badge, tests). Not merged, not deployed. Other branches: none found via `git ls-remote --heads`.

## 25. Environment assumptions
Node 22 in CI, 24 locally, Vercel version unverified [per docs]. Required: `DATABASE_URL`, `DIRECT_URL`, `ADMIN_SESSION_SECRET`, `ADMIN_PASSWORD`, `CRON_SECRET`; AI: `AI_API_KEY`, `AI_BASE_URL`. Full table: `docs/ENVIRONMENT.md`. `npm ci` runs `prisma generate`, which downloads engine binaries from `binaries.prisma.sh`: in restricted networks use an environment that allows it. **Never run ingestion scripts against the production `.env` unintentionally.**

## 26. Known limitations
No stale/expired-listing handling; no postponed/cancelled detection; no `AuctionEvent` history; no official-bank-site reconciliation; no document archive/OCR; no field provenance; one HTTP-triggered 300 s tick limits throughput (≈100 pages per BankAuctions tick); Vercel Hobby-plan limits per docs [I].

## 27. Known technical debt
`csvImport.ts` is a 613-line multi-purpose writer; run metrics are stored as JSON inside a text column; dedup heuristics are in two places (`csvImport.ts`, `duplicates.ts`); `registry.ts` is out of date versus code (BAANKNET note); `.env.example` lists unused Supabase variables; `docs/DATA_PIPELINE.md` is stale; completeness defects D1–D6.

## 28. Known data-quality risks
Duplicate false positives (section 15); AI-extracted fields on generic sources are not independently verified; thin listings without reserve price are hidden (`thinFix.ts` → REMOVED, with a `PropertyChange` note) rather than flagged; production duplicate rate, completeness and per-source counts are unknown [U].

## 29. Current source inventory
| Source | Mechanism | Registry posture | State |
|---|---|---|---|
| BankAuctions.in | dedicated adapter, sitemap | ALLOWED | live [I] |
| BAANKNET | dedicated importer, internal listing API | **RESTRICTED** in registry (D4) | live per docs [I] |
| Link sources (HTML/CSV/Sheet/AI scan) | `FeedSource` rows | per host | production list unknown [U] |
| IBAPI.in | none | UNAVAILABLE | not built |
| eAuctionsIndia.com | none | RESTRICTED (Cloudflare 403; never bypass) | not built |
| DRT AuctionTiger | none | RESTRICTED (terms review needed) | not built |
| BankEAuctions.com | none | RESTRICTED (ambiguous robots) | not built |
| AuctionBazaar.com | blocked | disallows our crawler | in `BLOCKED_HOSTS` |
| bankauction.co | blocked | own brand/reference site | in `BLOCKED_HOSTS` |
| Direct bank, NBFC/HFC, ARC, IBBI/NCLT sources | none | n/a | **no adapters exist**: 0 of the brief's P0 banks are monitored directly |

## 30. Source onboarding playbook
Use only after Phase 2.1 is merged. Based on the actual architecture:
1. **Policy gate.** Check robots.txt and terms. Add an entry to `SOURCE_REGISTRY` with posture and notes. Anything RESTRICTED needs written permission recorded in the registry note; the owner decides `BLOCKED_HOSTS`. Never bypass CAPTCHA/403.
2. **Find the cheapest stable format**, in this order: official API/JSON → sitemap → static HTML → JS-rendered (`render.ts`) → PDF notices. Record the finding.
3. **Choose the stable identity.** Official auction id → `src:<host>:<id>` as `external_id`; else notice number + bank; else address/property key. Never fuzzy-merge.
4. **Pick the shape.** Low volume or irregular: a `FeedSource` link source (generic). High volume or high value: a dedicated deterministic adapter modelled on `baanknetImport.ts` (resumable cursor in `FeedSource.sheetState`, records go through `importRecords`).
5. **Save a fixture** under `tests/fixtures/` (real response, trimmed) and write parser tests with `node:test` (pattern: `tests/baanknet.test.ts`).
6. **Normalise and validate** via `src/lib/import/normalize.ts` and `validateAuctionRecord.ts`; reject rather than guess.
7. **Emit run metrics** through `logRun({ metrics })`: set `inventoryCount` only when the run saw the full inventory; set `evaluationEligible=false` for partial/budget-limited runs; report `pagesFetched` and `paginationComplete` honestly; set `blocked`/`structureChanged` when detected.
8. **Establish the baseline**: run at least 3 complete passes on different days; the first comparable run is RECOVERING by design.
9. **Canary**: `scripts/diagnose-source.ts` against the source, then one scheduled tick; read `/admin/engine/history`.
10. **Schedule** (add the `FeedSource` or wire the adapter into `runAllFeeds`), **monitor 7 days**, then declare healthy per section 32.

## 31. Source priority roadmap
Keep the brief's order, but reorder by measured volume and access once data exists: (1) fix Phase 2 and the BAANKNET question; (2) official sites of the PSU banks that publish notices (SBI, PNB, BoB, Canara, Union first) as reconciliation sources alongside BAANKNET; (3) private banks; (4) NBFC/HFC; (5) ARCs; (6) DRT; (7) IBBI/NCLT; (8) long tail. **FindAuction.in is not in `BLOCKED_HOSTS`; the owner should consider adding it** so that nobody can add it as a link source by accident (policy decision, not made here).

## 32. Production safety rules / Definition of done
Rules: never delete or hide listings because a source returned less; a run is a candidate for expiry decisions only when `evaluationEligible` is true **and** status is HEALTHY; technical success ≠ data completeness; never overwrite auction history; hide, do not delete; never run scripts against the production database by accident.

**A source is production-ready only when all of these are true:** official/stable identity chosen · deterministic parser (AI only as fallback) · validation rejects bad rows · provenance recorded (`SourceRecord`, `statusSource`) · re-auction creates a new round, not a new property · duplicate handling tested · completeness metrics emitted with correct eligibility · block/structure-change/zero-record detection exercised by a fixture · baseline established (≥3 complete passes) · regression fixture committed · tests pass in CI · canary tick clean · visible in `/admin/engine/history` · 7 days observed without unexplained WARNING or worse.

## 33. Deployment procedure
Push to `main` → Vercel auto-deploys (`docs/DEPLOYMENT.md`). Before merging Phase 2: `npm ci && npx tsc --noEmit && npm test && npx next build`. Schema changes need `DIRECT_URL` and `prisma db push`/migration per `docs/DEPLOYMENT.md`; Phase 2 needs none (metrics live in an existing column).

## 34. Rollback considerations
Vercel instant rollback to the previous deployment (docs). Phase 2 is additive: removing it leaves old `[DATA_ENGINE_V1]` prefixes in `SourceRunLog.message`; the history page on `main` would show them as raw text [I]. Rows older than 60 days are pruned by `logRun`.

## 35. Monitoring procedure
Daily: `/admin/engine/history`, filter by source; read the data-health badge (Phase 2) next to technical status. Weekly: per-source counts versus 7-day median; duplicates page; GitHub Actions `Scheduler tick` run history (a red run = tick failed or timed out).

## 36. Investigating a bad source run
Open the run row; read the JSON after `[DATA_ENGINE_V1]` (metrics, baseline, reason). Compare `inventoryCount` with `median7d`. Check `blocked`, `structureChanged`, `paginationComplete`, `pagesFetched` vs `paginationTotalPages`. Re-run once with `scripts/diagnose-source.ts` (safe, read-oriented) before any manual re-import. Remember D3 when judging a BAANKNET "page drop" verdict.

## 37. Investigating duplicate properties
`/admin/engine/duplicates` groups by the rules in section 15. Check whether the pair shares `externalAuctionId`/`src:` id (same property) or only title/price (possible false positive). Restore a wrongly hidden property by setting status back to PUBLISHED in admin; `REMOVED` is sticky by design ("re-imports never bring it back").

## 38. Investigating incorrect auction status
Find the Auction's dates and `statusSource`. Status is recomputed only when the listing is re-ingested or a newer round arrives (section 17). If dates are right but status is stale, the listing was not re-read; if the source shows postponement or cancellation, the system cannot represent it from data today.

## 39. Investigating stale listings
There is no detector. Manual approach: `SourceRecord.lastSeenAt` older than the source's refresh interval (BAANKNET 6 h) for a source whose latest run was HEALTHY and eligible. Do not act on stale candidates from non-HEALTHY runs.

## 40. Future roadmap
Phase 2.1 (section 0H) → source-disappearance lifecycle (separate from auction status) honouring the protection verdict → populate `AuctionEvent` and status from source signals → official-bank-site adapters + reconciliation with BAANKNET → document archive and PDF text → field-level provenance → onboarding at scale per section 30.

## 41. Explicitly postponed features
Subscriptions, premium tiers, payment gateway (Razorpay settings exist, no checkout), mobile app, social features, CRM, marketing automation, recommendations, investor dashboards, large SEO expansion, aggressive marketing, "never miss an auction" or nationwide-accuracy claims.

---

## Appendix A. Source health runbook
All cases: **detect** in `/admin/engine/history` (technical status + data-health badge) → **diagnose** → **protect** → **recover** → **verify** with a clean eligible run. Protection today is manual because the verdict is not wired (D2): until fixed, do not run any bulk hide/remove (`properties/actions.ts` bulk REMOVE, `thinFix`) while a source is non-HEALTHY.

| Situation | Detect | Diagnose | Protect | Recover | Verify |
|---|---|---|---|---|---|
| HTTP 200 + low inventory | WARNING/INCOMPLETE/CRITICAL badge, count vs `median7d` | page structure, pagination, sitemap size; run `scripts/diagnose-source.ts` | no expiry/hide; keep last good data | fix parser or wait for source; re-run | eligible run back within 10% of baseline |
| HTTP 403 | status `blocked`; `httpStatus.ts` classifies as refusal, never retried | headers/robots/terms; internal policy block vs real refusal (`internal_policy_block` is our own list) | BLOCKED verdict; keep data | do **not** bypass; seek permission or official feed | next run succeeds or source stays flagged |
| HTTP 429 | classified temporary; retried once | rate vs schedule | none needed | lower parallelism/pause (`PARALLEL`, `PAUSE_MS` for BAANKNET) | no repeat in next 3 runs |
| HTTP 503 | classified temporary; retried once | source outage vs maintenance | keep data | wait; resumable cursors continue | run completes |
| CAPTCHA | refusal status | challenge page body | BLOCKED | never solve/bypass; request partner/API access | n/a until access changes |
| Source redesign | `structureChanged` or parser zero/low count | diff fixture vs live page | CRITICAL → keep data | update parser + fixture | fixture test + canary |
| API schema change | `structureChanged`, rejected rate spike | compare JSON keys with fixture | keep data | adapt mapper | fixture + canary |
| PDF unavailable | document fetch fails, rest of record fine | URL status | keep record, mark doc missing (manual) | re-fetch later | doc opens |
| Parser returns zero | CRITICAL (zero vs baseline) | page vs parser selectors | keep data | fix, rerun | count restored |
| Sudden duplicate increase | duplicates page, `duplicateCount` up | identity key changed? | do not bulk-merge | fix identity, then merge via admin | counts stable |
| Sudden rejection increase | WARNING ≥30% rejected | validation reasons in run `rejections` (BAANKNET keeps samples) | keep data | fix mapper/validator | rate back to normal |
| Pagination failure | INCOMPLETE, `paginationComplete=false` | last page reached vs `totalPages` | keep data | resume from cursor | next run complete |
| Source disappearance | repeated BLOCKED/FAILED, no data | DNS/site closure | keep data, **do not mark COMPLETED/CANCELLED** | owner decision to retire source (disable `FeedSource`) | n/a |

## Appendix B. Commands
```bash
git checkout phase2-data-acquisition-foundation
npm ci                      # needs access to binaries.prisma.sh for prisma generate
npx tsc --noEmit            # expect it to fail until D1 is fixed
npm test                    # tsx --test tests/*.test.ts
npx next build
npx tsx scripts/diagnose-source.ts https://example-bank.example/auctions   # read-only: follows robots.txt and the do-not-fetch list, makes at most 2 requests per URL, writes nothing
```

## BankAuctions.in index watch (added after Phase 2 merge)

- Every 5-minute run already downloads the whole sitemap. Each run now compares that size (`discoveredCount`) with the inventory of the **last HEALTHY full pass** (`getLastHealthyInventory`, passed as `sitemapReferenceCount`). A drop of 10% / 30% / 60% gives WARNING / INCOMPLETE / CRITICAL and sets `protectExistingData`, so the removal gate (`sourceRemoval.ts`) holds back source-driven removals immediately instead of waiting for a full pass.
- The reference is the last healthy full pass, not a rolling window, so a collapse that persists never becomes the new normal.
- A normal incremental run still returns RECOVERING (no verdict). Protection set by an index collapse clears only after a later healthy full pass ("Import all"). This errs on the side of protecting data.
- The sitemap index (wp-sitemap.xml) was checked on 2026-10-08 and lists a single auctions file, so reading only `wp-sitemap-auctions-1.xml` is not a current gap. WordPress caps a file at 2,000 URLs: if the run message shows the cap warning, check for a `-2` file.

## BAANKNET owner decision (2026-10-08)

The project owner confirmed that BAANKNET use continues **without written permission** from BAANKNET / PSB Alliance. Recorded in `registry.ts` (`ownerDecision`) and `docs/BAANKNET.md`. Authorization status remains UNKNOWN / REQUIRES BUSINESS CONFIRMATION. Standing conditions: no importer expansion, no bypassing of access controls, stop on any refusal or request from BAANKNET, never describe the data as legally cleared. The risk (terms-of-use / access block) is the owner's to carry; it is not mitigated by this note.

## POSTPONED / CANCELLED status (added 2026-10-08)

- Before: nothing wrote POSTPONED or CANCELLED, and every re-import recomputed status from dates alone, so even a hand-set Postponed would have been reset to UPCOMING.
- Now (`src/lib/domain/resolveAuctionStatus.ts`): an explicit POSTPONED/CANCELLED signal wins; a postponed/cancelled auction **stays** that way on later runs until the auction date changes (then the date-derived status applies again); everything else is unchanged. Wired into the BankAuctions.in update path and `csvImport.ts` (enrichExisting and the superseded-round update).
- Signals available today: (1) admin edit page, new "Auction status" select (Automatic / Postponed / Cancelled), saved with `statusSource = "manual"`; (2) an `auction_status` column/field on CSV-style records, read only when it is a short deliberate status value. Free page text is deliberately NOT scanned (boilerplate like "EMD refunded if auction is cancelled" would cause false cancellations).
- **Not done:** no source currently supplies an explicit status automatically. BankAuctions.in pages and the BAANKNET listing API were not changed (BAANKNET importer stays as is, see the compliance notes). Adding automatic detection needs a verified source field first.
- `AuctionEvent` now has a writer: every status change in these paths writes a row (`src/lib/pipeline/auctionEvents.ts`, never throws).


## Phase 3C: coverage intelligence and zero-yield detection (added 2026-10-08)

No new source was added and no database schema changed.

**Coverage numbers** (`src/lib/pipeline/coverage.ts`, pure; page Admin → Engine → Coverage, read-only):
- Headline: **current unique actionable auctions** = not duplicate, not removed, published, current (open and date not passed by more than 24 h, or POSTPONED), with reserve price, auction date and an address.
- Also shown: total, duplicate, removed, unique, published, current, stale (marked open but date passed), and a per-source table.
- "Found by" attribution = the source that **created** the auction (host of its `src:<host>:<id>` id, else of its URL). `SourceRecord` is written only by the BankAuctions.in crawler, so there is no first-seen row for feed sources; later enrichment by another source is not credited (no field-level provenance yet).
- Overlap table (last 30 days, from `SourceRunLog.created / duplicates / rejected`): share of valid listings that were new vs already held. Caveat: sources are re-read, so over long windows repeat reads inflate overlap; it is most meaningful for a first full pass.
- The page loads up to 100,000 auctions in one query (fine today; revisit with a SQL aggregate if it ever approaches that).

**Zero-yield detection** (`src/lib/pipeline/zeroYield.ts` pure, `yieldMonitor.ts` DB edge, wired in `feeds/run.ts`):
- Covers generic sources only: Google Sheets / CSV, AI list-page reads, whole-site scans. **Not** the BankAuctions.in crawler (it has the completeness engine) and **not** the BAANKNET importer (deliberately untouched).
- Per channel (`list`, `site`, `sheet`) the run's `discovered` count drives a verdict: PRODUCTIVE, EMPTY (watching), **ZERO_YIELD** (≥3 empty runs over ≥6 h and never produced anything), **DROPPED** (produced before, now nothing), **ALL_REJECTED** (≥3 runs where every listing is rejected). A source is PRODUCTIVE if any channel recently found listings.
- "Found listings that are all already known" is PRODUCTIVE: nothing new is not a failure.
- State is stored in `FeedSource.sheetState` under key `yield` (not in run-log rows, because quiet hourly runs are deliberately not logged). Writers that replace the whole field use `keepYieldState`.
- Run-log rows carry a `[YIELD_V1] {json}` first line (history page shows ZERO_YIELD / DROPPED / ALL_REJECTED badges and the "Problems only" filter includes them).
- It is an **alert only**: it never pauses a source, removes a listing, or changes protection. Pausing a dead source stays a human decision.
- Tests: `tests/zeroYield.test.ts`, `tests/coverage.test.ts`, `tests/yieldWiring.test.ts` (source-level guards, including that the BAANKNET importer is untouched and the coverage page never writes).
