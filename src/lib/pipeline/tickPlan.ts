/*
 * Fair time slices for the scheduler's web-source scan window (pure, no database).
 *
 * The tick keeps its shape and its hard deadline. What this adds: a source in the middle of an "Import all" can no longer use the
 * whole window while others wait, every due source gets a real minimum slice, and a source that is skipped now is first in line next
 * tick. When there are more sources than one window can serve, the tick degrades gracefully: it serves as many as fit and defers the rest.
 */

export const SCAN_WINDOW_MS = 150_000; // the scan loop never runs longer than this per tick
export const SCAN_MARGIN_MS = 70_000; // the window ends this long before the tick's hard deadline (a BAANKNET batch can overrun by ~55 s)
export const MIN_SLICE_MS = 25_000; // below this a source cannot do anything useful: it is deferred instead
export const MIN_IMPORT_SLICE_MS = 70_000; // an importing source starts no batch with less than 55 s left
export const MAX_PLAIN_SLICE_MS = 60_000;
export const MAX_IMPORT_SLICE_MS = 200_000;
export const IMPORT_WEIGHT = 2; // an importing source is favoured two to one, not exclusively
export const STARVED_AFTER_MS = 3 * 3_600_000; // a source not scanned for this long goes ahead of an importing one

/** End (epoch ms) of the scan window: at most 150 s from now, and always MARGIN before the tick's hard deadline. */
export const scanWindowEnd = (now: number, hardEnd?: number): number => Math.min(now + SCAN_WINDOW_MS, hardEnd !== undefined ? hardEnd - SCAN_MARGIN_MS : Infinity);

export interface PlanSource {
  id: string;
  importing: boolean;
  baanknet: boolean;
  /** epoch ms of the last scan; 0 = never */
  lastScanAt: number;
}

/**
 * Order of service: sources starved for hours (or never scanned) first, oldest first; then importing sources (BAANKNET before the
 * AI-heavy ones, it needs no AI); then everything else, the one waiting longest first.
 */
export function planScanOrder<T extends PlanSource>(sources: T[], now: number): T[] {
  const starved = (s: PlanSource) => s.lastScanAt === 0 || now - s.lastScanAt > STARVED_AFTER_MS;
  return [...sources].sort(
    (a, b) =>
      Number(starved(b)) - Number(starved(a)) ||
      (starved(a) && starved(b) ? a.lastScanAt - b.lastScanAt : 0) ||
      Number(b.importing) - Number(a.importing) ||
      Number(b.baanknet) - Number(a.baanknet) ||
      a.lastScanAt - b.lastScanAt,
  );
}

/**
 * Time slice for `source` given everyone still waiting (`remaining` includes the source itself) and the time left in the window.
 * A weighted share of what is left, never below the minimum a source needs, never above its cap. null = not enough time: defer it.
 */
export function sliceFor(source: PlanSource, remaining: PlanSource[], left: number): number | null {
  const weight = (s: PlanSource) => (s.importing ? IMPORT_WEIGHT : 1);
  const min = source.importing ? MIN_IMPORT_SLICE_MS : MIN_SLICE_MS;
  const cap = source.importing ? MAX_IMPORT_SLICE_MS : MAX_PLAIN_SLICE_MS;
  if (left < min) return null;
  const total = remaining.reduce((n, s) => n + weight(s), 0) || weight(source);
  const share = Math.floor((left * weight(source)) / total);
  return Math.min(left, Math.max(min, Math.min(cap, share)));
}

/** Oldest run first; never-run first. Used so that the sources deferred by a short tick are not always the same ones. */
export function orderByWaiting<T extends { lastRunAt: Date | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.lastRunAt?.getTime() ?? 0) - (b.lastRunAt?.getTime() ?? 0));
}
