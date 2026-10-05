/*
 * robots.txt rules, one implementation for every crawler of this project (RFC 9309 matching).
 *   - the group that names our bot ("bankauctionbot") wins over "*"; groups with the same name are merged;
 *   - a pattern may use `*` (any characters) and a trailing `$` (end of the address); everything else is a literal prefix;
 *   - the LONGEST matching pattern wins; when an Allow and a Disallow match with the same length, Allow wins;
 *   - an empty "Disallow:" means "nothing is disallowed".
 * Pure functions: no network, no database (unit-tested in tests/robotsRules.test.ts).
 */

export const BOT_NAME = "bankauctionbot";

export interface RobotsGroup {
  agents: string[];
  disallow: string[];
  allow: string[];
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  /** Crawl-delay in seconds that applies to us (0 = none stated). */
  delay: number;
  sitemaps: string[];
}

export function parseRobots(body: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let cur: RobotsGroup | null = null;
  let lastWasAgent = false;
  let delay = 0;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "sitemap") { if (val) sitemaps.push(val); continue; }
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
    if (key === "crawl-delay" && (cur.agents.includes("*") || cur.agents.some(isOurs))) delay = Math.max(delay, Number(val) || 0);
  }
  return { groups, delay, sitemaps };
}

/** "bankauctionbot" or "bankauctionbot/1.0" name us; "bot" or "a" do not. */
const isOurs = (agent: string) => agent === BOT_NAME || agent.replace(/\/.*$/, "") === BOT_NAME;

/** A robots.txt pattern (`*` wildcard, `$` end anchor) as a regular expression anchored at the start of path + query. */
export function robotsPattern(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

export const robotsMatch = (pattern: string, path: string): boolean => robotsPattern(pattern).test(path);

export interface RobotsDecision {
  allowed: boolean;
  /** The rule that decided it, for the log ("Disallow: /search/*"); null when no rule matched. */
  rule: string | null;
}

/** Is `pathAndQuery` (for example "/auction/abc?page=2") allowed for our bot? */
export function robotsDecision(groups: RobotsGroup[], pathAndQuery: string): RobotsDecision {
  const ours = groups.filter((g) => g.agents.some(isOurs));
  const applicable = ours.length ? ours : groups.filter((g) => g.agents.includes("*"));
  let bestLen = -1;
  let allowed = true;
  let rule: string | null = null;
  for (const g of applicable) {
    for (const p of g.disallow) if (robotsMatch(p, pathAndQuery) && p.length > bestLen) { bestLen = p.length; allowed = false; rule = `Disallow: ${p}`; }
    for (const p of g.allow) if (robotsMatch(p, pathAndQuery) && p.length >= bestLen) { bestLen = p.length; allowed = true; rule = `Allow: ${p}`; }
  }
  return { allowed, rule };
}

/** Convenience: parse a robots.txt body and decide one address. */
export function robotsAllows(body: string, url: string): RobotsDecision {
  const u = new URL(url);
  return robotsDecision(parseRobots(body).groups, u.pathname + u.search);
}
