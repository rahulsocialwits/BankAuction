import { UA } from "./webScan";
import { fetchWithRetry, robotsSkipLine } from "@/lib/fetch/httpStatus";
import { parseRobots, robotsDecision, type RobotsGroup } from "@/lib/fetch/robotsRules";

/**
 * robots.txt read ONCE per site and checked for every address after that (the plain robotsCheck in webScan.ts fetches the
 * file on every call, which is too many requests for a whole-site scan). Same rules as there:
 *  - a rule for "bankauctionbot" wins over "*"; the longest matching Allow/Disallow wins;
 *  - HTTP 401/403 on robots.txt = disallowed; 4xx = no rules = allowed; timeout / 5xx = "unreachable" (a temporary problem).
 */
type Entry = { kind: "rules"; groups: RobotsGroup[]; delay: number } | { kind: "disallowed" } | { kind: "unreachable" };

export class RobotsGate {
  private cache = new Map<string, Entry>();

  private async load(origin: string): Promise<Entry> {
    let e = this.cache.get(origin);
    if (e) return e;
    // a 429 / 503 on robots.txt gets the one polite retry; if the site still does not answer it is "unreachable" (temporary), never "blocked"
    const out = await fetchWithRetry(`${origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) }, { inspectBody: false, onLog: (l) => console.log(`[crawler] ${l}`) });
    const res = out.res;
    if (out.status === "unauthorized" || out.status === "forbidden") e = { kind: "disallowed" };
    else if (!res) e = { kind: "unreachable" };
    else if (res.status >= 400 && res.status < 500 && res.status !== 429) e = { kind: "rules", groups: [], delay: 0 };
    else if (!res.ok) e = { kind: "unreachable" };
    else {
      const parsed = parseRobots(await res.text());
      e = { kind: "rules", groups: parsed.groups, delay: parsed.delay };
    }
    this.cache.set(origin, e);
    return e;
  }

  async check(url: string): Promise<"allowed" | "disallowed" | "unreachable"> {
    const u = new URL(url);
    const e = await this.load(u.origin);
    if (e.kind === "disallowed") return "disallowed";
    if (e.kind === "unreachable") return "unreachable";
    const decision = robotsDecision(e.groups, u.pathname + u.search);
    if (!decision.allowed) console.log(`[crawler] ${robotsSkipLine(url, decision.rule)}`);
    return decision.allowed ? "allowed" : "disallowed";
  }

  /** The site's own Crawl-delay (seconds), 0 when it states none. Call after check(). */
  async delayFor(url: string): Promise<number> {
    const e = this.cache.get(new URL(url).origin);
    return e?.kind === "rules" ? e.delay : 0;
  }
}
