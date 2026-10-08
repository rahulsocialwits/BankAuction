# Claude Code playbook — BankAuction

Read this first in every session. It tells you who you are working for, what is already done, what you must never do, how to ship changes, and what to build next.
Companion documents: `BANKAUCTION_ENGINE_HANDOVER.md` (engine forensics and runbooks), `docs/BAANKNET.md`, `docs/ARCHITECTURE.md`, `docs/SCHEDULER.md`, `docs/OPERATIONS.md`, `docs/TROUBLESHOOTING.md`, `docs/DEPLOYMENT.md`, `docs/ENVIRONMENT.md`.
If this file and the code disagree, the code is right: fix this file in the same PR.

---

## 1. Who and what

- **Owner:** Mayur, founder of SocialWits (digital marketing agency, Mumbai). He is a business owner, not a developer. Explain in plain language, give exact click-by-click steps, never assume he can run a terminal. Lead with the result, keep it short, give a PR link when something needs merging.
- **Product:** BankAuction — an India-wide bank-auction property data platform. Production site: **https://auction.bizsocio.com**. Repo: `rahulsocialwits/BankAuction` (GitHub redirects the lowercase name).
- **Stack:** Next.js 16 (Turbopack), React 19, Prisma 6 + PostgreSQL, Vercel. **This is not the Next.js you know**: read `node_modules/next/dist/docs/` before writing Next code (see `AGENTS.md`).
- **Business goal:** accurate, complete, trustworthy auction listings that bring qualified buyer leads. Wrong or missing listings cost trust; prefer protecting existing data over aggressive cleanup.

### Names that are easy to confuse
| Name | What it is |
|---|---|
| auction.bizsocio.com | Our website (what visitors and admins use) |
| BankAuction.co / BankAuction | The product name |
| bankauctions.in ("BankAuctions.in", with an s) | A **third-party source** we read listings from (built-in crawler, `src/data-sources/bankauctions/`) |
| baanknet.com ("BAANKNET") | A **third-party source**: PSB Alliance's e-auction portal (`src/data-sources/feeds/baanknetImport.ts`) |
| findauction.in | **Forbidden.** Never scrape it or use it as a source |
| AuctionFlow Pro / BankAuction CRM | A separate Lovable-built CRM project, not this repo |

---

## 2. Non-negotiable rules

1. **Never scrape or use FindAuction.in** in any form.
2. **No production operations from a session.** Do not run ingestion, mass imports, migrations, cleanup, expiry jobs or backfills against production. Code changes ship through PRs; the owner presses merge.
3. **BAANKNET:** authorization is `UNKNOWN_REQUIRES_BUSINESS_CONFIRMATION`. On 2026-10-08 the owner decided to continue **without written permission** (recorded in `registry.ts` `ownerDecision`). Standing conditions: do not expand the importer; never bypass robots.txt, 401/403 or CAPTCHA; stop on any refusal; never call the data "legally cleared". Never invent consent. Never mark a source `CONFIRMED` without `authorizationEvidence` (a test enforces it).
4. **No access-control bypasses.** If a site refuses (403, CAPTCHA, robots), stop and report. Do not look for another route.
5. **Protect existing data.** An anomalous source run must never remove or hide existing healthy listings. Any automatic source-driven removal goes through `removeListingFromSource` (`src/lib/pipeline/sourceRemoval.ts`); a test fails if code writes `status: "REMOVED"` directly in `thinFix.ts` / `csvImport.ts`.
6. **Do not claim a test passes unless you executed it.** Say "blocked" when it is blocked (see §7).
7. **Do not rewrite the system.** Small, tested, reviewable PRs. One concern per branch.
8. **Do not touch** unrelated UI, SEO, payments, subscriptions, marketing pages, mobile, scheduler design, or unrelated models while doing engine work.
9. **Never commit secrets.** Env var names live in `docs/ENVIRONMENT.md`. Never put the owner's email, keys, or the cron secret into code, logs, or commits.
10. **Do not suppress type errors or change `next.config.ts`** to make a build pass. Fix the cause.

---

## 3. State of the project (as of 2026-10-08)

Merged into `main`:
- **PR #2 — Phase 2 hardening:** completeness engine with separate record and page baselines; source protection gate; BAANKNET compliance documentation; TS2367 fix; 29+ completeness tests.
- **PR #3 — CI:** `.github/workflows/ci.yml` runs `npm ci`, `prisma generate`, `tsc --noEmit`, `npm test` on every PR and push to `main`.
- **PR #4 — BankAuctions.in index watch:** every 5-minute run compares the sitemap size with the last HEALTHY full pass and sets protection on a collapse.
- **PR #5 — BAANKNET owner decision** recorded (status stays UNKNOWN).
- **PR #6 — POSTPONED/CANCELLED:** these statuses now stick across re-imports until the auction date changes; admin "Auction status" select; `auction_status` CSV field; `AuctionEvent` writer.

- **PR (Phase 3C) — coverage intelligence + zero-yield detection:** Admin → Engine → Coverage (current unique actionable auctions, funnel, who found what, overlap) and an alert when a generic source returns "ok" with no listings. See the handover, "Phase 3C". No new source, no schema change.

- **PR (stale auctions):** ended auctions are shown as ended everywhere (read-side, no data written). See the handover, "Ended auctions shown as upcoming".

- **PR (Phase 3, baseline hardening):** only HEALTHY runs define a source's normal; collapses stay protected; admin "accept new baseline" on the Coverage page; BAANKNET refusals recorded.

- **PR (Phase 3, scheduler scalability):** fair per-source time slices, a tick lease shared by every trigger, `/api/cron/health` + watchdog (60-minute late alert); owner still needs to add a second pinger (steps in `docs/SCHEDULER.md`).

- **PR (Phase 3, last-seen tracking):** flag-only disappearance flags for BAANKNET after two consecutive HEALTHY complete passes; nothing is hidden; see the handover, "Last-seen / disappearance tracking".

- **PR (Phase 3, field provenance):** append-only `obs:` observations of reserve price / auction date / address in `PropertyChange` (source, method, document, time); see the handover, "Field-level provenance".

- **PR (Phase 3, daily coverage history):** one reading per India day of the Coverage numbers (current unique actionable etc.), total and per source, stored as `coverage-snapshot` run-log rows; shown under Coverage -> "Daily history". No schema change; see the handover, "Daily coverage history".

- **PR (Phase 3, dedup hardening):** a title/price/date match is no longer enough to merge or hide listings; `propertyIdentity.ts` requires an id, an address match or a distinctive title; merges are logged in `PropertyChange` (`dedup_merge`). See the handover, "Deduplication hardening".

Pending owner tasks: run "Import all" once for BankAuctions.in so the engine has a healthy full-pass reference; check Admin → Engine → History daily at first; set one auction to Postponed in the admin and confirm the badge on its public page.

Decision recorded: Phase 2 hardening is SAFE TO MERGE (Vercel build + CI green). **Phase 3 source onboarding may begin** only through the playbook in §9.

---

## 4. Architecture in one page

- **Scheduler:** GitHub Actions `tick.yml` calls `https://auction.bizsocio.com/api/cron/ingest?limit=100` every 5 minutes with the `x-cron-secret` header. The route runs `runTick` (`src/lib/pipeline/tick.ts`) inside the request, hard deadline 262 s, and answers only when finished. `ingest.yml` is a manual run.
- **Sources:** (a) built-in BankAuctions.in crawler (`src/data-sources/bankauctions/`: sitemap `https://bankauctions.in/wp-sitemap-auctions-1.xml` → pick URLs → extract → normalize → upsert); (b) feed sources managed in Admin → Feeds (`src/data-sources/feeds/`: sheets, web scans, site scans, deep scans, the BAANKNET importer); (c) CSV imports (`src/lib/import/csvImport.ts`). The registry is `src/data-sources/registry.ts`.
- **Data model (Prisma):** `Property` is the physical asset; `Auction` is one auction round of it (a re-auction creates a **new** Auction, never overwrites the property). `SourceRecord` links a source URL to a property. `PropertyChange` logs field changes; `AuctionEvent` logs status transitions; `SourceRunLog` holds one row per run.
- **Auction status:** `deriveAuctionStatusFromDates` gives date-based status; `resolveAuctionStatus` (`src/lib/domain/resolveAuctionStatus.ts`) layers explicit POSTPONED/CANCELLED on top and keeps them until the date changes. All automatic status writes must go through it.
- **Ended auctions (read-time):** stored `Auction.status` is written only on import and goes stale. Visitor-facing code must NOT filter or display the raw stored open status: use `src/lib/domain/auctionLifecycle.ts` (`effectiveAuctionStatus`, `auctionStatusWhere`, `activeAuctionWhere`, `inactiveAuctionWhere`). It only moves an open status to COMPLETED once the auction is over; POSTPONED/CANCELLED/COMPLETED/EXPIRED and dateless auctions are never changed. A test guards the key query files.
- **Completeness engine:** `src/lib/pipeline/completeness.ts` (pure). Record and page counts have **separate baselines and are never mixed**. Thresholds: ≥10% drop WARNING, ≥30% INCOMPLETE, ≥60% CRITICAL. Statuses: HEALTHY, WARNING, INCOMPLETE, CRITICAL, BLOCKED, FAILED, NO_DATA, RECOVERING. Only `evaluationEligible` (full-inventory) runs are judged; incremental runs are RECOVERING, **except** the index-collapse check (sitemap size vs last healthy full pass, `sitemapReferenceCount`).
- **Metrics storage:** `[DATA_ENGINE_V1] {json}\n<text>` in `SourceRunLog.message` (2,000-char cap; the JSON header must always stay valid).
- **Protection:** `sourceProtection.ts` (pure) + `runLog.getSourceProtection` (Prisma; fails closed). `allowsAutomaticRemoval` for existing removal paths; the stricter `allowsDisappearanceAction` (needs a positive HEALTHY) is for any future "listing disappeared" logic.
- **Admin:** Admin → Engine (health, History, Duplicates), Feeds, Sources, Properties (edit page has Auction status select), Settings.

---

## 5. How to work (the loop)

1. `git fetch origin main`; branch from fresh `main`: `git checkout -b <short-topic> origin/main`.
2. Read before writing: the files you will touch, their tests, and the relevant doc. Grep for every writer of the thing you change.
3. Plan in a task list. Keep scope to one concern.
4. Implement small. Prefer pure functions with tests (see `completeness.ts`, `sourceProtection.ts`, `resolveAuctionStatus.ts`) and keep Prisma at the edges.
5. Add or update tests in `tests/` (`node:test` through `tsx`; `npm test`). For every bug fix add a regression test that fails on the old code.
6. Run `npm test` and `npx tsc --noEmit`. Compare type errors with `origin/main`, not with zero (see §7).
7. Update `BANKAUCTION_ENGINE_HANDOVER.md` / the relevant doc when behaviour changes.
8. Commit with the attribution trailer the session asks for, push the branch, give the owner the PR link: `https://github.com/rahulsocialwits/BankAuction/pull/new/<branch>`.
9. Tell the owner exactly what to click: wait for CI (about 2 minutes) and Vercel, merge if green, otherwise paste the error. After merge, say what to check in Admin.

PR description: what was wrong, what changed, tests added, what was NOT verified, how to verify in Admin, rollback (revert the PR).

---

## 6. Commands

```
npm ci                     # install (runs prisma generate)
npm test                   # all tests
npx tsc --noEmit           # type-check
npx next build             # production build (needs Prisma client)
npm run lint               # eslint (2 known pre-existing findings: adapter.ts unused var, csvImport.ts let→const)
npm run ingest -- <source> <limit>   # MANUAL ingest: needs DB env; never run against production from a session
```

CI (`ci.yml`) and Vercel run the full chain. Vercel's build is the authority for type-checking and `next build`.

---

## 7. Sandbox and git quirks (Claude Code cloud sessions)

- **Prisma engines can't be downloaded** in the cloud sandbox (403 from `binaries.prisma.sh`). Consequences: `prisma generate` fails; `tsc` shows ~170 pre-existing "missing Prisma types" errors (implicit any, `AuctionStatus` not exported, …); `next build` can't run; 4 test files that import Prisma (`baanknet`, `baanknetEmbedded`, `renderedParser`, `renderer`) fail to load. Install with `npm ci --ignore-scripts`. **Do not hunt for ways around the network allowlist.** Instead: diff the type-error list against `origin/main` (no new errors = OK), and rely on CI + Vercel for the real run. Report these as "blocked by environment", never as passed.
- **Pushing:** the session's git proxy only authorizes repos attached to the session. If a push returns 403 "not in this session's authorized repository set", call `add_repo` with `access: "push"` for `rahulsocialwits/BankAuction`, then push again.
- **Stale stop-hook warnings:** after a push the hook may still report "unpushed commits / no remote branch" because the clone has no local tracking ref. Verify with `git ls-remote origin <branch>`; if the SHA matches HEAD, run `git update-ref refs/remotes/origin/<branch> HEAD`. Nothing needs pushing.
- **Worktrees:** work may happen in a git worktree. Do not use bare `git stash`; use a WIP commit.
- **WebFetch** obeys robots.txt: admin and other disallowed URLs can't be fetched. The owner must look at admin pages and send screenshots.
- Only one public sitemap fetch is needed to verify source structure; never crawl a source from a session.

---

## 8. Verification and health

After every merge, tell the owner to check:
1. Home, `/auctions`, one `/property/...` page load.
2. Admin → Engine → History: new rows about every 5 minutes; BankAuctions.in incremental rows show RECOVERING (normal).
3. After one "Import all": the final row is HEALTHY (or RECOVERING on the first comparable pass); a second full pass establishes the baseline.
4. A WARNING or worse means a real problem or a baseline to tune: ask for the row text.

Red flags: no new History rows for 15+ minutes; BankAuctions.in CRITICAL/INCOMPLETE for a day; property count dropping sharply; failed Vercel deployment; `tick` workflow failing (wrong/missing `CRON_SECRET`).

The protection rules cannot safely be tested by faking a collapse on production; the tests in `tests/sourceProtection.test.ts` simulate it. Never simulate anomalies against production data.

---

## 9. SOP: onboarding a new source (Phase 3)

Do these in order; each source gets its own branch and PR.
1. **Permission and policy first.** Read the site's terms and robots.txt. Record in `registry.ts`: `accessStatus`, `accessNotes`, and `authorization` (`UNKNOWN_REQUIRES_BUSINESS_CONFIRMATION` unless the owner gives written evidence; then `CONFIRMED` + `authorizationEvidence`). If the terms forbid copying or the site refuses automated access, stop and ask the owner. Never FindAuction.in.
2. **Verify structure by reading one or two public pages** (not by crawling). Write down the exact fields available, including any explicit status field (Postponed/Cancelled) and a stable external auction ID.
3. **Build the adapter** following `bankauctions/` or the feed pattern; honest user agent; polite delays; stop on 401/403/CAPTCHA; no AI unless needed.
4. **Emit run metrics** (`SourceRunMetrics`): `inventoryCount` for full passes, `evaluationEligible` only for full-inventory runs, `pageCountComparable: false` when pages per run depend on a time budget, plus `sitemapReferenceCount` if the source has a cheap index to watch.
5. **Dedup and separation:** match by external auction ID first (use a source-qualified `src:<host>:<id>` id); give every record an address (the identity rule needs an id or an address); Property vs Auction separation; a new auction date beyond the round gap creates a new Auction round.
6. **Removals only via `removeListingFromSource`.** Status writes only via `resolveAuctionStatus`.
7. **Tests:** fixtures in `tests/fixtures/`, parser tests, a completeness scenario for the source, a compliance entry.
8. **Soft launch:** merge, owner runs one full pass, check History for two HEALTHY full passes before calling the source live. Document the source in the handover file.

---

## 10. Backlog (priority order)

1. **Automatic POSTPONED/CANCELLED detection** from a verified source field (BankAuctions.in: inspect a real postponed auction page; do not scan free text). Today status is set by hand or via CSV `auction_status`.
2. ~~**Baseline drift / recovery**~~ DONE (Phase 3 PR 2): only HEALTHY runs are baseline evidence; protection persists until a healthy full pass or an admin "accept new baseline" (Coverage page). An automatic full-pass schedule is still worth considering (PR 5).
3. ~~BAANKNET run refused at the start logs no metrics~~ DONE (Phase 3 PR 2).
4. **Generic feeds are always evaluation-eligible** (likely noisy verdicts): review per-feed eligibility. (Zero-yield detection from Phase 3C now covers the "ok but found nothing" case; this item is about the completeness verdict itself.)
5. ~~`autoCleanExactDuplicates` 0.4 rule~~ replaced by the evidence-based decision in `propertyIdentity.ts` (Phase 3 PR 1).
6. **Disappearance ACTION** (hide/remove): not built. Flags exist (Phase 3 PR 4, flag-only). Any action must be a separate, owner-approved PR using `allowsDisappearanceAction` and the flag.
7. **ESLint:** fix the 2 known pre-existing findings in a tiny separate PR.
8. **Sitemap cap:** WordPress sitemaps hold at most 2,000 URLs per file. If a run message shows the cap warning, check for `wp-sitemap-auctions-2.xml` and read it too.
9. **Per-source first-seen provenance for feed sources** (`SourceRecord` is written only by the BankAuctions.in crawler): needed if "found by" attribution on the Coverage page proves too coarse. Needs an owner-approved schema change.
10. **Phase 3 sources** (new banks/portals) via §9, one per PR.

Do not start a backlog item the owner has not asked for. Propose it, explain the business impact in one or two lines, wait for "go".

---

## 11. Reporting format to the owner

Short and structured: **what changed**, **why it matters for the business**, **what I verified (and what I could not)**, **what you need to do** (numbered, click-by-click), **what is next**. Never paste raw logs unless asked; never say "done" for something only reasoned about. If the owner sends a screenshot or log, read it and answer concretely.

---

## 12. Glossary

- **Full pass / Import all:** a run that reads the whole source inventory (`evaluationEligible`).
- **Incremental run:** a time-boxed slice (normal 5-minute tick); gets no completeness verdict.
- **Baseline:** the source's own history (median over 7/30 days). Records and pages have separate baselines.
- **Protected / protectExistingData:** the latest evaluated run was WARNING or worse (or the history was unreadable): source-driven removals are skipped.
- **Held status:** POSTPONED/CANCELLED kept by `resolveAuctionStatus` until the date changes.
- **Round:** one `Auction` row; a re-auction adds a new round.
