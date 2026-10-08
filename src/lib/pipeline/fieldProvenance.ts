/*
 * Field-level provenance (pure, no database).
 *
 * An OBSERVATION says: "this source, using this method, showed this value for this field at this time". Observations are
 * append-only facts. They never overwrite each other and never decide which value is right: a different source showing a
 * different reserve price is simply a second observation, available later for dispute checks, deduplication, source
 * contribution, disappearance tracking, PDF extraction and reconciliation.
 *
 * Storage: the existing PropertyChange table (no schema change). field = "obs:<field>", newValue = compact JSON.
 */

export const OBS_PREFIX = "obs:";
export const OBSERVED_FIELDS = ["reserve_price", "auction_start", "address"] as const;
export type ObservedField = (typeof OBSERVED_FIELDS)[number];
/** Reserve price and auction date belong to one auction round; the address belongs to the property. */
export const AUCTION_LEVEL_FIELDS: ReadonlySet<ObservedField> = new Set<ObservedField>(["reserve_price", "auction_start"]);

export type ExtractionMethod = "html" | "pdf" | "api" | "csv" | "sheet" | "ai_page" | "manual" | "unknown";
const METHODS: ReadonlySet<string> = new Set<ExtractionMethod>(["html", "pdf", "api", "csv", "sheet", "ai_page", "manual", "unknown"]);

export interface FieldObservation {
  field: ObservedField;
  /** Normalised value as text (see normalizeObservedValue). */
  value: string;
  /** Human name of the source ("BAANKNET", "BankAuctions.in", a feed name). */
  source: string;
  method: ExtractionMethod;
  /** The page / notice / file the value came from, when known. */
  document?: string | null;
  /** 0..1, only where the extractor can say. */
  confidence?: number | null;
  /** Set when stored: the auction round for auction-level fields, null for the address. */
  auctionId?: string | null;
}

export interface StoredObservation extends FieldObservation {
  propertyId: string;
  observedAt: Date;
}

/** "feed:BAANKNET" -> "BAANKNET". */
export const sourceLabelOf = (statusSource: string): string => (statusSource.startsWith("feed:") ? statusSource.slice(5) : statusSource).trim().slice(0, 120) || "unknown";

const PLACEHOLDER_ADDRESS = /^(n\/?a|na|nil|none|null|not available|not provided|-+|\.+)$/i;

/** Text form of a value, or null when there is nothing worth recording. */
export function normalizeObservedValue(field: ObservedField, raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (field === "reserve_price") {
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[₹,\s]/g, ""));
    return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : null;
  }
  if (field === "auction_start") {
    const d = raw instanceof Date ? raw : new Date(String(raw));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const text = String(raw).replace(/\s+/g, " ").trim().slice(0, 400);
  return text.length >= 3 && !PLACEHOLDER_ADDRESS.test(text) ? text : null;
}

/** Comparison key: formatting-only differences (case, spacing) are not a change. */
const keyOf = (field: ObservedField, value: string) => (field === "address" ? value.toLowerCase().replace(/\s+/g, " ").trim() : value);

export function observationsFromListing(
  facts: { reserve?: unknown; start?: unknown; address?: unknown },
  ctx: { source: string; method: ExtractionMethod; document?: string | null; confidence?: number | null },
): FieldObservation[] {
  const base = { source: ctx.source, method: ctx.method, document: ctx.document ?? null, confidence: ctx.confidence ?? null };
  const out: FieldObservation[] = [];
  const add = (field: ObservedField, raw: unknown) => {
    const value = normalizeObservedValue(field, raw);
    if (value !== null) out.push({ field, value, ...base });
  };
  add("reserve_price", facts.reserve);
  add("auction_start", facts.start);
  add("address", facts.address);
  return out;
}

/** The PropertyChange columns for one observation. */
export function encodeObservation(o: FieldObservation): { field: string; newValue: string } {
  const payload: Record<string, unknown> = { v: o.value, s: o.source, m: o.method };
  if (o.document) payload.d = o.document.slice(0, 300);
  if (typeof o.confidence === "number") payload.c = o.confidence;
  return { field: `${OBS_PREFIX}${o.field}`, newValue: JSON.stringify(payload) };
}

export function decodeObservation(row: { field: string; newValue: string | null; auctionId: string | null; detectedAt: Date }): (FieldObservation & { observedAt: Date }) | null {
  if (!row.field.startsWith(OBS_PREFIX) || !row.newValue) return null;
  const field = row.field.slice(OBS_PREFIX.length) as ObservedField;
  if (!(OBSERVED_FIELDS as readonly string[]).includes(field)) return null;
  try {
    const p = JSON.parse(row.newValue) as { v?: unknown; s?: unknown; m?: unknown; d?: unknown; c?: unknown };
    if (typeof p.v !== "string" || typeof p.s !== "string") return null;
    const method = (typeof p.m === "string" && METHODS.has(p.m) ? p.m : "unknown") as ExtractionMethod;
    return { field, value: p.v, source: p.s, method, document: typeof p.d === "string" ? p.d : null, confidence: typeof p.c === "number" ? p.c : null, auctionId: row.auctionId, observedAt: row.detectedAt };
  } catch {
    return null;
  }
}

/** One series per field + round + source + method: that is what "unchanged" is compared within. */
const seriesKey = (o: Pick<FieldObservation, "field" | "auctionId" | "source" | "method">) => `${o.field}|${o.auctionId ?? ""}|${o.source}|${o.method}`;

/**
 * Which candidate observations are NEW facts? A candidate is skipped when the newest stored observation of the same series
 * (field, round, source, method) already has the same value; so re-reading an unchanged listing adds nothing, a changed value
 * adds one row, and a second source (or method) is a series of its own.
 * `stored` must be NEWEST FIRST. Candidates must already carry their auctionId.
 */
export function planObservations(candidates: FieldObservation[], stored: StoredObservation[]): FieldObservation[] {
  const latest = new Map<string, string>();
  for (const s of stored) {
    const k = seriesKey(s);
    if (!latest.has(k)) latest.set(k, keyOf(s.field, s.value));
  }
  const out: FieldObservation[] = [];
  for (const c of candidates) {
    const k = seriesKey(c);
    const v = keyOf(c.field, c.value);
    if (latest.get(k) === v) continue;
    latest.set(k, v); // a repeat inside the same batch is the same fact
    out.push(c);
  }
  return out;
}

export interface ObservationStore {
  /** Stored observations of one property, NEWEST FIRST. */
  latest(propertyId: string): Promise<StoredObservation[]>;
  append(propertyId: string, rows: { field: string; auctionId: string | null; newValue: string; detectedAt: Date }[]): Promise<void>;
}

/** Records the observations of `candidates` that are new facts. Returns how many rows were written. Never throws. */
export async function recordObservations(store: ObservationStore, target: { propertyId: string; auctionId: string | null }, candidates: FieldObservation[], now: Date = new Date()): Promise<number> {
  try {
    if (!candidates.length) return 0;
    const placed = candidates.map((c) => ({ ...c, auctionId: AUCTION_LEVEL_FIELDS.has(c.field) ? target.auctionId : null }));
    const fresh = planObservations(placed, await store.latest(target.propertyId));
    if (!fresh.length) return 0;
    await store.append(target.propertyId, fresh.map((o) => ({ ...encodeObservation(o), auctionId: o.auctionId ?? null, detectedAt: now })));
    return fresh.length;
  } catch {
    return 0;
  }
}

