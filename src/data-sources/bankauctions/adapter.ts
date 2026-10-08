import { observeListing } from "@/lib/pipeline/fieldObservations";
import { prisma } from "@/lib/db/prisma";
import { getLastHealthyInventory, logRun } from "@/lib/pipeline/runLog";
import { isVehicleListing } from "@/lib/import/csvImport";
import { politeFetch } from "@/lib/fetch/politeFetch";
import { getSourceDefinition } from "@/data-sources/registry";
import { extractBankAuctionsListing } from "./extract";
import { normalizeBankAuctionsRecord } from "./normalize";
import { validateAuctionRecord } from "@/lib/validation/validateAuctionRecord";
import { sha256 } from "@/lib/hash";
import { deriveAuctionStatusFromDates } from "@/lib/domain/deriveAuctionStatus";
import { auctionDateChanged, isHeldStatus, resolveAuctionStatus } from "@/lib/domain/resolveAuctionStatus";
import { recordAuctionStatusChange } from "@/lib/pipeline/auctionEvents";
import { findDuplicatePropertyViaAI } from "@/lib/deduplication/aiDuplicateCheck";

const SOURCE_KEY = "bankauctions";
const SITEMAP_PATH = "/wp-sitemap-auctions-1.xml";

export interface IngestionSummary {
  jobId: string;
  pagesChecked: number;
  newProperties: number;
  updatedProperties: number;
  newAuctions: number;
  updatedAuctions: number;
  documentsFound: number;
  duplicatesFound: number;
  aiDuplicatesCaught: number;
  aiCalls: number;
  failures: number;
  errors: { url: string; message: string }[];
  skipped?: boolean;
  /** Import-all mode: listing pages never read before that are still waiting. */
  remaining?: number;
}

export async function ensureSourceRow() {
  const def = getSourceDefinition(SOURCE_KEY)!;
  return prisma.source.upsert({
    where: { name: def.name },
    update: { baseUrl: def.baseUrl, accessNotes: def.accessNotes },
    create: {
      name: def.name,
      baseUrl: def.baseUrl,
      status: def.accessStatus === "ALLOWED" ? "HEALTHY" : "RESTRICTED",
      robotsAllowed: def.accessStatus === "ALLOWED",
      accessNotes: def.accessNotes,
    },
  });
}

function discoverListingUrls(sitemapXml: string): string[] {
  const urls = Array.from(sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
  return urls.filter((u) => u.includes("/auction/"));
}

/**
 * Which pages to fetch this run. The WordPress sitemap lists oldest first (~2,000 URLs), so taking the
 * first N would only ever re-read the oldest listings and never see new ones. Instead:
 *  - ~70%: URLs we have never stored, newest first (the end of the sitemap)
 *  - ~30%: already-stored records that were checked longest ago (keeps prices/dates fresh)
 */
async function pickUrls(sourceId: string, all: string[], limit: number, onlyNew = false): Promise<{ urls: string[]; fresh: number }> {
  const stored = new Set((await prisma.sourceRecord.findMany({ where: { sourceId }, select: { sourceUrl: true } })).map((r) => r.sourceUrl));
  const fresh = all.filter((u) => !stored.has(u)).reverse();
  // Import all: only pages never read before, newest first (no share of re-checks)
  if (onlyNew) return { urls: fresh.slice(0, limit), fresh: fresh.length };
  const staleWanted = fresh.length >= limit ? Math.floor(limit * 0.3) : limit - fresh.length;
  const picked = fresh.slice(0, limit - staleWanted);
  const stale = await prisma.sourceRecord.findMany({
    where: { sourceId },
    orderBy: { lastCheckedAt: "asc" },
    take: staleWanted,
    select: { sourceUrl: true },
  });
  return { urls: [...picked, ...stale.map((s) => s.sourceUrl).filter((u) => all.includes(u))], fresh: fresh.length };
}

const ALL_MARK = "builtin-all";

/** "Import all" for the built-in crawler is a switch kept as a marker row (hidden from Run History); the latest row wins. */
export async function builtInImportAll(): Promise<boolean> {
  const row = await prisma.sourceRunLog.findFirst({ where: { kind: ALL_MARK }, orderBy: { startedAt: "desc" }, select: { message: true } });
  return row?.message === "on";
}

export async function setBuiltInImportAll(on: boolean) {
  await prisma.sourceRunLog.create({ data: { source: "BankAuctions.in", kind: ALL_MARK, trigger: "manual", status: "ok", message: on ? "on" : "off" } });
}

async function findOrCreateBank(name: string | null) {
  if (!name) return null;
  return prisma.bank.upsert({
    where: { name },
    update: {},
    create: { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") },
  });
}

async function findOrCreateBranch(bankId: string | null, name: string | null) {
  if (!bankId || !name) return null;
  return prisma.bankBranch.upsert({
    where: { bankId_name: { bankId, name } },
    update: {},
    create: { bankId, name },
  });
}

async function uniqueSlug(base: string, fallbackSuffix: string): Promise<string> {
  const existing = await prisma.property.findUnique({ where: { slug: base } });
  if (!existing) return base;
  const withSuffix = `${base}-${fallbackSuffix}`.slice(0, 120);
  const existing2 = await prisma.property.findUnique({ where: { slug: withSuffix } });
  return existing2 ? `${withSuffix}-${Date.now()}` : withSuffix;
}

export async function runBankAuctionsIngestion(opts: { limit?: number; triggeredBy?: string; all?: boolean; budgetMs?: number } = {}): Promise<IngestionSummary> {
  const limit = opts.all ? 5000 : (opts.limit ?? 250);
  const deadline = opts.budgetMs ? Date.now() + opts.budgetMs : Infinity;
  const runStartedAt = new Date();
  const source = await ensureSourceRow();
  const sourceDef = getSourceDefinition(SOURCE_KEY)!;
  let discoveredCount = 0;

  // Paused from Admin → Data Engine: skip every run until it is resumed.
  if (source.status === "DISABLED") {
    await logRun({ source: "BankAuctions.in", kind: "builtin", trigger: opts.triggeredBy === "manual" ? "manual" : "cron", status: "skipped", message: "Source is paused", startedAt: runStartedAt });
    return {
      jobId: "",
      pagesChecked: 0,
      newProperties: 0,
      updatedProperties: 0,
      newAuctions: 0,
      updatedAuctions: 0,
      documentsFound: 0,
      duplicatesFound: 0,
      aiDuplicatesCaught: 0,
      aiCalls: 0,
      failures: 0,
      errors: [],
      skipped: true,
    };
  }

  const job = await prisma.importJob.create({
    data: { sourceId: source.id, triggeredBy: opts.triggeredBy ?? "manual" },
  });

  const summary: IngestionSummary = {
    jobId: job.id,
    pagesChecked: 0,
    newProperties: 0,
    updatedProperties: 0,
    newAuctions: 0,
    updatedAuctions: 0,
    documentsFound: 0,
    duplicatesFound: 0,
    aiDuplicatesCaught: 0,
    aiCalls: 0,
    failures: 0,
    errors: [],
  };

  try {
    const sitemapRes = await politeFetch(sourceDef, SITEMAP_PATH);
    if (!sitemapRes.ok) throw new Error(`Sitemap fetch failed: HTTP ${sitemapRes.status}`);
    const sitemapXml = await sitemapRes.text();
    const allListingUrls = discoverListingUrls(sitemapXml);
    discoveredCount = allListingUrls.length;
    const picked = await pickUrls(source.id, allListingUrls, limit, !!opts.all);
    const listingUrls = picked.urls;
    summary.remaining = picked.fresh;

    for (const url of listingUrls) {
      if (Date.now() > deadline) break; // out of time: the rest continues on the next run
      summary.pagesChecked++;
      if (opts.all && summary.remaining) summary.remaining--;
      try {
        await ingestOnePage(source.id, sourceDef, url, summary);
      } catch (err) {
        summary.failures++;
        summary.errors.push({ url, message: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch (err) {
    summary.failures++;
    summary.errors.push({ url: SITEMAP_PATH, message: err instanceof Error ? err.message : String(err) });
    await prisma.source.update({ where: { id: source.id }, data: { status: "WARNING", lastAttemptedSync: new Date() } });
  }

  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      finishedAt: new Date(),
      pagesChecked: summary.pagesChecked,
      newProperties: summary.newProperties,
      updatedProperties: summary.updatedProperties,
      newAuctions: summary.newAuctions,
      updatedAuctions: summary.updatedAuctions,
      documentsFound: summary.documentsFound,
      duplicatesFound: summary.duplicatesFound,
      aiCalls: summary.aiCalls,
      failures: summary.failures,
      errorLog: summary.errors.length > 0 ? summary.errors : undefined,
    },
  });

  if (summary.failures === 0 || summary.pagesChecked > summary.failures) {
    await prisma.source.update({
      where: { id: source.id },
      data: { status: "HEALTHY", lastSuccessfulSync: new Date(), lastAttemptedSync: new Date() },
    });
  }

  // Every run sees the whole sitemap, so every run can be checked against the last healthy full pass (see completeness.ts).
  const sitemapReferenceCount = discoveredCount > 0 ? await getLastHealthyInventory("BankAuctions.in") : undefined;
  // WordPress core sitemaps hold at most 2,000 URLs per file; at that size the source may have more listings than we can see.
  const sitemapAtCap = discoveredCount >= 2000;

  await logRun({
    source: "BankAuctions.in",
    kind: "builtin",
    trigger: opts.triggeredBy === "manual" ? "manual" : "cron",
    status: summary.failures > 0 && summary.pagesChecked <= summary.failures ? "error" : "ok",
    created: summary.newProperties,
    updated: summary.updatedProperties,
    duplicates: summary.duplicatesFound,
    rejected: summary.failures,
    message: `${opts.all ? "Import all: " : ""}${summary.pagesChecked} pages checked, ${summary.newProperties} new${opts.all && summary.remaining ? `, ${summary.remaining} left` : ""}` + (sitemapAtCap ? " — sitemap is at the 2,000-URL WordPress cap: check for a wp-sitemap-auctions-2.xml" : "") + (summary.errors[0] ? ` — first error: ${summary.errors[0].message}` : ""),
    startedAt: runStartedAt,
    metrics: {
      inventoryCount: !!opts.all && !summary.remaining && discoveredCount > 0 ? discoveredCount : undefined,
      discoveredCount,
      fetchedCount: summary.pagesChecked,
      parsedCount: Math.max(0, summary.pagesChecked - summary.failures),
      publishedCount: summary.newProperties + summary.updatedProperties,
      updatedCount: summary.updatedProperties,
      duplicateCount: summary.duplicatesFound,
      rejectedCount: summary.failures,
      failedCount: summary.failures,
      pagesDiscovered: discoveredCount,
      pagesFetched: summary.pagesChecked,
      pagesFailed: summary.failures,
      // Pages read in ONE run depend on the tick's time budget (the last tick of an Import-all pass reads only what is left), not on the
      // source's structure, so they are never compared with page history. The record check (sitemap size) still applies.
      pageCountComparable: false,
      sitemapReferenceCount,
      paginationComplete: !!opts.all && !summary.remaining && discoveredCount > 0,
      coverageComplete: !!opts.all && !summary.remaining && discoveredCount > 0,
      evaluationEligible: !!opts.all && !summary.remaining && discoveredCount > 0,
      error: summary.errors[0]?.message,
    },
  });
  return summary;
}

async function ingestOnePage(
  sourceId: string,
  sourceDef: ReturnType<typeof getSourceDefinition>,
  url: string,
  summary: IngestionSummary
) {
  const existingRecord = await prisma.sourceRecord.findUnique({
    where: { sourceId_sourceUrl: { sourceId, sourceUrl: url } },
  });

  const res = await politeFetch(sourceDef!, url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const html = await res.text();

  const raw = extractBankAuctionsListing(html);
  if (!raw) throw new Error("Extractor found no recognizable listing table on this page");

  const normalized = normalizeBankAuctionsRecord(raw);
  // Hash the extracted fields, not the raw HTML: WordPress pages carry volatile
  // boilerplate (nonces, cache-busting params) that changes bytes without any
  // real auction data changing, which would otherwise trigger false "changed"
  // reprocessing and noisy change-log entries on every run (spec §16).
  const contentHash = sha256(JSON.stringify(normalized));

  if (existingRecord && existingRecord.contentHash === contentHash) {
    await prisma.sourceRecord.update({
      where: { id: existingRecord.id },
      data: { lastCheckedAt: new Date() },
    });
    return; // unchanged — skip reprocessing, per spec §16
  }

  // Auctions that ended more than 14 days ago are not imported as new listings. They are remembered
  // (IGNORED) so they are not fetched again on every run.
  if (!existingRecord && isVehicleListing(normalized.title ?? "", normalized.category)) {
    await upsertSourceRecord(sourceId, url, contentHash, normalized, "IGNORED", null, null);
    return; // vehicles are out of scope for this site
  }
  const endedAt = normalized.auctionEnd ?? normalized.auctionStart;
  if (!existingRecord && endedAt && Date.now() - endedAt.getTime() > 14 * 864e5) {
    await upsertSourceRecord(sourceId, url, contentHash, normalized, "IGNORED", null, null);
    return;
  }

  // Missing borrower does not block publication. Store the listing with the source-provided facts and no invented borrower.\n
  const validation = validateAuctionRecord(normalized);
  if (!validation.isValid) {
    await upsertSourceRecord(sourceId, url, contentHash, normalized, "FAILED", null, null);
    throw new Error(`Validation failed: ${validation.errors.join("; ")}`);
  }

  const bank = await findOrCreateBank(normalized.bankName);
  const branch = await findOrCreateBranch(bank?.id ?? null, normalized.branchName);

  // Dedup priority #1 (spec §20): exact external auction ID within this source.
  const existingAuction = normalized.externalAuctionId
    ? await prisma.auction.findFirst({
        where: { externalAuctionId: normalized.externalAuctionId, bankId: bank?.id ?? undefined },
        include: { property: true },
      })
    : null;

  const derivedStatus = deriveAuctionStatusFromDates(normalized.auctionStart, normalized.auctionEnd);

  let propertyId: string;
  let auctionId: string;

  if (existingAuction) {
    summary.duplicatesFound++;
    propertyId = existingAuction.propertyId;
    auctionId = existingAuction.id;

    await logFieldChanges(existingAuction, normalized, propertyId, auctionId);

    // A postponed / cancelled auction keeps that status until its date changes; plain date derivation would reset it to UPCOMING.
    const resolvedStatus = resolveAuctionStatus({
      current: existingAuction.status,
      derived: derivedStatus,
      dateChanged: auctionDateChanged(existingAuction.auctionStart, normalized.auctionStart),
    });
    const statusHeld = isHeldStatus(resolvedStatus) && resolvedStatus === existingAuction.status;

    await prisma.auction.update({
      where: { id: auctionId },
      data: {
        bankId: bank?.id,
        branchId: branch?.id,
        auctionType: normalized.auctionType,
        auctionMethod: normalized.auctionMethod,
        borrower: normalized.borrower,
        officerPhone: extractPhone(normalized.contactDetailsRaw),
        inspectionContact: normalized.inspectionContactRaw,
        possessionStatus: normalized.possessionStatus,
        reservePrice: normalized.reservePrice ?? undefined,
        emd: normalized.emd ?? undefined,
        minimumIncrement: normalized.minimumIncrement ?? undefined,
        dscRequired: normalized.dscRequired,
        acceptReserveAsFirstBid: normalized.acceptReserveAsFirstBid,
        auctionStart: normalized.auctionStart,
        auctionEnd: normalized.auctionEnd,
        applicationDeadline: normalized.applicationDeadline,
        autoExtension: normalized.autoExtension,
        extensionDurationMins: normalized.extensionDurationMins,
        extensionTrigger: normalized.extensionTrigger,
        status: resolvedStatus,
        ...(statusHeld ? {} : { statusSource: "date_derived" }),
        sourceUrl: url,
      },
    });
    await recordAuctionStatusChange(auctionId, existingAuction.status, resolvedStatus, "Source re-read: status follows the auction dates");
    const existingProperty = existingAuction.property;
    await prisma.property.update({
      where: { id: propertyId },
      data: {
        title: normalized.title,
        description: normalized.description,
        category: normalized.category ?? undefined,
        addressText: normalized.cityRaw,
        // Upgrade a previously-uncertain record once it re-validates cleanly;
        // never silently downgrade an already-published one on every refetch —
        // if a change makes it newly ambiguous, that's exactly what admin
        // review + the change log (above) are for.
        status: "PUBLISHED",
      },
    });
    summary.updatedProperties++;
    summary.updatedAuctions++;
  } else {
    // Dedup priority #3-5 (spec §20): no exact ID match, but the same bank
    // plus similar title/address/description can still mean the same
    // physical property re-listed under a new auction ID (e.g. after a
    // postponement or corrigendum). Only calls the AI when a plausible
    // textual overlap exists -- never on every fresh, genuinely-new listing.
    const dupCheck = await findDuplicatePropertyViaAI(bank?.id, {
      title: normalized.title,
      addressText: normalized.cityRaw,
      description: normalized.description,
    });
    if (dupCheck.aiCallMade) summary.aiCalls++;

    if (dupCheck.match) {
      summary.aiDuplicatesCaught++;
      summary.duplicatesFound++;
      propertyId = dupCheck.match.propertyId;

      await prisma.propertyChange.create({
        data: {
          propertyId,
          field: "ai_duplicate_merge",
          oldValue: null,
          newValue: `Merged as same property (confidence ${dupCheck.match.confidence.toFixed(2)}); new auction recorded under existing property instead of creating a duplicate.`,
        },
      });

      const auction = await prisma.auction.create({
        data: {
          propertyId,
          bankId: bank?.id,
          branchId: branch?.id,
          externalAuctionId: normalized.externalAuctionId,
          auctionType: normalized.auctionType,
          auctionMethod: normalized.auctionMethod,
          borrower: normalized.borrower,
          officerPhone: extractPhone(normalized.contactDetailsRaw),
          inspectionContact: normalized.inspectionContactRaw,
          possessionStatus: normalized.possessionStatus,
          reservePrice: normalized.reservePrice ?? undefined,
          emd: normalized.emd ?? undefined,
          minimumIncrement: normalized.minimumIncrement ?? undefined,
          dscRequired: normalized.dscRequired,
          acceptReserveAsFirstBid: normalized.acceptReserveAsFirstBid,
          auctionStart: normalized.auctionStart,
          auctionEnd: normalized.auctionEnd,
          applicationDeadline: normalized.applicationDeadline,
          autoExtension: normalized.autoExtension,
          extensionDurationMins: normalized.extensionDurationMins,
          extensionTrigger: normalized.extensionTrigger,
          status: derivedStatus,
          statusSource: "date_derived",
          sourceUrl: url,
        },
      });
      auctionId = auction.id;
      summary.updatedProperties++;
      summary.newAuctions++;
      await observeListing({ propertyId, auctionId }, { reserve: normalized.reservePrice, start: normalized.auctionStart, address: normalized.cityRaw }, { statusSource: "BankAuctions.in", method: "html", document: url });

      for (const doc of normalized.documents) {
        const document = await prisma.document.upsert({
          where: { sourceUrl: doc.sourceUrl },
          update: { title: doc.title, type: doc.type },
          create: { sourceUrl: doc.sourceUrl, title: doc.title, type: doc.type },
        });
        await prisma.propertyDocument.upsert({
          where: { propertyId_documentId: { propertyId, documentId: document.id } },
          update: {},
          create: { propertyId, documentId: document.id },
        });
        summary.documentsFound++;
      }

      await upsertSourceRecord(sourceId, url, contentHash, normalized, validation.needsReview ? "PENDING_REVIEW" : "PROCESSED", propertyId, auctionId);
      return;
    }

    const slug = await uniqueSlug(normalized.slugSeed, normalized.externalAuctionId ?? Date.now().toString());
    // Auto-approve records that passed validation with no uncertainty flags
    // (clear category, price, and date). Genuinely ambiguous extractions
    // still wait for a human — see validateAuctionRecord's needsReview logic.
    const property = await prisma.property.create({
      data: {
        slug,
        title: normalized.title,
        description: normalized.description,
        category: normalized.category ?? undefined,
        addressText: normalized.cityRaw,
        status: "PUBLISHED",
      },
    });
    propertyId = property.id;

    if (normalized.legalSchedule) {
      await prisma.propertyAttribute.create({
        data: { propertyId, key: "legal_schedule", value: normalized.legalSchedule },
      });
    }
    if (normalized.rawPropertyType) {
      await prisma.propertyAttribute.create({
        data: { propertyId, key: "source_property_type", value: normalized.rawPropertyType },
      });
    }

    const auction = await prisma.auction.create({
      data: {
        propertyId,
        bankId: bank?.id,
        branchId: branch?.id,
        externalAuctionId: normalized.externalAuctionId,
        auctionType: normalized.auctionType,
        auctionMethod: normalized.auctionMethod,
        borrower: normalized.borrower,
        officerPhone: extractPhone(normalized.contactDetailsRaw),
        inspectionContact: normalized.inspectionContactRaw,
        possessionStatus: normalized.possessionStatus,
        reservePrice: normalized.reservePrice ?? undefined,
        emd: normalized.emd ?? undefined,
        minimumIncrement: normalized.minimumIncrement ?? undefined,
        dscRequired: normalized.dscRequired,
        acceptReserveAsFirstBid: normalized.acceptReserveAsFirstBid,
        auctionStart: normalized.auctionStart,
        auctionEnd: normalized.auctionEnd,
        applicationDeadline: normalized.applicationDeadline,
        autoExtension: normalized.autoExtension,
        extensionDurationMins: normalized.extensionDurationMins,
        extensionTrigger: normalized.extensionTrigger,
        status: derivedStatus,
        statusSource: "date_derived",
        sourceUrl: url,
      },
    });
    auctionId = auction.id;
    summary.newProperties++;
    summary.newAuctions++;
  }

  for (const doc of normalized.documents) {
    const document = await prisma.document.upsert({
      where: { sourceUrl: doc.sourceUrl },
      update: { title: doc.title, type: doc.type },
      create: { sourceUrl: doc.sourceUrl, title: doc.title, type: doc.type },
    });
    await prisma.propertyDocument.upsert({
      where: { propertyId_documentId: { propertyId, documentId: document.id } },
      update: {},
      create: { propertyId, documentId: document.id },
    });
    summary.documentsFound++;
  }

  // Provenance: what bankauctions.in showed for this listing (append-only; an unchanged value adds nothing).
  await observeListing({ propertyId, auctionId }, { reserve: normalized.reservePrice, start: normalized.auctionStart, address: normalized.cityRaw }, { statusSource: "BankAuctions.in", method: "html", document: url });

  await upsertSourceRecord(sourceId, url, contentHash, normalized, validation.needsReview ? "PENDING_REVIEW" : "PROCESSED", propertyId, auctionId);
}

function extractPhone(contactRaw: string | null): string | null {
  if (!contactRaw) return null;
  const m = contactRaw.match(/[\d][\d\s]{7,}\d/);
  return m ? m[0].trim() : null;
}

async function upsertSourceRecord(
  sourceId: string,
  url: string,
  contentHash: string,
  normalized: unknown,
  status: "PROCESSED" | "PENDING_REVIEW" | "FAILED" | "IGNORED",
  propertyId: string | null,
  auctionId: string | null
) {
  await prisma.sourceRecord.upsert({
    where: { sourceId_sourceUrl: { sourceId, sourceUrl: url } },
    update: {
      contentHash,
      rawData: normalized as object,
      status,
      lastSeenAt: new Date(),
      lastCheckedAt: new Date(),
      propertyId: propertyId ?? undefined,
      auctionId: auctionId ?? undefined,
      extractionMethod: "html_parser",
    },
    create: {
      sourceId,
      sourceUrl: url,
      contentHash,
      rawData: normalized as object,
      status,
      propertyId: propertyId ?? undefined,
      auctionId: auctionId ?? undefined,
      extractionMethod: "html_parser",
    },
  });
}

async function logFieldChanges(
  existingAuction: { reservePrice: unknown; auctionStart: Date | null; propertyId: string },
  normalized: { reservePrice: number | null; auctionStart: Date | null },
  propertyId: string,
  auctionId: string
) {
  const oldPrice = existingAuction.reservePrice?.toString() ?? null;
  const newPrice = normalized.reservePrice?.toString() ?? null;
  if (oldPrice !== newPrice) {
    await prisma.propertyChange.create({
      data: { propertyId, auctionId, field: "reserve_price", oldValue: oldPrice, newValue: newPrice },
    });
  }

  const oldStart = existingAuction.auctionStart?.toISOString() ?? null;
  const newStart = normalized.auctionStart?.toISOString() ?? null;
  if (oldStart !== newStart) {
    await prisma.propertyChange.create({
      data: { propertyId, auctionId, field: "auction_start", oldValue: oldStart, newValue: newStart },
    });
  }
}
