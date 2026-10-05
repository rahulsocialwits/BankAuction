// AI Python Scrap — DEMO: crawl limits. Client-safe (plain data), shared by the form and the engine.

export interface ScanSettings {
  maxPages: number; // pages fetched during the website scan
  maxDepth: number; // link depth from the start page
  maxCandidates: number; // property candidates to find before the scan may stop early
  maxDeepPages: number; // pages fetched for the ONE selected property
  timeLimitSec: number; // whole scan + deep scan
  concurrency: number; // pages fetched side by side during discovery
  maxBrowserPages: number; // how many pages may use the browser renderer
  useSitemap: boolean;
  useBrowser: boolean;
}

export const DEFAULT_SETTINGS: ScanSettings = {
  maxPages: 100,
  maxDepth: 4,
  maxCandidates: 20,
  maxDeepPages: 25,
  timeLimitSec: 150,
  concurrency: 3,
  maxBrowserPages: 10,
  useSitemap: true,
  useBrowser: true,
};

/** Whatever the form sends, these ceilings apply. */
export const HARD_LIMITS: Record<Exclude<keyof ScanSettings, "useSitemap" | "useBrowser">, [number, number]> = {
  maxPages: [1, 150],
  maxDepth: [0, 5],
  maxCandidates: [1, 40],
  maxDeepPages: [1, 40],
  timeLimitSec: [20, 200],
  concurrency: [1, 4],
  maxBrowserPages: [0, 20],
};

export function clampSettings(raw: Partial<Record<keyof ScanSettings, unknown>>): ScanSettings {
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(HARD_LIMITS) as (keyof typeof HARD_LIMITS)[]) {
    const n = Number(raw[k]);
    if (Number.isFinite(n)) out[k] = Math.min(HARD_LIMITS[k][1], Math.max(HARD_LIMITS[k][0], Math.round(n)));
  }
  if (raw.useSitemap !== undefined) out.useSitemap = raw.useSitemap === true || raw.useSitemap === "on";
  if (raw.useBrowser !== undefined) out.useBrowser = raw.useBrowser === true || raw.useBrowser === "on";
  return out;
}
