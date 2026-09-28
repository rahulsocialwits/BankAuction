# BankAuction

BankAuction.co is a data-driven bank auction property platform designed to discover, normalize, verify, publish, and track auction listings from permitted public sources.

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Database-backed property and auction data
- Source adapter architecture for imports
- Admin dashboard
- Cloudflare-ready deployment

## Project principles

1. Keep source data and normalized data separate.
2. Preserve original source references and documents.
3. Never invent missing property attributes.
4. Support dynamic property fields by property type.
5. Detect duplicates across auction sources.
6. Track every important listing change.
7. Make uncertain records reviewable by an administrator.
8. Keep secrets in environment variables.

## Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open http://localhost:3000.

## Environment

Copy `.env.example` to `.env.local` and configure local secrets.

Never commit API keys, database credentials, or other secrets.

## Data sources

The initial adapter layer is planned for:

- BankAuctions.in
- IBAPI
- eAuctionsIndia
- AuctionTiger / DRT
- BankeAuctions
- AuctionBazaar
- BankAuction.co

Access must follow each source's applicable terms, robots rules, rate limits, and available APIs or public interfaces.

## Status

Initial application scaffold.
