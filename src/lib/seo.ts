export const SITE_URL = "https://auction.bizsocio.com";

/** Trim to a search-result-friendly length without cutting mid-word. */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

export function inr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2).replace(/\.?0+$/, "")} Lakh`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export function dayLabel(d: Date | null | undefined): string | null {
  return d ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d) : null;
}
