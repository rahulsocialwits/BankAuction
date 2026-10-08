/*
 * Zero-yield detection for generic sources (website scans, list pages, Google Sheets / CSV links). Pure functions, no database.
 *
 * Why: a link source can finish a run with technical status "ok" while it found NOTHING (a JavaScript-only site, a changed page
 * layout, a login wall, a page that now answers with an error text). "ok" with 0 listings is not healthy, and the existing
 * completeness engine does not evaluate generic sources. This module turns each run's counts into a verdict.
 *
 * The streak is remembered per source and per channel inside FeedSource.sheetState (key "yield"), not in run-log rows, because
 * hourly runs that find nothing new are deliberately not logged and a log-based streak would miscount them.
 */

export type YieldChannel = "list" | "site" | "sheet";

export type YieldVerdict =
  | "PRODUCTIVE" //   listings were found
  | "EMPTY" //        found nothing, but not yet often enough to call it
  | "ZERO_YIELD" //   found nothing on several runs over many hours and never produced anything
  | "DROPPED" //      produced listings before, now finds none (layout change, block, JS-only change)
  | "ALL_REJECTED"; // finds listings, but every one is rejected several runs in a row

/** What one run saw. `discovered` = listings the source presented (not "new ones"): 0 means the source showed nothing at all. */
export interface YieldRun {
  discovered: number;
  created: number;
  duplicates: number;
  rejected: number;
}

export interface ChannelYield {
  verdict: YieldVerdict;
  zeroStreak: number;
  rejectStreak: number;
  lastDiscovered: number;
  lastRunAt: string;
  firstZeroAt?: string;
  lastProductiveAt?: string;
}

export type YieldState = Partial<Record<YieldChannel, ChannelYield>>;

/** Consecutive empty runs needed, and the minimum time they must span, before a never-productive source is called ZERO_YIELD. */
export const ZERO_YIELD_AFTER_RUNS = 3;
export const ZERO_YIELD_MIN_SPAN_MS = 6 * 3_600_000;
export const ALL_REJECTED_AFTER_RUNS = 3;
/** A channel that has not run for this long no longer vouches for the source being productive. */
export const PRODUCTIVE_FRESH_MS = 14 * 864e5;

const SEVERITY: Record<YieldVerdict, number> = { PRODUCTIVE: 0, EMPTY: 1, ALL_REJECTED: 2, ZERO_YIELD: 3, DROPPED: 4 };

export const isYieldProblem = (v: YieldVerdict | null | undefined) => v === "ZERO_YIELD" || v === "DROPPED" || v === "ALL_REJECTED";

/** Advances one channel's state with the latest run. */
export function nextChannelYield(prev: ChannelYield | undefined, run: YieldRun, now: Date = new Date()): ChannelYield {
  const nowIso = now.toISOString();
  const discovered = Math.max(0, Math.floor(run.discovered || 0));
  if (discovered > 0) {
    const valid = (run.created || 0) + (run.duplicates || 0);
    const rejectStreak = valid === 0 && (run.rejected || 0) > 0 ? (prev?.rejectStreak ?? 0) + 1 : 0;
    return {
      verdict: rejectStreak >= ALL_REJECTED_AFTER_RUNS ? "ALL_REJECTED" : "PRODUCTIVE",
      zeroStreak: 0,
      rejectStreak,
      lastDiscovered: discovered,
      lastRunAt: nowIso,
      lastProductiveAt: nowIso,
    };
  }
  const zeroStreak = (prev?.zeroStreak ?? 0) + 1;
  const firstZeroAt = prev?.firstZeroAt ?? nowIso;
  const lastProductiveAt = prev?.lastProductiveAt;
  let verdict: YieldVerdict;
  if (lastProductiveAt) verdict = "DROPPED"; // it worked before: do not wait for a streak, a human should look
  else if (zeroStreak >= ZERO_YIELD_AFTER_RUNS && now.getTime() - Date.parse(firstZeroAt) >= ZERO_YIELD_MIN_SPAN_MS) verdict = "ZERO_YIELD";
  else verdict = "EMPTY";
  return { verdict, zeroStreak, rejectStreak: 0, lastDiscovered: 0, lastRunAt: nowIso, firstZeroAt, lastProductiveAt };
}

/**
 * One verdict per source. A source is PRODUCTIVE if any of its channels recently found listings (a website whose list page is
 * empty but whose whole-site scan finds pages is fine). Otherwise the worst channel verdict wins. Null = never measured.
 */
export function overallYield(state: YieldState | null | undefined, now: Date = new Date()): YieldVerdict | null {
  const channels = Object.values(state ?? {}).filter((c): c is ChannelYield => !!c);
  if (channels.length === 0) return null;
  const productive = channels.some((c) => c.verdict === "PRODUCTIVE" && c.lastDiscovered > 0 && now.getTime() - Date.parse(c.lastRunAt) < PRODUCTIVE_FRESH_MS);
  if (productive) return "PRODUCTIVE";
  return channels.reduce<YieldVerdict>((worst, c) => (SEVERITY[c.verdict] > SEVERITY[worst] ? c.verdict : worst), "PRODUCTIVE");
}

export function yieldStateOf(raw: string | null | undefined): YieldState {
  try {
    const y = raw ? JSON.parse(raw)?.yield : null;
    if (!y || typeof y !== "object") return {};
    const out: YieldState = {};
    for (const ch of ["list", "site", "sheet"] as const) {
      const c = y[ch];
      if (c && typeof c === "object" && typeof c.verdict === "string" && c.verdict in SEVERITY) {
        out[ch] = {
          verdict: c.verdict,
          zeroStreak: Number(c.zeroStreak) || 0,
          rejectStreak: Number(c.rejectStreak) || 0,
          lastDiscovered: Number(c.lastDiscovered) || 0,
          lastRunAt: typeof c.lastRunAt === "string" ? c.lastRunAt : new Date(0).toISOString(),
          ...(typeof c.firstZeroAt === "string" && { firstZeroAt: c.firstZeroAt }),
          ...(typeof c.lastProductiveAt === "string" && { lastProductiveAt: c.lastProductiveAt }),
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Writes the yield state under its own key of FeedSource.sheetState; every other key is left exactly as it is. */
export function withYieldState(raw: string | null | undefined, state: YieldState): string {
  let j: Record<string, unknown> = {};
  try { j = raw ? JSON.parse(raw) : {}; } catch { /* start fresh */ }
  j.yield = state;
  return JSON.stringify(j);
}

/** Copies the "yield" key of the old state into a freshly built state string (for writers that replace the whole field). */
export function keepYieldState(oldRaw: string | null | undefined, newRaw: string): string {
  const y = yieldStateOf(oldRaw);
  return Object.keys(y).length ? withYieldState(newRaw, y) : newRaw;
}

/* ---- the marker line stored at the start of a run-log message ---- */

const MARK = "[YIELD_V1] ";
export interface YieldMarker {
  channel: YieldChannel;
  verdict: YieldVerdict;
  discovered: number;
  streak: number;
}

export const formatYieldMarker = (m: YieldMarker) => `${MARK}${JSON.stringify(m)}`;

/** Finds the marker anywhere in a message (it is written before the human text, but the metrics header may precede it). */
export function parseYieldMarker(message: string | null | undefined): YieldMarker | null {
  if (!message) return null;
  const at = message.indexOf(MARK);
  if (at < 0) return null;
  const end = message.indexOf("\n", at);
  try {
    const m = JSON.parse(message.slice(at + MARK.length, end < 0 ? undefined : end));
    return m && typeof m === "object" && typeof m.verdict === "string" && m.verdict in SEVERITY ? (m as YieldMarker) : null;
  } catch {
    return null;
  }
}

export const stripYieldMarker = (message: string | null | undefined) => (message ?? "").replace(/\[YIELD_V1\] \{[^\n]*\}\n?/, "");

/** One plain sentence for a verdict, for the admin. */
export function describeYield(v: YieldVerdict): string {
  switch (v) {
    case "PRODUCTIVE": return "Finding listings.";
    case "EMPTY": return "Found nothing on the latest run (watching).";
    case "ZERO_YIELD": return "Has never found a listing, over several runs. A JavaScript-only site, a login wall or a wrong link is likely.";
    case "DROPPED": return "Used to find listings, now finds none. The site probably changed or started blocking us.";
    case "ALL_REJECTED": return "Finds listings, but every one is rejected (missing price, date or address).";
  }
}
