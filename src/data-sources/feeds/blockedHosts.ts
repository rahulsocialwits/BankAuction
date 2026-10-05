// Sites whose terms or robots.txt disallow copying. Never accepted as link sources, and listings that come from them
// (for example rows of a shared sheet whose source_url points there) are not imported either.
export const BLOCKED_HOSTS = ["baanknet.com", "auctionbazaar.com", "bankauction.co"];

export const isBlockedHost = (hostname: string) => BLOCKED_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h));

export function isBlockedUrl(url: string): boolean {
  try {
    return isBlockedHost(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}
