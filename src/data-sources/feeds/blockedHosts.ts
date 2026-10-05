import { POLICY_PREFIX } from "@/lib/fetch/httpStatus";

// THE do-not-fetch list. A decision of THIS PROJECT (not something a website said): sites whose terms or robots.txt disallow
// copying. Never accepted as link sources, never requested, and listings that come from them (for example rows of a shared
// sheet whose source_url points there) are not imported either. Changing this list is a policy decision of the project owner.
export const BLOCKED_HOSTS = ["auctionbazaar.com", "bankauction.co"];

/** The list entry a hostname matches (exact host or any sub-domain), or null. */
export const denylistMatch = (hostname: string): string | null => BLOCKED_HOSTS.find((h) => hostname === h || hostname.endsWith("." + h)) ?? null;

export const isBlockedHost = (hostname: string) => denylistMatch(hostname) !== null;

export function isBlockedUrl(url: string): boolean {
  try {
    return isBlockedHost(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export type SourceUrlCheck = { ok: true; url: string } | { ok: false; reason: string; status?: "internal_policy_block" };

/** The message for an address our own configuration refused. It names the file, the matching entry, and what IS allowed. */
export const policyBlockMessage = (host: string, entry: string) =>
  `${POLICY_PREFIX}: ${host} matches "${entry}" in this project's do-not-fetch list (src/data-sources/feeds/blockedHosts.ts). No request was made, and this is not a refusal by the website. Allowed instead: the bank's own public notices, a PDF / CSV / Google Sheet you supply, pasted text, or an authorised partner / API feed.`;

/** Source validation (first step of the flow): well-formed https address, then the project's own do-not-fetch list. */
export function checkSourceUrl(raw: string): SourceUrlCheck {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { ok: false, reason: "Invalid URL" }; }
  if (u.protocol !== "https:") return { ok: false, reason: "Only https links are allowed" };
  const entry = denylistMatch(u.hostname.toLowerCase());
  if (entry) return { ok: false, status: "internal_policy_block", reason: policyBlockMessage(u.hostname, entry) };
  return { ok: true, url: u.toString() };
}

/** Rows saved before the wording was fixed blamed the website for what was our own list; show them truthfully. */
export function relabelLegacyMessage(url: string, message: string | null): string | null {
  if (!message || !/refuses automated access \(its terms or anti-bot protection\)/i.test(message)) return message;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const entry = denylistMatch(host);
    return entry ? policyBlockMessage(host, entry) : message;
  } catch {
    return message;
  }
}
