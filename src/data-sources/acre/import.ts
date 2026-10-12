import { prisma } from "@/lib/db/prisma";
import { importRecords } from "@/lib/import/csvImport";
import { fetchWithRetry, describeStatus, isRefusal } from "@/lib/fetch/httpStatus";
import { RobotsGate } from "@/data-sources/feeds/robotsGate";
import { UA } from "@/data-sources/feeds/webScan";
import { ACRE_HOST, ACRE_LIST_URL, parseAcrePage } from "./parse";
import type { ListingRecord } from "@/lib/import/csvImport";

/*
 * ACRE "Assets for sale": reads the public list page by page (following the page's own "Next" link), parses every card and imports the
 * listings through the normal idempotent importer (source id src:acreindia.in:<asset id>), so a re-run never duplicates. robots.txt
 * is checked first; a refusal (robots, 401, 403, CAPTCHA) stops the run and is never retried or worked around. One request every
 * 1.5 seconds, at most 40 pages.
 */

export const isAcreUrl = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, "") === ACRE_HOST; } catch { return false; }
};

export interface AcreRun { pages: number; found: number; created: number; updated: number; skipped: number; rejected: number; total: number | null; complete: boolean; message: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runAcreImport(feed: { id: string; name: string; url: string }, o: { apply: boolean; maxPages?: number; log?: (l: string) => void }): Promise<AcreRun> {
  const say = o.log ?? (() => undefined);
  const out: AcreRun = { pages: 0, found: 0, created: 0, updated: 0, skipped: 0, rejected: 0, total: null, complete: false, message: "" };
  const finish = async (message: string, ok: boolean): Promise<AcreRun> => {
    out.message = message;
    if (o.apply) await prisma.feedSource.update({ where: { id: feed.id }, data: { lastMessage: message.slice(0, 1500), lastStatus: ok ? "ok" : "error", lastRunAt: new Date(), ...(ok ? {} : {}) } }).catch(() => undefined);
    return out;
  };

  const gate = new RobotsGate();
  const decision = await gate.check(ACRE_LIST_URL);
  if (decision !== "allowed") return finish(`Stopped: robots.txt check for ${ACRE_LIST_URL} returned ${decision}. Not bypassed.`, false);

  let url: string | null = ACRE_LIST_URL;
  const seen = new Set<string>();
  const maxPages = Math.min(o.maxPages ?? 40, 40);
  while (url && out.pages < maxPages && !seen.has(url)) {
    seen.add(url);
    const got = await fetchWithRetry(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) }, { onLog: (l) => say(`[acre] ${l}`) });
    if (isRefusal(got.status)) return finish(`Blocked: ${describeStatus(got.status, got.http)} The import is stopped and is not retried or worked around.`, false);
    if (got.status !== "success" || !got.res?.ok) return finish(`Temporary problem on page ${out.pages + 1}: ${got.res ? describeStatus("temporary_error", got.res.status) : describeStatus(got.status, null)} The next run continues.`, false);

    const page = parseAcrePage(await got.res.text(), url);
    out.pages += 1;
    out.found += page.records.length;
    out.rejected += page.rejected;
    out.total ??= page.total;
    say(`[acre] page ${out.pages}: ${page.records.length} listings (of ${page.total ?? "?"})`);
    if (page.records.length === 0) break;

    if (o.apply && page.records.length) {
      const r = await importRecords(page.records as ListingRecord[], `feed:${feed.name}`, "PUBLISHED", ACRE_LIST_URL, { enrich: true, strict: true, method: "html" });
      out.created += r.created;
      out.updated += r.updated ?? 0;
      out.skipped += Math.max(0, r.skipped - (r.updated ?? 0));
      out.rejected += r.failed;
    }
    url = page.nextUrl;
    if (url) await sleep(1_500);
  }
  out.complete = !url;
  const counts = `${out.pages} page(s), ${out.found} listing(s) found${out.total !== null ? ` of ${out.total}` : ""}${o.apply ? `, ${out.created} new, ${out.updated} updated, ${out.skipped} already on the site` : " (dry run: nothing imported)"}, ${out.rejected} rejected.`;
  return finish(`${out.complete ? "Complete" : "Partial"}: ${counts}`, true);
}
