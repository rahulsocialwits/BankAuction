import robotsParser from "robots-parser";
import { SourceDefinition } from "@/data-sources/registry";

const USER_AGENT = "BankAuctionBot/0.1 (+https://auction.bizsocio.com/about; source discovery for a property auction index)";

// One robots.txt fetch per host per process run, and a minimum gap between
// requests to the same host so we never hammer a source.
const robotsCache = new Map<string, ReturnType<typeof robotsParser>>();
const lastRequestAtByHost = new Map<string, number>();
const MIN_DELAY_MS = 2000;

async function getRobots(baseUrl: string) {
  if (robotsCache.has(baseUrl)) return robotsCache.get(baseUrl)!;
  const robotsUrl = new URL("/robots.txt", baseUrl).toString();
  let body = "";
  try {
    const res = await fetch(robotsUrl, { headers: { "User-Agent": USER_AGENT } });
    if (res.ok) body = await res.text();
  } catch {
    // Unreachable robots.txt -> treat as no explicit rules found (caller's
    // registry accessStatus is still the authoritative allow/deny decision).
  }
  const parsed = robotsParser(robotsUrl, body);
  robotsCache.set(baseUrl, parsed);
  return parsed;
}

async function waitForRateLimit(host: string) {
  const last = lastRequestAtByHost.get(host) ?? 0;
  const wait = MIN_DELAY_MS - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAtByHost.set(host, Date.now());
}

export class SourceAccessDeniedError extends Error {}

/**
 * Fetches a URL on behalf of a registered source, after checking:
 *  1. the source's registry accessStatus is ALLOWED,
 *  2. robots.txt permits this specific path for our user agent.
 * Never bypasses CAPTCHA, login, or anti-bot challenges.
 */
export async function politeFetch(source: SourceDefinition, path: string): Promise<Response> {
  if (source.accessStatus !== "ALLOWED") {
    throw new SourceAccessDeniedError(
      `Refusing to fetch from "${source.name}": registry status is ${source.accessStatus}. ${source.accessNotes}`
    );
  }

  const url = new URL(path, source.baseUrl).toString();
  const robots = await getRobots(source.baseUrl);
  if (robots && robots.isDisallowed(url, USER_AGENT)) {
    throw new SourceAccessDeniedError(`robots.txt disallows fetching ${url}`);
  }

  await waitForRateLimit(new URL(source.baseUrl).host);

  return fetch(url, { headers: { "User-Agent": USER_AGENT } });
}
