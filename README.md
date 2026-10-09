# BankAuction.co

Indian bank-auction property discovery website (Next.js 16 · React 19 · Prisma · PostgreSQL · Vercel).
Production: https://auction.bizsocio.com

> **Working on this project with an AI assistant or as a new developer?** Start with [`docs/launch/PROTOCOL.md`](docs/launch/PROTOCOL.md). It defines the 20-phase launch plan, what to audit first, and the approval rules.


**New here? Start with [docs/PROJECT-HANDOVER.md](docs/PROJECT-HANDOVER.md).** The documentation package:

| File | Topic |
|---|---|
| [docs/PROJECT-HANDOVER.md](docs/PROJECT-HANDOVER.md) | overview, stack, folder layout, current state |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | diagrams, files, frontend, search, AI, performance, disaster recovery |
| [docs/DATABASE.md](docs/DATABASE.md) | every model and who writes it |
| [docs/DATA-IMPORT.md](docs/DATA-IMPORT.md) | how a listing gets from a website into the database |
| [docs/BAANKNET.md](docs/BAANKNET.md) | the BAANKNET importer and "Import All" |
| [docs/SCHEDULER.md](docs/SCHEDULER.md) | cron endpoint, GitHub Actions, ticks |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel, rollback, logs |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | environment variables |
| [docs/API.md](docs/API.md) | HTTP routes and server actions |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | step-by-step procedures |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | problems, error matrix, known issues |
| [docs/SECURITY.md](docs/SECURITY.md) | authentication, secrets, crawler rules |
| [docs/HANDOVER-CHECKLIST.md](docs/HANDOVER-CHECKLIST.md) | what the receiving team must obtain |

## Quick start
```bash
npm install            # also runs `prisma generate`
cp .env.example .env   # fill DATABASE_URL, DIRECT_URL, ADMIN_SESSION_SECRET, ADMIN_PASSWORD (use a NON-production database)
npm run dev            # http://localhost:3000 , admin: /admin/login
npx tsc --noEmit && npm test
```
This Next.js version has breaking changes: read `node_modules/next/dist/docs/` before changing framework-level code (see `AGENTS.md`).
