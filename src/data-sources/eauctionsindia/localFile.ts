import type { ListingRecord } from "@/lib/import/csvImport";
import { parseEauctionsPage } from "./parse";
import { pagesAuthorization } from "./import";
import { pageSaysMaharashtra, unwrapViewSource } from "./maharashtra";

/*
 * Import from ONE page the owner saved by hand (no request to the site). Preview is the default and never writes. A write needs ALL of:
 *   EAUCTIONS_AUTHORIZED=yes, EAUCTIONS_AUTH_NOTE (where the operator's written permission is kept),
 *   EAUCTIONS_SCOPE_LOCAL_FILE=yes (set it ONLY after reading the operator's wording and finding that it covers hand-saved pages),
 *   the explicit --import flag, a page that names Maharashtra, and a limit (default 12, hard cap 50).
 * The source is registered as RESTRICTED (registry.ts): that status is never changed here, so without the scope flag nothing is written.
 */
export const LOCAL_DEFAULT_LIMIT = 12;
export const LOCAL_HARD_CAP = 50;
export const ID_PREFIX = "src:eauctionsindia.com:";

type Env = Record<string, string | undefined>;

export const localLimit = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? LOCAL_DEFAULT_LIMIT : Math.max(1, Math.min(LOCAL_HARD_CAP, Math.floor(n))));

/** Pure. Why a write is refused, or ok. */
export function localWriteAllowed(env: Env, importFlag: boolean): { ok: true } | { ok: false; reason: string } {
  if (!importFlag) return { ok: false, reason: "Preview only: nothing is written without the explicit --import flag." };
  const auth = pagesAuthorization(env);
  if (!auth.ok) return { ok: false, reason: auth.reason };
  if (env.EAUCTIONS_SCOPE_LOCAL_FILE?.trim() !== "yes") return { ok: false, reason: "Writing is disabled: the operator's written permission has not been confirmed to cover pages saved by hand (EAUCTIONS_SCOPE_LOCAL_FILE is not \"yes\"). The source is RESTRICTED in the registry." };
  return { ok: true };
}

export interface LocalPlan {
  ok: boolean;
  reason?: string;
  cards: number;
  rejected: number;
  headlineTotal: number | null;
  lastPage: number | null;
  /** ids found twice on the page (dropped). */
  duplicatesInFile: number;
  /** records that would be sent, after the limit. */
  toSend: ListingRecord[];
  /** ids from the page already in the database (read-only query), when a lookup was given. */
  alreadyInDatabase: string[] | null;
  newToDatabase: number | null;
  limit: number;
}

/** Read-only plan. `existingIds` is an optional read-only database lookup; without it the duplicate report says "not checked". */
export async function planLocalImport(rawHtml: string, o: { limit?: number; existingIds?: (ids: string[]) => Promise<string[]> } = {}): Promise<LocalPlan> {
  const html = unwrapViewSource(rawHtml);
  const limit = localLimit(o.limit);
  const empty = { cards: 0, rejected: 0, headlineTotal: null, lastPage: null, duplicatesInFile: 0, toSend: [], alreadyInDatabase: null, newToDatabase: null, limit };
  if (!pageSaysMaharashtra(html)) return { ok: false, reason: "The page does not name Maharashtra in its heading or title: not imported as Maharashtra.", ...empty };
  const page = parseEauctionsPage(html, "");
  const seen = new Set<string>();
  const unique: ListingRecord[] = [];
  for (const r of page.records) {
    const id = String(r.external_id);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push({ ...r, geo_state: "Maharashtra" });
  }
  if (!unique.length) return { ok: false, reason: "No listing cards the parser could read.", ...empty, rejected: page.rejected, headlineTotal: page.headlineTotal, lastPage: page.lastPage };
  const toSend = unique.slice(0, limit);
  let already: string[] | null = null;
  if (o.existingIds) { const have = new Set(await o.existingIds(toSend.map((r) => String(r.external_id)))); already = toSend.map((r) => String(r.external_id)).filter((id) => have.has(id)); }
  return { ok: true, cards: unique.length, rejected: page.rejected, headlineTotal: page.headlineTotal, lastPage: page.lastPage, duplicatesInFile: page.records.length - unique.length, toSend, alreadyInDatabase: already, newToDatabase: already ? toSend.length - already.length : null, limit };
}

export interface LocalWriteResult { written: boolean; message: string; created: number; updated: number; skipped: number; failed: number }

/** The only write path of the local-file import. Every refusal returns before `importBatch` is called. */
export async function writeLocalImport(plan: Pick<LocalPlan, "ok" | "reason" | "toSend" | "limit">, env: Env, importFlag: boolean, importBatch: (r: ListingRecord[]) => Promise<{ created: number; updated: number; skipped: number; failed: number }>): Promise<LocalWriteResult> {
  const none = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const gate = localWriteAllowed(env, importFlag);
  if (!gate.ok) return { written: false, message: gate.reason, ...none };
  if (!plan.ok || !plan.toSend.length) return { written: false, message: plan.reason ?? "Nothing to import.", ...none };
  const r = await importBatch(plan.toSend);
  return { written: true, message: `Sent ${plan.toSend.length} record(s) from a hand-saved page (limit ${plan.limit}) to the importer: ${r.created} new, ${r.updated} updated, ${r.skipped} already on the site, ${r.failed} failed. This is a manual file import, not a live-site run, and not Maharashtra coverage.`, ...r };
}
