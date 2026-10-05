import { UA } from "./webScan";

/**
 * robots.txt read ONCE per site and checked for every address after that (the plain robotsCheck in webScan.ts fetches the
 * file on every call, which is too many requests for a whole-site scan). Same rules as there:
 *  - a rule for "bankauctionbot" wins over "*"; the longest matching Allow/Disallow wins;
 *  - HTTP 401/403 on robots.txt = disallowed; 4xx = no rules = allowed; timeout / 5xx = "unreachable" (a temporary problem).
 */
type Group = { agents: string[]; disallow: string[]; allow: string[] };
type Entry = { kind: "rules"; groups: Group[]; delay: number } | { kind: "disallowed" } | { kind: "unreachable" };

function parse(body: string): { groups: Group[]; delay: number } {
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  let delay = 0;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], disallow: [], allow: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "disallow" && val) cur.disallow.push(val);
    if (key === "allow" && val) cur.allow.push(val);
    if (key === "crawl-delay" && (cur.agents.includes("*") || cur.agents.some((a) => "bankauctionbot".includes(a)))) delay = Math.max(delay, Number(val) || 0);
  }
  return { groups, delay };
}

/** A robots.txt pattern ("/listing/*\/sortby:recent", "$" end anchor) as a matcher for a path + query. */
function matches(pattern: string, path: string): boolean {
  const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  return re.test(path);
}

export class RobotsGate {
  private cache = new Map<string, Entry>();

  private async load(origin: string): Promise<Entry> {
    let e = this.cache.get(origin);
    if (e) return e;
    try {
      const res = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
      if (res.status === 401 || res.status === 403) e = { kind: "disallowed" };
      else if (res.status >= 400 && res.status < 500) e = { kind: "rules", groups: [], delay: 0 };
      else if (!res.ok) e = { kind: "unreachable" };
      else e = { kind: "rules", ...parse(await res.text()) };
    } catch {
      e = { kind: "unreachable" };
    }
    this.cache.set(origin, e);
    return e;
  }

  async check(url: string): Promise<"allowed" | "disallowed" | "unreachable"> {
    const u = new URL(url);
    const e = await this.load(u.origin);
    if (e.kind === "disallowed") return "disallowed";
    if (e.kind === "unreachable") return "unreachable";
    const ours = e.groups.filter((g) => g.agents.some((a) => a !== "*" && "bankauctionbot".includes(a)));
    const applicable = ours.length ? ours : e.groups.filter((g) => g.agents.includes("*"));
    const path = u.pathname + u.search;
    let bestLen = -1;
    let allowed = true;
    for (const g of applicable) {
      for (const p of g.disallow) if (matches(p, path) && p.length > bestLen) { bestLen = p.length; allowed = false; }
      for (const p of g.allow) if (matches(p, path) && p.length >= bestLen) { bestLen = p.length; allowed = true; }
    }
    return allowed ? "allowed" : "disallowed";
  }

  /** The site's own Crawl-delay (seconds), 0 when it states none. Call after check(). */
  async delayFor(url: string): Promise<number> {
    const e = this.cache.get(new URL(url).origin);
    return e?.kind === "rules" ? e.delay : 0;
  }
}
