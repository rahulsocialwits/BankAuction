// Static registry of candidate data sources and their verified access status.
//
// Access status was determined by inspecting each source's robots.txt directly
// (see accessNotes) — never by attempting to bypass anti-bot protection, CAPTCHA,
// or login. Only sources with status "ALLOWED" get a working fetch adapter; the
// rest are kept in the architecture but their adapters are no-ops until access
// is re-verified or an authorized/official channel becomes available.

export type SourceAccessStatus = "ALLOWED" | "RESTRICTED" | "UNAVAILABLE";

export interface SourceDefinition {
  key: string;
  name: string;
  baseUrl: string;
  accessStatus: SourceAccessStatus;
  accessNotes: string;
}

export const SOURCE_REGISTRY: SourceDefinition[] = [
  {
    key: "bankauctions",
    name: "BankAuctions.in",
    baseUrl: "https://bankauctions.in",
    accessStatus: "ALLOWED",
    accessNotes:
      "robots.txt only disallows /wp-admin/, /wp-content/, /wp-includes/; publishes a sitemap. WordPress site, standard public pages.",
  },
  {
    key: "ibapi",
    name: "IBAPI.in",
    baseUrl: "https://ibapi.in",
    accessStatus: "UNAVAILABLE",
    accessNotes:
      "Site returned an ASP.NET error page on robots.txt at last check; treat as unavailable until it is confirmed reachable and its terms reviewed.",
  },
  {
    key: "eauctions_india",
    name: "eAuctionsIndia.com",
    baseUrl: "https://www.eauctionsindia.com",
    accessStatus: "RESTRICTED",
    accessNotes:
      "robots.txt allows crawling, but Cloudflare answers 403 / a challenge to server traffic. We never solve or bypass the challenge; add it as a link source and it works only if the site lets our server in.",
  },
  {
    key: "auction_tiger_drt",
    name: "DRT AuctionTiger",
    baseUrl: "https://drt.auctiontiger.net",
    accessStatus: "RESTRICTED",
    accessNotes:
      "No robots.txt found (404). Ambiguous access posture for a DRT (Debt Recovery Tribunal) platform — needs manual terms-of-use review before any fetching.",
  },
  {
    key: "bankeauctions",
    name: "BankEAuctions.com",
    baseUrl: "https://www.bankeauctions.com",
    accessStatus: "RESTRICTED",
    accessNotes:
      "robots.txt route returned a non-standard error-styled page rather than a normal robots.txt. Ambiguous — needs manual review before fetching.",
  },
  {
    key: "auctionbazaar",
    name: "AuctionBazaar.com",
    baseUrl: "https://www.auctionbazaar.com",
    accessStatus: "RESTRICTED",
    accessNotes:
      "robots.txt explicitly disallows ClaudeBot / anthropic-ai. Must never be crawled by this system.",
  },
  {
    key: "baanknet",
    name: "Baanknet.com",
    baseUrl: "https://baanknet.com",
    accessStatus: "RESTRICTED",
    accessNotes:
      "robots.txt allows crawling, but the site's Terms prohibit copying content without written consent from PSB Alliance. Not built, and blocked in link sources, unless written permission is obtained.",
  },
  {
    key: "bankauction_co",
    name: "BankAuction.co (reference site)",
    baseUrl: "https://bankauction.co",
    accessStatus: "UNAVAILABLE",
    accessNotes:
      "This is the reference/brand site used for product direction, not a data source to ingest from.",
  },
];

export function getSourceDefinition(key: string): SourceDefinition | undefined {
  return SOURCE_REGISTRY.find((s) => s.key === key);
}
