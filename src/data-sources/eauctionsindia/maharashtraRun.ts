import { fetchWithRetry, describeStatus, isRefusal, type FetchOutcome } from "@/lib/fetch/httpStatus";
import { RobotsGate } from "@/data-sources/feeds/robotsGate";
import type { ListingRecord } from "@/lib/import/csvImport";
import { pagesAuthorization, requestHeaders } from "./import";
import { parseEauctionsPage } from "./parse";
import { checkStartUrl, clampSample, nextPageUrl, pageSaysMaharashtra, SAMPLE_MAX_PAGES } from "./maharashtra";

export type MhState = "awaiting_authorization" | "bad_address" | "not_maharashtra" | "temporarily_unavailable" | "connected_no_listings" | "dry_ok" | "sample_ok" | "interrupted";

export interface MhResult { state: MhState; message: string; pages: number; found: number; duplicates: number; rejected: number; imported: { created: number; updated: number; skipped: number; failed: number } }

export interface MhDeps {
  env: Record<string, string | undefined>;
  /** Writes the sample to the database. Absent in a dry run: a dry run cannot write. */
  importBatch?: (records: ListingRecord[]) => Promise<{ created: number; updated: number; skipped: number; failed: number }>;
  fetchPage?: (url: string, headers: Record<string, string>) => Promise<FetchOutcome>;
  robots?: (url: string) => Promise<"allowed" | "disallowed" | "unreachable">;
  sleep?: (ms: number) => Promise<void>;
  stopped?: () => boolean;
  log?: (l: string) => void;
}

/**
 * Read-only for "dry" (reads at most 2 pages, imports nothing, saves nothing); "sample" imports at most `sampleRecords` (hard cap 50) from at most 3 pages.
 * There is no full mode here on purpose. Every refusal (permission note, robots.txt, 401/403, CAPTCHA/challenge) stops the run: no retry, no other route.
 */
export async function runMaharashtra(o: { mode: "dry" | "sample"; url?: string; sampleRecords?: number }, d: MhDeps): Promise<MhResult> {
  const say = d.log ?? (() => undefined);
  const out: MhResult = { state: "dry_ok", message: "", pages: 0, found: 0, duplicates: 0, rejected: 0, imported: { created: 0, updated: 0, skipped: 0, failed: 0 } };
  const fail = (state: MhState, message: string) => { out.state = state; out.message = message; return out; };

  const auth = pagesAuthorization(d.env);
  if (!auth.ok) return fail("awaiting_authorization", `Awaiting authorization: ${auth.reason}`);
  const start = checkStartUrl(o.url ?? d.env.EAUCTIONS_MAHARASHTRA_URL);
  if (!start.ok) return fail("bad_address", start.reason);
  // Writing from a remote run needs its own scope flag: the operator's approved access method must be configured first (default off).
  if (o.mode === "sample" && d.env.EAUCTIONS_SCOPE_AUTOMATED?.trim() !== "yes") return fail("awaiting_authorization", "Automated import is disabled: EAUCTIONS_SCOPE_AUTOMATED is not \"yes\" (set it only after the operator has approved automated access in writing and the access method is configured). A dry run (--dry) is still available. Nothing was requested.");

  const headers = requestHeaders(d.env);
  const gate = new RobotsGate({ challengeIsRefusal: true, headers });
  const robots = d.robots ?? ((u: string) => gate.check(u));
  const decision = await robots(start.url);
  if (decision !== "allowed") return fail("awaiting_authorization", `Awaiting authorization: robots/access check returned "${decision}" (robots.txt itself was refused or challenged with HTTP 403, or a rule disallows this path; the page was never requested). The site must allow-list BankAuctionBot/1.0 (or lift the challenge). Nothing else was requested; not retried, not worked around.`);

  const delay = Math.max(1_000, Number(d.env.EAUCTIONS_DELAY_MS) || 1_500);
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const fetchPage = d.fetchPage ?? ((url, h) => fetchWithRetry(url, { headers: h, signal: AbortSignal.timeout(30_000) }, { onLog: say }));
  const limit = o.mode === "sample" ? clampSample(o.sampleRecords) : 0;
  const maxPages = o.mode === "sample" ? SAMPLE_MAX_PAGES : 2;
  if (o.mode === "sample" && !d.importBatch) return fail("bad_address", "Sample mode needs a database writer; none was given.");

  const seenIds = new Set<string>();
  const visited = new Set<string>();
  let url: string | null = start.url;
  let taken = 0;

  while (url && out.pages < maxPages) {
    if (d.stopped?.()) return fail("interrupted", `Stopped on request after ${out.pages} page(s); nothing is half-written (each page is imported whole).`);
    visited.add(url);
    const got = await fetchPage(url, headers);
    if (isRefusal(got.status)) return fail("awaiting_authorization", `Awaiting authorization: ${describeStatus(got.status, got.http)} Not retried and not worked around.${d.env.EAUCTIONS_ALLOW_HEADER_NAME ? " The allow-list header was sent and was still refused: the operator's rule does not match it." : ""}`);
    if (got.status !== "success" || !got.res?.ok) return fail("temporarily_unavailable", `Temporarily unavailable: ${got.res ? describeStatus("temporary_error", got.res.status) : describeStatus(got.status, null)} Nothing was imported from this page.`);

    const html = await got.res.text();
    if (!pageSaysMaharashtra(html)) return fail("not_maharashtra", `The page ${url} does not name Maharashtra in its heading or title, so nothing was imported. Check that --url is the Maharashtra listing page (list pages carry no state field, so the page itself must say so).`);
    const page = parseEauctionsPage(html, "") // no site category: this list mixes property types, an unknown type must stay unclassified, never "residential";
    out.pages += 1;
    out.rejected += page.rejected;
    say(`page ${out.pages}: ${page.records.length} listings, ${page.rejected} rejected${page.headlineTotal ? `, headline total ${page.headlineTotal}` : ""}`);
    if (page.records.length === 0) { if (out.pages === 1) return fail("connected_no_listings", "Connected, but the first page had no listings the parser could read (layout changed, or not a listing page)."); break; }

    const fresh: ListingRecord[] = [];
    for (const r of page.records) {
      const id = String(r.external_id);
      if (seenIds.has(id)) { out.duplicates += 1; continue; }
      seenIds.add(id);
      fresh.push({ ...r, geo_state: "Maharashtra" });
    }
    out.found += fresh.length;

    if (o.mode === "sample") {
      const batch = fresh.slice(0, Math.max(0, limit - taken));
      taken += batch.length;
      if (batch.length) {
        const r = await d.importBatch!(batch);
        for (const k of ["created", "updated", "skipped", "failed"] as const) out.imported[k] += r[k];
      }
      if (taken >= limit) break;
    }
    url = nextPageUrl(page.nextUrl, url, visited);
    if (url && out.pages < maxPages) await sleep(delay);
  }

  out.state = o.mode === "sample" ? "sample_ok" : "dry_ok";
  out.message = o.mode === "dry"
    ? `Dry run OK: ${out.pages} page(s) read, ${out.found} Maharashtra listings parsed, ${out.duplicates} duplicates skipped, ${out.rejected} rejected. Nothing was imported or saved.`
    : `Sample done: ${out.pages} page(s) read, ${taken} listings sent to the importer (${out.imported.created} new, ${out.imported.updated} updated, ${out.imported.skipped} already on the site, ${out.imported.failed} failed). No cursor saved; no full import started.`;
  return out;
}
