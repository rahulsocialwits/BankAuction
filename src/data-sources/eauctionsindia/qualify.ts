import type { ListingRecord } from "@/lib/import/csvImport";
import type { Collected } from "./bulkPipeline";
import { matchInstitution, type MappingRow } from "./institutions";
import { validateMaharashtra, type LocationVerdict } from "./maharashtraLocation";

/*
 * The two gates a collected eAuctionsIndia listing must pass before it may be imported:
 *   1. institution: its institution must equal one of the CONFIRMED rows of the 105-entry reconciliation (exact match after normalisation, never similar names);
 *   2. location: its own location must be positively verified as Maharashtra (maharashtraLocation.ts). The page a listing was found on, the bank and the branch are not evidence.
 * What fails a gate is not imported; it is listed with the reason (and, when the evidence is missing or conflicting, flagged for review). Nothing is deleted.
 */

export type Exclusion = "institution_unknown" | "institution_not_verified" | "location_rejected" | "location_review";
export interface Excluded { key: string; id: string; title: string; bank: string; location: string; reason: Exclusion; detail: string }

export interface Qualified {
  records: Map<string, ListingRecord>;
  hasDetail: Set<string>;
  excluded: Excluded[];
  counts: { parsed: number; institutionMatched: number; maharashtraVerified: number; qualified: number; institutionExcluded: number; locationRejected: number; reviewRequired: number };
}

/** The location evidence of a listing. A detail page states the state itself; a list card does not (its "Maharashtra" tag only says which page it was found on), so only its place counts. */
export function locationInput(r: ListingRecord, fromDetail: boolean) {
  const place = String(r.location ?? "");
  const parts = place.split(",").map((x) => x.trim()).filter(Boolean);
  return {
    state: fromDetail ? String(r.geo_state ?? "") : "",
    city: String(r.geo_city ?? "") || (parts.length ? parts[parts.length - 1] : ""),
    area: String(r.geo_locality ?? "") || (parts.length > 1 ? parts[0] : ""),
    address: [place, fromDetail ? String(r.description ?? "") : ""].filter(Boolean).join(" "),
  };
}

export function qualify(c: Collected, mapping: MappingRow[], opts: { checkInstitution?: boolean } = {}): Qualified {
  const check = opts.checkInstitution !== false;
  const confirmed = new Set(mapping.filter((m) => m.status === "CONFIRMED").map((m) => m.original));
  const out: Qualified = { records: new Map(), hasDetail: new Set(), excluded: [], counts: { parsed: c.records.size, institutionMatched: 0, maharashtraVerified: 0, qualified: 0, institutionExcluded: 0, locationRejected: 0, reviewRequired: 0 } };

  for (const [key, r] of c.records) {
    const id = key.split(":").pop() ?? key;
    const ex = (reason: Exclusion, detail: string) => out.excluded.push({ key, id, title: String(r.title ?? ""), bank: String(r.bank ?? ""), location: String(r.location ?? ""), reason, detail });

    let instOk = true;
    const bank = String(r.bank ?? "").trim();
    if (check) {
      if (!bank) { instOk = false; out.counts.institutionExcluded++; out.counts.reviewRequired++; ex("institution_unknown", "the listing shows no institution, so it cannot be matched to a verified one"); }
      else if (!matchInstitution(bank).some((m) => confirmed.has(m.original))) { instOk = false; out.counts.institutionExcluded++; ex("institution_not_verified", `"${bank}" is not one of the institutions verified on eAuctionsIndia`); }
    }
    if (instOk) out.counts.institutionMatched++;

    const v: LocationVerdict = validateMaharashtra(locationInput(r, c.hasDetail.has(key)));
    if (v.verdict === "accept") out.counts.maharashtraVerified++;
    if (instOk && v.verdict === "reject") { out.counts.locationRejected++; ex("location_rejected", v.reasons.join("; ")); }
    else if (instOk && v.verdict === "review") { out.counts.reviewRequired++; ex("location_review", v.reasons.join("; ")); }
    if (instOk && v.verdict === "accept") { out.records.set(key, r); if (c.hasDetail.has(key)) out.hasDetail.add(key); }
  }
  out.counts.qualified = out.records.size;
  return out;
}
