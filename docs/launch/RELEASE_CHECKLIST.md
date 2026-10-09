# BankAuction release checklist

Use this checklist for each release. A checked item must have evidence (link, command output, or named operator confirmation). Do not merge or deploy until the owner has approved the release.

## Before opening / reviewing the PR
- [ ] Scope is limited to the approved work package; no unrelated changes.
- [ ] No secrets, personal data, production exports, or credentials are committed.
- [ ] Any schema change is reviewed separately. Migration/schema changes are not applied by the PR author or LLM.
- [ ] Rollback plan is written and names the affected code and any data/schema implications.
- [ ] If a feature flag is used, its default preserves current behaviour and the off switch is documented.

## Pull request and CI
- [ ] PR description includes audit evidence, decision rationale, files changed, risks, rollback, and owner actions.
- [ ] Required CI checks pass: Prisma client generation, lint, type-check, unit tests, and production build.
- [ ] Any test not run is explicitly labelled NOT RUN; no unverified test is reported as passed.
- [ ] Review diff and generated files; confirm no unrelated changes.
- [ ] Owner reviews and approves the PR before merge.

## Preview review
- [ ] Preview deployment is READY.
- [ ] Review affected pages and APIs in the preview using read-only interactions.
- [ ] Check desktop and mobile layouts, errors, console/runtime logs, and relevant accessibility states.
- [ ] Confirm preview environment variables do not point ingestion or write-capable code at production. If this cannot be confirmed, do not trigger write-capable flows.
- [ ] Record preview URL and results in the PR.

## Database / migrations (only when applicable)
- [ ] Operator confirms the target environment and backup completion before any schema operation.
- [ ] Owner gives explicit written approval for the specific operation.
- [ ] Operator reviews the proposed Prisma schema diff for drops, renames, data loss, and lock/runtime risk.
- [ ] Operator applies the approved change; the LLM never applies production migrations or writes production data.
- [ ] Record operator, timestamp, backup reference, command, and result without including credentials.
- [ ] Confirm rollback/restore plan. A Git revert alone does not undo database changes.

## Owner release approval and production deploy
- [ ] Owner approves the exact commit/PR and release window in writing.
- [ ] Confirm the previous known-good Vercel deployment and rollback target.
- [ ] Owner/operator merges and deploys; the LLM does not merge or deploy.
- [ ] Latest Vercel Production deployment reports READY for the intended commit.
- [ ] Record deployment URL, commit SHA, timestamp, and CI run link.

## Production smoke test (read-only unless separately approved)
- [ ] Homepage loads: https://auction.bizsocio.com/
- [ ] Property listings load: https://auction.bizsocio.com/properties
- [ ] A property detail page loads and displays source/auction details as expected.
- [ ] Search, filters, pagination, and the relevant changed feature work.
- [ ] Sitemap loads: https://auction.bizsocio.com/sitemap.xml
- [ ] Unauthenticated GET to https://auction.bizsocio.com/api/cron/ingest returns HTTP 401 / Unauthorized (do not send a secret for this check).
- [ ] Check Vercel runtime logs for new errors and relevant GitHub Actions workflow runs.
- [ ] Record each check as PASS, FAIL, or NOT VERIFIED, with timestamp and evidence.

## Rollback
- [ ] If a smoke test or runtime signal fails, stop further rollout and tell the owner.
- [ ] Owner/operator uses Vercel Deployments → last known-good deployment → “⋯” → Promote to Production / Instant Rollback.
- [ ] Revert the bad Git commit in a separate reviewed change so future deployments do not reintroduce it.
- [ ] Database changes require their own approved restore/forward-fix plan; Vercel rollback does not roll back database state.
- [ ] Re-run smoke tests and record the result. Do not claim recovery until verified.

## Release record
- PR:
- CI run:
- Preview URL and review:
- Owner approval (link/date):
- Production commit / deployment URL:
- Smoke-test evidence:
- Rollback target:
- Operator backup confirmation (if applicable):
