# Database

* Provider: **PostgreSQL** (`prisma/schema.prisma`: `provider = "postgresql"`; `url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")`). `.env.example` names **Supabase**; the schema header says it is portable to another Postgres.
* ORM: Prisma `^6.19.3`, client generated on `npm install` (`postinstall: prisma generate`), instantiated in `src/lib/db/prisma.ts`.
* **No migration files exist** (`prisma/` contains only `schema.prisma`). The schema is pushed with `npx prisma db push`. There is no seed script for the schema; `scripts/seed-localities.ts` only seeds the `localities` table.
* 43 models, 11 enums. IDs are `cuid()` strings unless noted. Money is `Decimal(14,2)` (INR).
* **Local `.env` normally points at the production database** — any local script or import writes to production. Use a separate database for experiments.
* Backups: NOT VERIFIED (Supabase backup/PITR settings are outside the repository). See [HANDOVER-CHECKLIST.md](HANDOVER-CHECKLIST.md).

## Enums
`PropertyCategory` (RESIDENTIAL, COMMERCIAL, INDUSTRIAL, LAND_PLOT, AGRICULTURAL, VEHICLE) · `PropertyStatus` (DRAFT, PENDING_REVIEW, PUBLISHED, DUPLICATE, EXPIRED, REMOVED) ·
`AuctionStatus` (UPCOMING, LIVE, AUCTION_TODAY, COMPLETED, POSTPONED, CANCELLED, EXPIRED) · `SourceStatus` (HEALTHY, WARNING, FAILED, DISABLED, RESTRICTED) ·
`SourceRecordStatus` (NEW, PROCESSED, PENDING_REVIEW, FAILED, IGNORED) · `DocumentType` (SALE_NOTICE, AUCTION_NOTICE, SALE_PROCLAMATION, BID_FORM, TERMS_AND_CONDITIONS, PROPERTY_SCHEDULE, POSSESSION_NOTICE, DEMAND_NOTICE, CORRIGENDUM, INSPECTION_NOTICE, APPLICATION_FORM, OTHER) ·
`MediaType` (PHOTO, FLOOR_PLAN, SITE_PLAN, MAP, OTHER) · `UserRole` (USER, ADMIN) · `AlertType` (NEW_MATCH, DATE_CHANGE, PRICE_CHANGE, STATUS_CHANGE) · `BlogPostStatus` (DRAFT, PUBLISHED) · `AdminRole` (MASTER, ADMIN).

## Core entities

### Property — table `properties`
One physical property. **One property can have many auctions** (rounds); the newest auction (ordered by `createdAt desc`) is the "current" one everywhere on the site.
| Field | Type | Req | Notes |
|---|---|---|---|
| id | String cuid | PK | |
| slug | String | unique | URL `/property/[slug]` (`slugify(title)`, suffixed with time when taken) |
| title | String | yes | |
| description | Text? | | |
| category | PropertyCategory? | | |
| propertyTypeId / subtypeId | String? | | FK `property_types`, `property_subtypes` |
| cityId | String? | | FK `cities` |
| addressText | String? | | raw source place/address text, never geocoded |
| latitude, longitude | Float? | | |
| status | PropertyStatus | default PENDING_REVIEW | only `PUBLISHED` is public. `REMOVED` = admin "Delete" (row kept so re-imports never bring it back); `DUPLICATE` = hidden duplicate |
| extractionConfidence | Float? | | 0..1 if AI-derived |
| geoCity, geoLocality, geoState, geoCheckedAt | String?/DateTime? | | AI-verified place, used by City/Area/State filters |
| createdAt, updatedAt | DateTime | | |

Indexes: `(category, status)`, `(cityId)`, `(geoCity)`. Relations: attributes, amenities, auctions, documents, media, changes, sourceRecords, savedBy, leads (children with `onDelete: Cascade`: PropertyAmenity, PropertyAttribute, PropertyDocument, PropertyMedia; **Auction has no cascade**).
* Created by: `importRecords` (`src/lib/import/csvImport.ts`), built-in adapter (`bankauctions/adapter.ts`), admin "Add property" (`admin/(shell)/properties/new`).
* Updated by: `enrichExisting`, admin actions (`properties/actions.ts`: approve/reject/remove/restore/bulk remove/hide-no-borrower/edit), `pipeline/geo.ts`, `pipeline/review.ts`, `pipeline/duplicates.ts`, `pipeline/thinFix.ts`.
* Read by: all public lists (`lib/queries/listProperties.ts`), property page, sitemap, `/api/v1`.

### Auction — table `auctions`
One auction **round** of a property.
Fields: `id`, `propertyId` (FK, required), `bankId?`, `branchId?`, `externalAuctionId?` (the source's id; for link sources it is `src:<host>:<id>` when the reader sets one), `noticeNumber?`, `auctionType?`, `auctionMethod?`, `authorizedOfficer?`, `officerDesignation?`, `officerPhone?`, `officerEmail?`, `borrower?`, `reservePrice?`, `emd?`, `minimumIncrement?` (Decimal 14,2), `auctionStart?`, `auctionEnd?`, `applicationDeadline?`, `inspectionDate?`, `inspectionTime?`, `inspectionLocation?`, `inspectionContact?`, `possessionStatus?`, `dscRequired?`, `acceptReserveAsFirstBid?`, `autoExtension?`, `extensionDurationMins?`, `extensionTrigger?`, `status` (AuctionStatus, default UPCOMING), `statusSource?` (**also used as the importing source marker: `feed:<FeedSource.name>`** for link sources, or `date_derived` for the built-in crawler), `sourceUrl?`, `createdAt`, `updatedAt`.
Indexes: `(status, auctionStart)`, `(bankId)`. Times are stored as UTC instants; source times are Indian Standard Time and are converted on import (`parseListingDate`).
Re-auctions: when the same property is listed again for a later date, `addReauctionRound` (csvImport.ts) adds a new `Auction` row; the old row's status follows its own dates. The property page shows "Previous auctions".

### Bank / BankBranch — `banks`, `bank_branches`
`Bank`: `name` (unique), `slug` (unique), `shortCode?`, `logoUrl?`, `website?`. `BankBranch`: `bankId`, `name`, `cityId?`, `address?`, `phone?`, `email?`; unique `(bankId, name)`.
Created by `resolveBank` in `csvImport.ts` (one row per real bank: `canonicalBankKey` maps "SBI"/"State Bank Of India Ltd." to "State Bank of India") and by the built-in adapter.

### PropertyAttribute — `property_attributes` (EAV)
`propertyId`, `key`, `value?`, `unit?`, `isKnown` (default true), `sourceRecordId?`; unique `(propertyId, key)`, cascade on property delete.
Keys written by code: `legal_schedule`, `source_property_type`, `deep_scanned` (marks a deep read), `borrower_status` (`not_available_from_source`), `enrichment_status` (`needs_enrichment`, legacy hold; see DATA-IMPORT) and any admin-added attributes.

### Geography: State, District, City — `states`, `districts`, `cities`
Reference tables (name/slug; city has lat/lng). `City` is linked from `Property.cityId` and `BankBranch.cityId`. How populated: NOT VERIFIED (the AI location step stores `geo*` text on the property rather than these FKs).

### PropertyType, PropertySubtype, Amenity, PropertyAmenity
Classification tables (`property_types`, `property_subtypes`, `amenities`, `property_amenities`). Seeded by hand/admin; NOT VERIFIED which UI edits them.

### PropertyChange — `property_changes`; AuctionEvent — `auction_events`
Field-level audit log (`field`, `oldValue`, `newValue`, `detectedAt`; optional `propertyId`, `auctionId`, `sourceRecordId`). Written by the built-in adapter (`logFieldChanges`), `importRecords` (`re_auction`, `deep_scan`, `needs_enrichment`), review (`auto_review`), thin-fix (`thin_fix`). `AuctionEvent` = status transitions (model exists; writers NOT VERIFIED).

## Provenance and ingestion (built-in crawler)
* **Source** (`sources`): `name` unique, `baseUrl`, `status` (SourceStatus, default RESTRICTED), `robotsAllowed?`, `accessNotes?`, `lastSuccessfulSync?`, `lastAttemptedSync?`. The admin "Pause" of the built-in crawler sets `DISABLED`.
* **SourceRecord** (`source_records`): one fetched page per `(sourceId, sourceUrl)` (unique). `contentHash` skips unchanged pages; `status` NEW/PROCESSED/PENDING_REVIEW/FAILED/IGNORED (IGNORED = vehicle, old auction, or no borrower); `propertyId`/`auctionId` link to the result; `rawData` JSON.
* **ImportJob** (`import_jobs`): counters per built-in crawler run (`pagesChecked`, `newProperties`, …, `errorLog` JSON).
* **SourceDocument**, **SourceMedia**: link tables from a SourceRecord to Document/Media (writers NOT VERIFIED beyond the adapter).

## Documents and media
* **Document** (`documents`): `type`, `title?`, `sourceUrl` (**unique**), `storedUrl?` (always null in practice: files are not copied), `fileType?`, `fileSizeBytes?`, `checksum?`. **PropertyDocument** (`property_documents`): composite PK `(propertyId, documentId)`, cascade on property.
* **Media** (`media`): `type`, `sourceUrl`, `storedUrl?`, `checksum?`, `width?`, `height?`. **PropertyMedia**: PK `(propertyId, mediaId)`, `sortOrder`, cascade on property.
* Created by `attachDocuments` / `attachMedia` in `csvImport.ts` (max 12 each per record). **The project stores URLs, not files**, for property photos and notices. See [DATA-IMPORT.md](DATA-IMPORT.md#media-and-documents).

## Link sources and logs
* **FeedSource** (`feed_sources`): admin-managed website/Sheet/CSV sources. `name` (unique), `url`, `active`, `lastRunAt`, `lastStatus` ("ok"|"error"), `lastMessage` (the text the admin sees), `contentHash` (AI skip), **`sheetState` (JSON text, several writers)**:
  * `{ "tabs": { <gid>: TabState } }` — Google Sheet / CSV state (`importTabular`).
  * `{ "web": { seen[], lastAt, importAll, verified[], baanknetPage?, baanknetTotalPages? } }` — website scan state (`webStateOf` / `withWebState` in `siteScan.ts`).
  * `{ "baanknet": BaanknetState }` — BAANKNET cursor (`baanknetImport.ts`), stored under its own key so other writers cannot overwrite it.
  Because several writers share one text column, always read-modify-write the JSON (the helpers do).
* **SourceRunLog** (`source_run_logs`): one row per run. `kind`: `builtin`, `feed`, `csv`, `cron` (scheduler tick). **Marker rows share the table** and are hidden from History: `ai-slot` (per-source lock `AI lock: <name>`, status `running`; and slot markers), `claim` (visitor tick claim), `builtin-all` (built-in "Import all" switch: message `on`/`off`). `status` values written: `ok`, `error`, `skipped`, `blocked`, `policy_block`, `running`.
* **AiSettings** (`ai_settings`, singleton `id="default"`): `enabled`, `extractorModel?`, `fallbackModel?`, `extractionPrompt?`, `rules?`, `maxPageChars?` — edited in Admin → AI Admin; env vars are the fallback.

## Users, engagement, content
* **User** (`users`): `email` unique, `name?`, `passwordHash` (scrypt), `role`. **SavedProperty** (PK `(userId, propertyId)`), **SavedSearch**, **Alert**, **Review** — models exist; the UI writers for SavedSearch/Alert/Review: NOT VERIFIED (pages `/saved-properties`, `/my-alerts` exist).
* **Lead** (`leads`): enquiries; written by `contact/actions.ts` and `property/[slug]/actions.ts`.
* **AdminUser** (`admin_users`): `email` unique, `passwordHash`, `role` MASTER|ADMIN, `active`. The env `ADMIN_PASSWORD` is the master login (see SECURITY).
* **SiteSettings** (singleton): contact info, social links, policy texts, logos, home SEO. **SitePage** (`key` PK: about/privacy/terms/disclaimer/faq, `data` JSON). **BlogPost** (slug unique, tags `String[]`). **Locality** (city+name suggestions, unique `(city, slug)`). **HomeConfig** (singleton `default`: hero text, city list, type order, bank slugs as JSON strings).
* **SiteImage** (`key` PK, `data Bytes`) and **MediaAsset** (`data Bytes`, `thumb Bytes?`, `hash` unique): **binary images uploaded by the master admin live in the database** and are served by `/api/img/[key]` and `/api/media/[id]`.
* **ApiKey** (`api_keys`): `keyHash` (sha256, unique), `prefix`, `active`, `requestCount`, `lastUsedAt`. The key itself is never stored.
* **PaymentSettings** (singleton), **Payment** (`orderId` unique, status created|paid|failed|refunded): the settings screen exists; **no code creates Payment rows** (checkout NOT IMPLEMENTED).

## Operations
| Task | Command |
|---|---|
| Generate client | `npx prisma generate` (runs on install) |
| Apply schema to the DB | `npx prisma db push` (uses `DIRECT_URL`) — **review the diff; it can drop data** |
| Inspect data | `npx prisma studio` |
| Data-integrity concerns | `Auction` has no cascade (deleting a property with auctions fails); `statusSource` doubles as the source marker; `FeedSource.sheetState` is multi-writer JSON; duplicates are prevented in code (no DB unique on auction external id) |
