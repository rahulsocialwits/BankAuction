import { DocumentType } from "@prisma/client";
import { RawAuctionRecord, RawDocumentRef, firstField } from "./extract";
import { classifyPropertyType } from "@/lib/normalization/classifyPropertyType";
import {
  nullIfPlaceholder,
  parseExtensionMinutes,
  parseIndianDateTime,
  parseMoney,
  parseYesNo,
  slugify,
} from "@/lib/normalization/parsers";

export interface NormalizedDocument {
  type: DocumentType;
  title: string;
  sourceUrl: string;
}

export interface NormalizedAuctionRecord {
  slugSeed: string;
  title: string;
  rawPropertyType: string | null;
  category: ReturnType<typeof classifyPropertyType>;
  description: string | null;
  legalSchedule: string | null;
  cityRaw: string | null;

  bankName: string | null;
  branchName: string | null;

  externalAuctionId: string | null;
  auctionType: string | null;
  auctionMethod: string | null;
  borrower: string | null;
  contactDetailsRaw: string | null;
  inspectionContactRaw: string | null;
  possessionStatus: string | null;

  reservePrice: number | null;
  emd: number | null;
  minimumIncrement: number | null;
  dscRequired: boolean | null;
  acceptReserveAsFirstBid: boolean | null;

  auctionStart: Date | null;
  auctionEnd: Date | null;
  applicationDeadline: Date | null;

  autoExtension: boolean | null;
  extensionDurationMins: number | null;
  extensionTrigger: string | null;

  documents: NormalizedDocument[];
}

function classifyDocumentType(label: string): DocumentType {
  const s = label.toLowerCase();
  if (/sale notice/.test(s)) return "SALE_NOTICE";
  if (/bid form/.test(s)) return "BID_FORM";
  if (/terms/.test(s)) return "TERMS_AND_CONDITIONS";
  if (/possession/.test(s)) return "POSSESSION_NOTICE";
  if (/schedule/.test(s)) return "PROPERTY_SCHEDULE";
  if (/corrigendum/.test(s)) return "CORRIGENDUM";
  if (/inspection/.test(s)) return "INSPECTION_NOTICE";
  if (/application/.test(s)) return "APPLICATION_FORM";
  if (/proclamation/.test(s)) return "SALE_PROCLAMATION";
  if (/demand/.test(s)) return "DEMAND_NOTICE";
  return "OTHER";
}

function normalizeDocuments(refs: RawDocumentRef[]): NormalizedDocument[] {
  return refs.map((r) => ({
    type: classifyDocumentType(r.label),
    title: r.label,
    sourceUrl: r.href,
  }));
}

export function normalizeBankAuctionsRecord(record: RawAuctionRecord): NormalizedAuctionRecord {
  const rawPropertyType = nullIfPlaceholder(firstField(record, "Property Type"));
  const timeExtensionsText = firstField(record, "Time Extensions");

  return {
    slugSeed: slugify(record.title),
    title: record.title,
    rawPropertyType,
    category: classifyPropertyType(rawPropertyType),
    description: nullIfPlaceholder(firstField(record, "Property Details")),
    legalSchedule: nullIfPlaceholder(firstField(record, "Schedule of Property")),
    cityRaw: nullIfPlaceholder(firstField(record, "City/State")),

    bankName: nullIfPlaceholder(firstField(record, "Institution")),
    branchName: nullIfPlaceholder(firstField(record, "Institution Branch")),

    externalAuctionId: nullIfPlaceholder(firstField(record, "Listing ID")),
    auctionType: nullIfPlaceholder(firstField(record, "Listing Type")),
    auctionMethod: nullIfPlaceholder(firstField(record, "Auction Details")),
    borrower: nullIfPlaceholder(firstField(record, "Borrower Name")),
    contactDetailsRaw: nullIfPlaceholder(firstField(record, "Contact Details")),
    inspectionContactRaw: nullIfPlaceholder(firstField(record, "Inspection Details")),
    possessionStatus: nullIfPlaceholder(firstField(record, "Possession Status")),

    reservePrice: parseMoney(firstField(record, "Reserve Price")),
    emd: parseMoney(firstField(record, "EMD")),
    minimumIncrement: parseMoney(firstField(record, "Minimum Increment")),
    dscRequired: parseYesNo(firstField(record, "DSC Required")),
    acceptReserveAsFirstBid: parseYesNo(firstField(record, "Accept Reserve Price value as First Bid")),

    auctionStart: parseIndianDateTime(firstField(record, "Start Date and Time of Auction")),
    auctionEnd: parseIndianDateTime(firstField(record, "End Date and Time of Auction")),
    applicationDeadline: parseIndianDateTime(firstField(record, "Application Submission Deadline")),

    autoExtension: timeExtensionsText ? /increase|extend/i.test(timeExtensionsText) : null,
    extensionDurationMins: parseExtensionMinutes(timeExtensionsText),
    extensionTrigger: nullIfPlaceholder(timeExtensionsText),

    documents: normalizeDocuments(record.documents),
  };
}
