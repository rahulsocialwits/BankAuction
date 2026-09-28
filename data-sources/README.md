# Data Source Adapters

Each source gets an isolated adapter.

Expected flow:

FETCH → RAW RECORD → EXTRACT → NORMALIZE → VALIDATE → DUPLICATE CHECK → REVIEW/AUTO-APPROVE → PUBLISH

Adapters must:

- Preserve source identifiers.
- Preserve original source URLs.
- Preserve source documents where permitted.
- Avoid fabricating missing values.
- Record fetch/import timestamps.
- Return structured validation errors.
- Respect source terms, robots rules, rate limits and permitted access methods.

Initial adapters:

- bankauctions
- ibapi
- eauctions-india
- auction-tiger
- bankeauctions
- auctionbazaar
- bankauction
