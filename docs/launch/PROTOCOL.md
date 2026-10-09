# Launch protocol: how any LLM or developer works on BankAuction.co

This file is the operating manual. Read it fully, then follow it. It is written so a model that knows nothing about the project can pick up the work.

## 1. Mission
Take BankAuction.co (production: https://auction.bizsocio.com, repo rahulsocialwits/BankAuction) from its current state to a launch-ready website in 20 phases, following the Product Requirements and Functional Specification v1.0 (docs/launch/spec/PRD_v1.0.txt). The spec's rules (MUST / SHOULD / LATER PHASE) override assumptions.

## 2. Read order at the start of every session
1. This file.
2. `AGENTS.md` (this repo uses a Next.js version with breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code).
3. `docs/launch/PHASE_STATUS.md` then `docs/launch/DECISIONS.md` then `docs/launch/BASELINE.md`.
4. The phase file for the current phase, and the filtered rows in `docs/launch/data/requirements.csv`.
5. `docs/CLAUDE_CODE_PLAYBOOK.md` and `docs/ARCHITECTURE.md` for how the code is organised.

## 3. The loop (run it for every phase, in order)
1. **Pick the phase.** The lowest-numbered phase whose status is not DONE and whose dependencies are DONE. If blocked by an owner decision, say so and continue only with work that does not depend on it.
2. **Ask first: what is already there?** Run the phase's Step 1 entry audit. Look at the code, the tests, the live site (read-only) and BASELINE.md. Classify every item DONE / PARTIAL / MISSING / WRONG / UNKNOWN with evidence. Resolve UNKNOWN by checking, not guessing.
3. **Decide from the whole project.** Use the phase's decision rules plus these checks: does the change touch a central helper another phase uses (lifecycle, publishedWhere, canonCity)? Does it affect counts shown elsewhere? Does it need a migration or data run (then it needs approval)? Is there an existing function to extend instead of adding a new one?
4. **Plan.** List only PARTIAL, MISSING, WRONG items as work packages. One focused branch and PR per work package. Never combine unrelated changes.
5. **Implement.** Smallest reasonable change that matches the existing patterns. Add or update tests in the same PR.
6. **Verify.** Run tests, lint, type-check and build where the environment allows. Report actual command output. A test not run is NOT a test passed. If the sandbox cannot generate the Prisma client or run the build, say exactly that.
7. **Report and update.** Update PHASE_STATUS.md in the PR. Use the report template (section 9).
8. **Stop at approval gates** (section 5). Ask the owner. Do not proceed on assumptions that cannot be undone.
9. When the exit gate is fully met with evidence, mark the phase DONE and start the next one.

### 3a. Do the work; never stop at the audit
- The audit is step 1 of the loop, not the deliverable. After it, continue through every work package that needs no owner approval.
- Capability check first: can you create branches/PRs and run commands? If you cannot write to the repo, output exact file contents or diffs for a person to apply. If you cannot run commands, write the tests and list the commands to run.
- Open owner decisions: apply the default in DECISIONS.md as a PROVISIONAL default and label it 'provisional default, not owner-approved'. Never record consent on the owner's behalf.
- When only a human can act (run read-only SQL, check Vercel or GitHub settings, approve a data run), prepare a numbered checklist with exactly what to do and what to send back, and keep working on everything else.
- Stop only at the approval gates in section 5 or at a real blocker.

## 4. Hard rules (from spec sections 0, 6, 13, 19 and owner instructions)
- No production database access, queries, imports, backfills, migrations, destructive cleanup or deployment without explicit written owner approval and a rollback plan. Migrations are written in PRs; the operator applies them.
- Never access or ingest findauction.in. Never bypass robots.txt, authentication, CAPTCHA, 401/403 or anti-bot blocks; stop and record the refusal. Do not add sources. Do not change source permissions.
- Do not merge PRs or deploy. The owner merges and deploys.
- No payment, SMS, WhatsApp or email campaigns to real people during build. Sandbox or test credentials only.
- Never type or print secrets. Never put personal data in URLs.
- Never invent data: no guessed coordinates, dates, prices, risk flags or legal conclusions. Missing data is labelled 'Not available in source' or 'Needs confirmation'.
- Never claim 'verified title', 'guaranteed profit', 'safe investment' or unsupported savings anywhere in UI, copy or code.
- One central lifecycle rule and one central filter (publishedWhere). Do not create parallel status or counting logic in components.
- Counts must equal what users see: a count shown anywhere must equal the result total of the page it links to.
- Do not create new audit or verification frameworks; use the phase files and tests.

## 5. Approval gates (stop and ask)
Stop and request explicit owner approval before: applying any migration; any production data write or backfill; adding a paid service or provider; changing prices, plans or refund policy; enabling real payments or real messaging; adding or enabling a source; merging or deploying. Ask in plain language with: what, why, risk, rollback, and a recommended default.

## 6. Status and evidence vocabulary
- Requirement status: Done / Partial / Not built / Not verified / Needs decision.
- Delivery stages (spec 19), each stated separately: implemented, tested, merged, deployed, production smoke-tested. A successful build does not mean live.
- 'Done' needs a test or direct verification. 'Verified' needs evidence you can cite (command output, URL checked, PR link).
- Say NOT VERIFIED when you did not check. Never round up.

## 7. Codebase map (verify before relying on it)
- Stack: Next.js 16 (read AGENTS.md notice), React 19, Prisma 6 on PostgreSQL, Vercel (main = production), GitHub Actions in .github/workflows, tests with tsx and node:test in tests/.
- Lifecycle: src/lib/domain/auctionLifecycle.ts (effectiveAuctionStatus, auctionStatusWhere, activeAuctionWhere), deriveAuctionStatus.ts, resolveAuctionStatus.ts.
- Counting and queries: src/lib/domain/cityCounts.ts, src/lib/queries/publishedWhere.ts (shared filter), listProperties.ts, cities.ts.
- Location: src/lib/pipeline/locations.ts (canonCity), geo.ts (enrichLocations, AI job), tick.ts (scheduler).
- Map: src/lib/map/coordinates.ts, config.ts, src/components/PropertyMapView.tsx, ViewToggle.tsx.
- Pages: src/app/(site)/*, admin: src/app/admin/(shell)/*, API: src/app/api/*.
- Ingestion: src/data-sources/*, src/lib/pipeline/*, src/lib/deduplication.
- Payments (partial): src/lib/payments/settings.ts, models Payment and PaymentSettings.
- SEO: src/app/sitemap.ts, robots.ts, src/components/JsonLd.tsx.
- Database: prisma/schema.prisma; tables are snake_case plural (properties, auctions); columns keep camelCase names.

## 8. Read-only live audit method
Use HTTP GET only against https://auction.bizsocio.com. Never log in, submit forms, create accounts or trigger payments. To count a list, read the text 'Showing a-b of N listing(s)' on /properties with filters. See data/live_audit_2026-10-09.csv for the checks already done and repeat the ones relevant to your phase. Compare a number shown on one page to the total on the page it links to.

## 9. Report template (PR description and final message)
```
Phase: Pxx - <title>      Work package: WPx.y
1. Entry audit (table: question | evidence | DONE/PARTIAL/MISSING/WRONG/UNKNOWN)
2. Decision taken and why (cite the decision rule and any OPEN decision defaulted)
3. What changed (files) and what was deliberately not changed
4. Tests: added / run / result (paste output). NOT RUN items listed.
5. Stages: implemented yes/no | tested yes/no | merged | deployed | smoke-tested (separately)
6. Risks, rollback steps, monitoring signal
7. Needs from owner (approvals or decisions)
8. PHASE_STATUS.md updated: yes
```

## 10. How to start a new LLM session (paste this)
> You are working on BankAuction.co in this repository. Read docs/launch/PROTOCOL.md and follow it exactly. Open docs/launch/PHASE_STATUS.md, find the first phase that is not DONE, run that phase's entry audit before changing anything, then plan, implement in small PRs, verify, and report using the template. Stop at every approval gate. Do not merge, deploy, or touch production data.

## 11. Phase map
| Phase | Title | Launch-critical |
|---|---|---|
| P01 | Orient, baseline and owner decisions | Yes |
| P02 | Engineering foundation and release process | Yes |
| P03 | Data model and provenance design | Yes |
| P04 | Lifecycle and counting core | Yes |
| P05 | Location data quality and city pages' foundation | Yes |
| P06 | Source compliance and ingestion health | Yes |
| P07 | Search, filters, sort and pagination everywhere | Yes |
| P08 | Property cards and detail page to spec | Yes |
| P09 | Coordinates and map discovery | Partial |
| P10 | Homepage, city/region/institution pages and SEO | Yes |
| P11 | Security and privacy baseline | Yes |
| P12 | Accounts, consent and preferences | Yes |
| P13 | Plans, entitlements and premium access control | Yes (paid launch) |
| P14 | Payments, invoices and refunds | Yes (paid launch) |
| P15 | Alerts and notifications | Partial |
| P16 | Admin operations, audit log and support | Yes |
| P17 | Risk intelligence, compare, client reports and media rights | Partial |
| P18 | Analytics, content and localisation | Partial |
| P19 | Partner programme and team features | No (post-launch, behind flags) |
| P20 | Hardening, full acceptance and launch readiness | Yes |

Launch modes (decision D06): a free discovery launch needs the launch-critical phases excluding the paid parts of P13-P15; a paid launch needs P13 and P14 (and P15 basic alerts) to pass their gates. Phases marked No or Partial can ship later behind flags if the owner agrees.
