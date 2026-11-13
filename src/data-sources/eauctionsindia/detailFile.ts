import type { ListingRecord } from "@/lib/import/csvImport";
import { localLimit } from "./localFile";
import { parseEauctionsDetail, type EauctionsDetail } from "./parseDetail";

/*
 * Read-only planning for hand-saved eAuctionsIndia DETAIL pages (one /properties/<id> page per file). Several files are de-duplicated by the
 * canonical source auction id. Writing goes through localFile.ts (same gate: --import, EAUCTIONS_AUTHORIZED, EAUCTIONS_AUTH_NOTE,
 * EAUCTIONS_SCOPE_LOCAL_FILE) and `importRecords`; nothing here writes.
 */
export interface DetailFileResult { file: string; detail: EauctionsDetail; duplicateOf: string | null }
export interface DetailPlan {
  files: DetailFileResult[];
  /** valid, unique, in the required state, within the limit */
  toSend: ListingRecord[];
  valid: number;
  invalid: number;
  duplicatesAmongFiles: number;
  /** valid records beyond the limit (not planned) */
  overLimit: number;
  limit: number;
  alreadyInDatabase: string[] | null;
  newToDatabase: number | null;
  ok: boolean;
  reason?: string;
}

export async function planDetailFiles(
  inputs: Array<{ name: string; html: string }>,
  o: { limit?: number; onlyState?: string; existingIds?: (ids: string[]) => Promise<string[]> } = {},
): Promise<DetailPlan> {
  const limit = localLimit(o.limit);
  const wanted = o.onlyState ?? "Maharashtra";
  const firstById = new Map<string, string>();
  const files: DetailFileResult[] = [];
  const unique: ListingRecord[] = [];
  let invalid = 0;
  let dups = 0;
  for (const f of inputs) {
    const detail = parseEauctionsDetail(f.html);
    if (detail.ok && wanted && detail.state.toLowerCase() !== wanted.toLowerCase()) {
      detail.ok = false;
      detail.record = null;
      detail.errors.push(`State "${detail.state || "(none)"}" is not ${wanted}; not planned.`);
    }
    let duplicateOf: string | null = null;
    if (detail.ok && detail.record) {
      const id = String(detail.record.external_id);
      if (firstById.has(id)) { duplicateOf = firstById.get(id)!; dups++; }
      else { firstById.set(id, f.name); unique.push(detail.record); }
    } else invalid++;
    files.push({ file: f.name, detail, duplicateOf });
  }
  const toSend = unique.slice(0, limit);
  let already: string[] | null = null;
  if (o.existingIds && toSend.length) {
    const ids = toSend.map((r) => String(r.external_id));
    const have = new Set(await o.existingIds(ids));
    already = ids.filter((i) => have.has(i));
  }
  return {
    files, toSend, valid: unique.length, invalid, duplicatesAmongFiles: dups, overLimit: Math.max(0, unique.length - toSend.length), limit,
    alreadyInDatabase: already, newToDatabase: already ? toSend.length - already.length : null,
    ok: toSend.length > 0, reason: toSend.length ? undefined : "No valid property page to import.",
  };
}
