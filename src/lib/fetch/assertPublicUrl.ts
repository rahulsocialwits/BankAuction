import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * Returns true when the IP address is non-routable (loopback, private, link-local,
 * multicast, documentation ranges or the 0.0.0.0 meta-address).
 */
export function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    // IPv6 loopback, link-local, unique-local, and IPv4-mapped private ranges
    return (
      ip === "::1" ||
      ip.startsWith("fe80") ||
      ip.startsWith("fc") ||
      ip.startsWith("fd") ||
      ip.startsWith("::ffff:127.") ||
      ip.startsWith("::ffff:10.") ||
      ip.startsWith("::ffff:192.168.") ||
      ip.startsWith("ff") // multicast
    );
  }
  const parts = ip.split(".").map(Number);
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // RFC 6598 carrier-grade NAT
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 2) || // TEST-NET-1
    (a === 192 && b === 168) ||
    (a === 198 && b === 18) || // benchmark
    (a === 198 && b === 19) || // benchmark
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast and reserved
  );
}

export class SsrfBlockedError extends Error {
  readonly url: string;
  constructor(url: string, reason: string) {
    super(`SSRF: ${reason} — ${url}`);
    this.url = url;
  }
}

/**
 * Verifies that `rawUrl` resolves to a public internet host before any request is sent.
 *
 * Checks:
 *  - protocol is http or https
 *  - hostname is not "localhost", "*.local", "*.internal" or "*.test"
 *  - all DNS A/AAAA records resolve to public addresses
 *
 * This runs before every outgoing request so that operator-entered feed URLs,
 * sheet imports, and site-scan starting addresses cannot reach internal services.
 *
 * DNS resolution is cached by Node's built-in resolver. This function is called
 * per-request so a TTL-expired record (a DNS rebinding attempt) is caught on the
 * next request.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(rawUrl, "URL is malformed");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfBlockedError(rawUrl, `protocol ${parsed.protocol} is not allowed`);
  }

  const host = parsed.hostname.toLowerCase();

  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".test") ||
    host.endsWith(".localhost")
  ) {
    throw new SsrfBlockedError(rawUrl, `${host} is a local/internal hostname`);
  }

  // If the hostname is already an IP literal, skip DNS and check directly.
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new SsrfBlockedError(rawUrl, `${host} is a non-public IP address`);
    return;
  }

  // Resolve all addresses (A and AAAA). An unresolvable host is blocked; it
  // should never be internal and the error message will be visible in the run log.
  let addrs: { address: string }[] = [];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new SsrfBlockedError(rawUrl, `hostname ${host} could not be resolved`);
  }

  if (addrs.length === 0) {
    throw new SsrfBlockedError(rawUrl, `hostname ${host} returned no addresses`);
  }

  for (const { address } of addrs) {
    if (isPrivateAddress(address)) {
      throw new SsrfBlockedError(rawUrl, `${host} resolved to non-public address ${address}`);
    }
  }
}
