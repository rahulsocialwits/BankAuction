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
  maxPages: 1000,
  maxDepth: 8,
  maxCandidates: 300,
  maxDeepPages: 100,
  timeLimitSec: 280,
  concurrency: 4,
  maxBrowserPages: 100,
  useSitemap: true,
  useBrowser: true,
};

/**
 * Ceilings (a value of 0 in the form means "no limit" = the ceiling). The only real wall is time: one demo request ends after
 * about 5 minutes, so a whole big website is read by adding it as a Live source (it continues on every scheduler tick, unlimited).
 */
export const HARD_LIMITS: Record<Exclude<keyof ScanSettings, "useSitemap" | "useBrowser">, [number, number]> = {
  maxPages: [1, 5000],
  maxDepth: [0, 12],
  maxCandidates: [1, 2000],
  maxDeepPages: [1, 300],
  timeLimitSec: [20, 285],
  concurrency: [1, 6],
  maxBrowserPages: [0, 300],
};

export function clampSettings(raw: Partial<Record<keyof ScanSettings, unknown>>): ScanSettings {
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(HARD_LIMITS) as (keyof typeof HARD_LIMITS)[]) {
    const n = Number(raw[k]);
    if (Number.isFinite(n) && n === 0 && raw[k] !== "" && raw[k] !== null) out[k] = HARD_LIMITS[k][1]; // 0 = unlimited
    else if (Number.isFinite(n)) out[k] = Math.min(HARD_LIMITS[k][1], Math.max(HARD_LIMITS[k][0], Math.round(n)));
  }
  if (raw.useSitemap !== undefined) out.useSitemap = raw.useSitemap === true || raw.useSitemap === "on";
  if (raw.useBrowser !== undefined) out.useBrowser = raw.useBrowser === true || raw.useBrowser === "on";
  return out;
}
