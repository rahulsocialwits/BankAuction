/*
 * Pure helpers for the admin "Run health" page: tick gaps and an honest label for what a source last reported.
 * The wording never calls a robots.txt timeout a block, and never shows "healthy" for a source that read nothing.
 */

export interface TickSummary { count: number; last: Date | null; maxGapMin: number | null; gapsOver20: number }

export function summarizeTicks(times: Date[], gapLimitMin = 20): TickSummary {
  const t = [...times].sort((a, b) => a.getTime() - b.getTime());
  let maxGap = 0;
  let over = 0;
  for (let i = 1; i < t.length; i++) {
    const g = (t[i].getTime() - t[i - 1].getTime()) / 60000;
    if (g > maxGap) maxGap = g;
    if (g > gapLimitMin) over++;
  }
  return { count: t.length, last: t.length ? t[t.length - 1] : null, maxGapMin: t.length > 1 ? Math.round(maxGap) : null, gapsOver20: over };
}

export type SourceKind = "healthy" | "unchanged" | "zero_yield" | "unknown_permission" | "refused" | "error" | "off";
export interface SourceLabel { kind: SourceKind; label: string; action: string }

export function classifySourceMessage(active: boolean, lastStatus: string | null, message: string | null): SourceLabel {
  const m = (message ?? "").toLowerCase();
  if (!active) return { kind: "off", label: "Off", action: m.includes("blocked") ? "Paused after the site refused automated access. Do not retry; look for an official feed or use manual Bulk Import." : "Switched off in Admin → Feeds." };
  if (!lastStatus) return { kind: "unknown_permission", label: "Never run", action: "Not tested yet." };
  if (/robots\.txt says|not allowed|access (denied|refused)|http 40[13]|captcha|verification/.test(m) && !/gave no answer|timeout/.test(m)) {
    return { kind: "refused", label: "Refused by the site", action: "The site said no to automated access. It is not retried or worked around: use an official feed, a permitted notice, or manual Bulk Import." };
  }
  if (/gave no answer|timeout|timed out/.test(m)) return { kind: "unknown_permission", label: "Permission unknown", action: "robots.txt did not answer in time. This is NOT a confirmed block; it is tried again on the next run." };
  if (lastStatus === "error") return { kind: "error", label: "Error", action: "Temporary or technical error; see the message. It is tried again on the next run." };
  if (/zero_yield|0 listing page|found 0|no group of addresses/.test(m)) return { kind: "zero_yield", label: "Read, found nothing", action: "The page was read but no listings were found (it may load them with JavaScript). Check the source URL or use manual Bulk Import." };
  if (/unchanged|no changes/.test(m)) return { kind: "unchanged", label: "Unchanged", action: "The page has not changed since the last run, so AI was skipped on purpose." };
  return { kind: "healthy", label: "OK", action: "" };
}

/**
 * The line an admin sees on a source card. A source that is waiting for authorisation, or that the site refused, must not show a
 * stale "Site scan: 0 listing page(s) found ... JavaScript" note: that reads like a scanner problem, while the real state is "the site
 * does not allow automated access".
 */
export function friendlyFeedMessage(opts: { awaitingAuthorization: boolean; active: boolean; message: string | null }): string | null {
  const m = opts.message ?? "";
  if (opts.awaitingAuthorization) {
    return "Awaiting authorization: this website answers automated access with a Cloudflare challenge, so nothing is requested from it. It needs written permission, an API / licensed feed or an export from the site owner (see docs/launch/SOURCE_ACCESS_STATUS.md).";
  }
  if (!opts.active && /refused by robots\.txt or the site|robots\.txt says|CAPTCHA|challenge page/i.test(m)) {
    return "Blocked: the website refused automated access (robots.txt or a verification page). It is paused and not retried or worked around.";
  }
  return opts.message;
}
