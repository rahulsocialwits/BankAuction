import { parseEauctionsPage } from "./parse";
import { parseEauctionsDetail } from "./parseDetail";
import { pageSaysMaharashtra, unwrapViewSource } from "./maharashtra";

/*
 * Read-only reconciliation of a saved LIST page against saved DETAIL pages (nothing is requested, nothing is written).
 *   list ids      every /properties/<id> card on the list page(s)
 *   detail files  one /properties/<id> page per file; the same id in two files counts once (key src:eauctionsindia.com:<id>)
 * Per listing: DETAIL_COMPLETE, DETAIL_INCOMPLETE (valid page, some fields empty: they are named, never filled in), DETAIL_INVALID (the file has
 * errors) or MISSING_DETAIL. Detail pages whose id is not on the list are reported separately, not hidden. A price or date that differs between the
 * list card and the detail page is a MISMATCH and is shown; neither value is chosen silently.
 */
export const COMPLETE_FIELDS = ["emd", "auctionStart", "auctionEnd", "bank", "borrower", "description", "state", "city", "area"] as const;
type CompleteField = (typeof COMPLETE_FIELDS)[number];

export type ReconStatus = "DETAIL_COMPLETE" | "DETAIL_INCOMPLETE" | "DETAIL_INVALID" | "MISSING_DETAIL";

export interface ReconRow {
  key: string;
  id: string;
  listTitle: string;
  status: ReconStatus;
  file: string | null;
  missingFields: string[];
  mismatches: string[];
  errors: string[];
}

export interface ReconReport {
  listPages: number;
  listIds: number;
  duplicateListIds: number;
  detailFiles: number;
  duplicateDetailFiles: Array<{ file: string; duplicateOf: string; key: string }>;
  rows: ReconRow[];
  counts: Record<ReconStatus, number>;
  /** detail pages whose id is not on the list page(s) */
  detailNotInList: Array<{ file: string; key: string }>;
  invalidFiles: Array<{ file: string; errors: string[] }>;
  listSaysMaharashtra: boolean;
  /** only listings with a complete, valid detail page */
  readyKeys: string[];
}

const KEY = (id: string) => `src:eauctionsindia.com:${id}`;

export function reconcile(lists: Array<{ name: string; html: string }>, details: Array<{ name: string; html: string }>): ReconReport {
  const listRows = new Map<string, { title: string; reserve: string; start: string }>();
  let dupList = 0;
  let allMaha = lists.length > 0;
  for (const l of lists) {
    const html = unwrapViewSource(l.html);
    if (!pageSaysMaharashtra(html)) allMaha = false;
    for (const r of parseEauctionsPage(html, "").records) {
      const k = String(r.external_id);
      if (listRows.has(k)) { dupList++; continue; }
      listRows.set(k, { title: String(r.title ?? ""), reserve: String(r.reserve_price ?? ""), start: String(r.auction_start ?? "") });
    }
  }

  const byKey = new Map<string, { file: string; d: ReturnType<typeof parseEauctionsDetail> }>();
  const dupFiles: ReconReport["duplicateDetailFiles"] = [];
  const invalidFiles: ReconReport["invalidFiles"] = [];
  for (const f of details) {
    const d = parseEauctionsDetail(f.html);
    if (!d.ok || !d.id) { invalidFiles.push({ file: f.name, errors: d.errors }); if (d.id) byKey.set(KEY(d.id), byKey.get(KEY(d.id)) ?? { file: f.name, d }); continue; }
    const key = KEY(d.id);
    const had = byKey.get(key);
    if (had && had.d.ok) { dupFiles.push({ file: f.name, duplicateOf: had.file, key }); continue; }
    byKey.set(key, { file: f.name, d });
  }

  const rows: ReconRow[] = [];
  for (const [key, l] of listRows) {
    const id = key.split(":").pop()!;
    const hit = byKey.get(key);
    if (!hit) { rows.push({ key, id, listTitle: l.title, status: "MISSING_DETAIL", file: null, missingFields: [], mismatches: [], errors: [] }); continue; }
    const d = hit.d;
    if (!d.ok) { rows.push({ key, id, listTitle: l.title, status: "DETAIL_INVALID", file: hit.file, missingFields: [], mismatches: [], errors: d.errors }); continue; }
    const missing = COMPLETE_FIELDS.filter((f: CompleteField) => !String(d[f] ?? "").trim());
    const mism: string[] = [];
    if (l.reserve && d.reservePrice && l.reserve !== d.reservePrice) mism.push(`reserve price: list ${l.reserve} vs detail ${d.reservePrice}`);
    if (l.start && d.auctionStart && l.start !== d.auctionStart) mism.push(`auction start: list ${l.start} vs detail ${d.auctionStart}`);
    rows.push({ key, id, listTitle: l.title, status: missing.length ? "DETAIL_INCOMPLETE" : "DETAIL_COMPLETE", file: hit.file, missingFields: missing, mismatches: mism, errors: [] });
  }

  const counts: Record<ReconStatus, number> = { DETAIL_COMPLETE: 0, DETAIL_INCOMPLETE: 0, DETAIL_INVALID: 0, MISSING_DETAIL: 0 };
  for (const r of rows) counts[r.status]++;
  return {
    listPages: lists.length,
    listIds: listRows.size,
    duplicateListIds: dupList,
    detailFiles: details.length,
    duplicateDetailFiles: dupFiles,
    rows,
    counts,
    detailNotInList: [...byKey].filter(([k, v]) => !listRows.has(k) && v.d.ok).map(([key, v]) => ({ file: v.file, key })),
    invalidFiles,
    listSaysMaharashtra: allMaha,
    readyKeys: rows.filter((r) => r.status === "DETAIL_COMPLETE" && r.mismatches.length === 0).map((r) => r.key),
  };
}
