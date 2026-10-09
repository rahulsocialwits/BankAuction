# Database backup and restore procedure

**Status: DRAFT — provider configuration and restore capability are NOT VERIFIED. Do not treat this document as proof that backups are enabled or restorable.**

## Known from the repository

- Database engine: PostgreSQL, described in `docs/DATABASE.md`.
- Provider references: Supabase is named in `docs/DATABASE.md` and `docs/ENVIRONMENT.md`; the actual production project's backup/PITR settings have not been verified in this repository.
- Schema changes currently use `npx prisma db push`; there are no checked-in Prisma migration files.
- The repository warns that local `.env` may point to production. Do not run scripts or restore commands from an unverified environment.
- A Git revert or Vercel rollback does **not** roll back database state.

## Owner/operator must confirm before this procedure is approved

Record facts only after checking the provider dashboard. Never paste credentials, connection strings, customer data, or secret values into this file or a PR.

- Production database provider and project identifier (non-secret label):
- Database region:
- Backup type enabled (automated backup / PITR / other):
- Backup retention:
- PITR recovery window, if available:
- Most recent successful backup timestamp:
- Who can initiate and approve a restore:
- Where the restore is performed (prefer a separate recovery project first):
- How restore success is verified:
- Expected recovery point objective (RPO):
- Expected recovery time objective (RTO):
- Last restore drill date and evidence:
- Known limitations / provider plan restrictions:

## Before a schema change or production data operation

1. Owner gives written approval for the exact operation and target environment.
2. Operator confirms the database identity and verifies the latest backup/PITR coverage in the provider dashboard.
3. Operator records the backup reference/time and confirms that a restore path is available.
4. Operator reviews the proposed Prisma schema diff or data-operation plan for destructive effects.
5. Define the rollback/forward-fix plan, validation queries, and stop conditions.
6. Do not proceed if backup state, target environment, or restore capability is unknown.

## Restore procedure — fill in with verified provider-specific steps

1. Owner authorizes restore and identifies the incident, target recovery time, and acceptable data loss.
2. Operator follows the provider's documented recovery flow using the verified backup/PITR point. Prefer restoring to an isolated recovery project first.
3. Validate schema compatibility, row counts, application connectivity, and a small set of non-sensitive functional checks before any traffic cutover.
4. Owner/operator approves any production endpoint/credential switch separately. Never put secret values in chat or Git.
5. After cutover, verify the production deployment, read-only listing/detail pages, logs, and scheduled-job state. Do not automatically replay write jobs until their effects and cursors are reviewed.
6. Record who performed the restore, timestamps, recovery point, validation outcome, and follow-up actions without including secrets or personal data.

**Do not run a restore or change production settings based only on this draft.** Provider-specific console steps, backup retention, PITR availability, and RPO/RTO remain NOT VERIFIED until the owner/operator supplies evidence.
