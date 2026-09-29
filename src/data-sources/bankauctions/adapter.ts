import { prisma } from "@/lib/db/prisma";
import { politeFetch } from "@/lib/fetch/politeFetch";
import { getSourceDefinition } from "@/data-sources/registry";
import { extractBankAuctionsListing } from "./extract";
import { normalizeBankAuctionsRecord } from "./normalize";
import { validateAuctionRecord } from "@/lib/validation/validateAuctionRecord";
import { sha256 } from "@/lib/hash";
import { deriveAuctionStatusFromDates } from "@/lib/domain/deriveAuctionStatus";
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
}

async function ensureSourceRow() {
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

function discoverListingUrls(sitemapXml: string, limit: number): string[] {
  const urls = Array.from(sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
  return urls.filter((u) => u.includes("/auction/")).slice(0, limit);
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

export async function runBankAuctionsIngestion(opts: { limit?: number; triggeredBy?: string } = {}): Promise<IngestionSummary> {
  const limit = opts.limit ?? 10;
  const source = await ensureSourceRow();
  const sourceDef = getSourceDefinition(SOURCE_KEY)!;

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
    const listingUrls = discoverListingUrls(sitemapXml, limit);

    for (const url of listingUrls) {
      summary.pagesChecked++;
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
        status: derivedStatus,
        statusSource: "date_derived",
        sourceUrl: url,
      },
    });
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
        status:
          existingProperty.status === "PENDING_REVIEW" && !validation.needsReview
            ? "PUBLISHED"
            : undefined,
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
        status: validation.needsReview ? "PENDING_REVIEW" : "PUBLISHED",
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
  status: "PROCESSED" | "PENDING_REVIEW" | "FAILED",
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
