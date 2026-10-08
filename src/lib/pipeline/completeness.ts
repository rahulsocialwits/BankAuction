import { latestEvaluatedRun, PROTECTIVE_STATUSES, protectionFromRuns } from "./sourceProtection";

export type DataHealthStatus =
  | "HEALTHY"
  | "WARNING"
  | "INCOMPLETE"
  | "CRITICAL"
  | "BLOCKED"
  | "FAILED"
  | "NO_DATA"
  | "RECOVERING";

export interface SourceRunMetrics {
  inventoryCount?: number;
  discoveredCount?: number;
  fetchedCount?: number;
  parsedCount?: number;
  validCount?: number;
  publishedCount?: number;
  updatedCount?: number;
  unchangedCount?: number;
  duplicateCount?: number;
  rejectedCount?: number;
  failedCount?: number;
  documentCount?: number;
  mediaCount?: number;
  pagesDiscovered?: number;
  pagesFetched?: number;
  pagesFailed?: number;
  paginationTotalPages?: number;
  paginationComplete?: boolean;
  coverageComplete?: boolean;
  evaluationEligible?: boolean;
  /**
   * Set to false when this collector's page count is not a stable unit for comparison with its own history
   * (for example a run that deliberately reads only a slice of the source). The page check is then skipped.
   */
  pageCountComparable?: boolean;
  /**
   * Incremental collectors (for example BankAuctions.in) read only a slice per run but still see the whole source index
   * (the sitemap) every time. When the collector supplies the index size it saw this run (discoveredCount) and the size of
   * the last healthy full pass (sitemapReferenceCount), an incremental run can still detect an index collapse.
   */
  sitemapReferenceCount?: number;
  httpStatus?: number;
  apiStatus?: string;
  blocked?: boolean;
  structureChanged?: boolean;
  error?: string;
  /** Set only by the admin "accept new baseline" action: this run is the new reference size; older runs no longer count. */
  baselineAccepted?: boolean;
  /** The verdict the accepted run had before an administrator accepted it (audit trail). */
  acceptedFromStatus?: DataHealthStatus;
}

/**
 * Record counts and page counts are DIFFERENT UNITS and have separate baselines.
 * Fields without the "page" prefix are built only from historical record counts;
 * fields with it are built only from historical page counts. They are never mixed.
 */
export interface SourceBaseline {
  previousRunCount: number | null;
  median7d: number | null;
  min7d: number | null;
  max7d: number | null;
  median30d: number | null;
  recentTrend: number | null;
  lastSuccessfulRun: string | null;
  lastCompleteRun: string | null;
  lastIncompleteRun: string | null;
  sampleCount7d: number;
  sampleCount30d: number;
  pageMedian7d: number | null;
  pageMin7d: number | null;
  pageMax7d: number | null;
  pageMedian30d: number | null;
  pageSampleCount7d: number;
  pageSampleCount30d: number;
  /** An anomaly (protective verdict) is unresolved: no healthy full pass and no accepted baseline has followed it. */
  anomalyOpen: boolean;
  /** When an administrator last accepted a new baseline (older runs are ignored from that point), or null. */
  acceptedAt: string | null;
}

export interface CompletenessResult {
  /** Overall data health: the most severe of the record check and the page check. */
  status: DataHealthStatus;
  score: number | null;
  reason: string;
  protectExistingData: boolean;
  baseline: SourceBaseline;
  currentCount: number | null;
  countDropRatio: number | null;
  pageDropRatio: number | null;
  /** Health of the record count against the RECORD baseline; null = not evaluated for this run. */
  recordHealth: DataHealthStatus | null;
  /** Health of the page count against the PAGE baseline; null = not evaluated (no usable page history). */
  pageHealth: DataHealthStatus | null;
}

export interface HistoricalRun {
  startedAt: Date;
  technicalStatus: string;
  metrics: SourceRunMetrics;
  dataStatus?: DataHealthStatus;
  /** Stored by newer runs; older rows only carry dataStatus. */
  protectExistingData?: boolean;
  /** Stored by newer runs: set when the run was judged against an existing baseline (so a baseline existed at that time). */
  recordHealth?: DataHealthStatus | null;
  pageHealth?: DataHealthStatus | null;
}

/** A page-count check needs at least this many comparable historical page counts. */
export const MIN_PAGE_SAMPLES = 2;
/**
 * If a source's own recent page counts vary by more than this factor (max / min over 7 days), its pagination model
 * is not stable enough for a percentage comparison and the page check is skipped. The record check still applies.
 */
export const PAGE_HISTORY_MAX_SPREAD = 2;

const median = (values: number[]): number | null => {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
};

const countOf = (m: SourceRunMetrics): number | null => {
  const candidates = [m.inventoryCount, m.fetchedCount, m.parsedCount, m.publishedCount];
  const value = candidates.find((v) => typeof v === "number" && Number.isFinite(v));
  return value === undefined ? null : Math.max(0, value);
};

const pagesOf = (m: SourceRunMetrics): number | null =>
  m.pageCountComparable !== false && typeof m.pagesFetched === "number" && Number.isFinite(m.pagesFetched)
    ? Math.max(0, m.pagesFetched)
    : null;

/**
 * BASELINE EVIDENCE: which runs may define "normal" for a source.
 *  - Only HEALTHY runs. A WARNING / INCOMPLETE / CRITICAL / BLOCKED / FAILED / NO_DATA run is an anomaly, and an anomaly that
 *    repeats must never become the reference it is judged against (otherwise a persistent collapse turns into the new normal).
 *  - The one exception is the very first comparable full pass of a source (RECOVERING, unprotected, with a count): without it
 *    a new source could never reach HEALTHY.
 *  - Incremental runs (evaluationEligible false) were never evidence.
 *  - Rows with no stored verdict (written before verdicts existed) are kept as they were.
 */
function isBaselineEvidence(r: HistoricalRun): boolean {
  const m = r.metrics;
  if (m.evaluationEligible === false) return false;
  const s = r.dataStatus;
  if (s === undefined || s === "HEALTHY") return true;
  return s === "RECOVERING" && r.protectExistingData !== true && !m.blocked && !m.structureChanged && !m.failedCount && m.paginationComplete !== false;
}

const newestFirst = (runs: HistoricalRun[]) => [...runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

/**
 * Combines run lists (for example the newest rows and the newest HEALTHY rows) into one list, newest first, each run once.
 * The healthy rows are loaded on their own so that a long stretch of anomalous runs cannot push the healthy history out of
 * the loaded window.
 */
export function mergeHistoricalRuns(...lists: HistoricalRun[][]): HistoricalRun[] {
  const seen = new Set<string>();
  const out: HistoricalRun[] = [];
  for (const run of lists.flat()) {
    const key = `${run.startedAt.getTime()}|${run.technicalStatus}|${run.dataStatus ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(run);
  }
  return newestFirst(out);
}

/**
 * Is a source anomaly unresolved? True when the latest verdict protects AND the anomaly streak (back to the last unflagged verdict)
 * shows that a baseline existed when it began: a run judged against a baseline, or the "protected, no baseline left" state itself.
 * A brand-new source whose first run was blocked, empty or half-read has no such marker and may still seed its first baseline.
 */
function anomalyOpenIn(runs: HistoricalRun[]): boolean {
  if (!protectionFromRuns(runs).protected) return false;
  for (const r of runs) {
    const s = r.dataStatus;
    if (s === undefined || (s === "RECOVERING" && r.protectExistingData !== true)) continue;
    if (!(r.protectExistingData ?? PROTECTIVE_STATUSES.has(s))) return false; // the streak ended with an unflagged verdict
    if (s === "RECOVERING" || r.recordHealth != null || r.pageHealth != null) return true;
  }
  return false;
}

export function buildSourceBaseline(allRuns: HistoricalRun[], now = new Date()): SourceBaseline {
  const sorted = newestFirst(allRuns);
  // An accepted baseline is a reset point: it and everything after it count, nothing before it does.
  const acceptedIdx = sorted.findIndex((r) => r.metrics.baselineAccepted === true);
  const runs = acceptedIdx >= 0 ? sorted.slice(0, acceptedIdx + 1) : sorted;
  const anomalyOpen = anomalyOpenIn(runs);
  const eligible = runs.filter(isBaselineEvidence);
  const valid = eligible
    .map((r) => ({ ...r, count: countOf(r.metrics), pages: pagesOf(r.metrics) }))
    .filter((r) => r.count !== null);

  const since7 = now.getTime() - 7 * 864e5;
  const since30 = now.getTime() - 30 * 864e5;
  const r7 = valid.filter((r) => r.startedAt.getTime() >= since7);
  const r30 = valid.filter((r) => r.startedAt.getTime() >= since30);
  const r7Counts = r7.map((r) => r.count).filter((v): v is number => v !== null);
  const r30Counts = r30.map((r) => r.count).filter((v): v is number => v !== null);

  // Page baseline: built ONLY from historical page counts of eligible runs (never from record counts).
  const pageRuns = eligible
    .map((r) => ({ startedAt: r.startedAt, pages: pagesOf(r.metrics) }))
    .filter((r): r is { startedAt: Date; pages: number } => r.pages !== null);
  const p7 = pageRuns.filter((r) => r.startedAt.getTime() >= since7).map((r) => r.pages);
  const p30 = pageRuns.filter((r) => r.startedAt.getTime() >= since30).map((r) => r.pages);

  const latest = valid[0];
  const previous = valid[1];
  const previousCount = previous?.count ?? null;
  const currentForTrend = latest?.count ?? null;
  const trend = previousCount && currentForTrend !== null
    ? (currentForTrend - previousCount) / previousCount
    : null;

  const successful = runs.find((r) => r.technicalStatus === "ok" && r.metrics.evaluationEligible !== false);
  const complete = runs.find((r) => r.metrics.paginationComplete === true && r.metrics.evaluationEligible !== false);
  const incomplete = runs.find((r) => {
    const s = r.dataStatus;
    return s === "WARNING" || s === "INCOMPLETE" || s === "CRITICAL";
  });

  return {
    previousRunCount: previousCount,
    median7d: median(r7Counts),
    min7d: r7Counts.length ? Math.min(...r7Counts) : null,
    max7d: r7Counts.length ? Math.max(...r7Counts) : null,
    median30d: median(r30Counts),
    recentTrend: trend,
    lastSuccessfulRun: successful?.startedAt.toISOString() ?? null,
    lastCompleteRun: complete?.startedAt.toISOString() ?? null,
    lastIncompleteRun: incomplete?.startedAt.toISOString() ?? null,
    sampleCount7d: r7.length,
    sampleCount30d: r30.length,
    pageMedian7d: median(p7),
    pageMin7d: p7.length ? Math.min(...p7) : null,
    pageMax7d: p7.length ? Math.max(...p7) : null,
    pageMedian30d: median(p30),
    pageSampleCount7d: p7.length,
    pageSampleCount30d: p30.length,
    anomalyOpen,
    acceptedAt: acceptedIdx >= 0 ? sorted[acceptedIdx].startedAt.toISOString() : null,
  };
}

/** Severity order of the drop-based verdicts (used to combine the record check and the page check). */
const DROP_SEVERITY: Record<"HEALTHY" | "WARNING" | "INCOMPLETE" | "CRITICAL", number> = {
  HEALTHY: 0,
  WARNING: 1,
  INCOMPLETE: 2,
  CRITICAL: 3,
};
type DropVerdict = keyof typeof DROP_SEVERITY;

/** Same thresholds for both units: ≥60% CRITICAL, ≥30% INCOMPLETE, ≥10% WARNING. */
const classifyDrop = (ratio: number | null): DropVerdict | null => {
  if (ratio === null) return null;
  if (ratio >= 0.6) return "CRITICAL";
  if (ratio >= 0.3) return "INCOMPLETE";
  if (ratio >= 0.1) return "WARNING";
  return "HEALTHY";
};

/** The page baseline is usable only with enough history and a stable pagination model. */
function pageReference(baseline: SourceBaseline): number | null {
  const reference = baseline.pageMedian7d ?? baseline.pageMedian30d;
  if (!reference || reference <= 0) return null;
  const samples = baseline.pageSampleCount7d >= MIN_PAGE_SAMPLES ? baseline.pageSampleCount7d : baseline.pageSampleCount30d;
  if (samples < MIN_PAGE_SAMPLES) return null;
  if (baseline.pageMin7d && baseline.pageMax7d && baseline.pageMax7d / baseline.pageMin7d > PAGE_HISTORY_MAX_SPREAD) return null;
  return reference;
}

/** Index-size check for incremental runs. Returns null when it cannot be evaluated or the index is fine. */
function indexCollapseVerdict(m: SourceRunMetrics): { verdict: Exclude<DropVerdict, "HEALTHY">; ratio: number } | null {
  const ref = m.sitemapReferenceCount;
  const now = m.discoveredCount;
  if (typeof ref !== "number" || typeof now !== "number" || !Number.isFinite(ref) || !Number.isFinite(now) || ref <= 0) return null;
  const ratio = Math.max(0, (ref - now) / ref);
  const verdict = classifyDrop(ratio);
  return verdict && verdict !== "HEALTHY" ? { verdict, ratio } : null;
}

export function evaluateCompleteness(
  metrics: SourceRunMetrics,
  baseline: SourceBaseline,
): CompletenessResult {
  const currentCount = countOf(metrics);
  const reference = baseline.median7d ?? baseline.median30d ?? baseline.previousRunCount;

  const countDropRatio = currentCount !== null && reference && reference > 0
    ? Math.max(0, (reference - currentCount) / reference)
    : null;

  // Pages are compared ONLY with historical page counts (never with the record baseline).
  const pageRef = pageReference(baseline);
  const currentPages = pagesOf(metrics);
  const pageDropRatio = currentPages !== null && pageRef !== null
    ? Math.max(0, (pageRef - currentPages) / pageRef)
    : null;

  const make = (
    status: DataHealthStatus,
    score: number | null,
    reason: string,
    protectExistingData: boolean,
    extra: Partial<Pick<CompletenessResult, "countDropRatio" | "recordHealth" | "pageHealth">> = {},
  ): CompletenessResult => ({
    status,
    score,
    reason,
    protectExistingData,
    baseline,
    currentCount,
    countDropRatio: extra.countDropRatio !== undefined ? extra.countDropRatio : countDropRatio,
    pageDropRatio,
    recordHealth: extra.recordHealth ?? null,
    pageHealth: extra.pageHealth ?? null,
  });

  // An administrator confirmed that this size is the source's new normal (see baselineToAccept). The run is the new reference point.
  if (metrics.baselineAccepted === true) {
    return make("HEALTHY", 100, `Baseline accepted by an administrator at ${currentCount ?? "n/a"} records (the run was ${metrics.acceptedFromStatus ?? "flagged"} before); older runs no longer count.`, false, { countDropRatio: null, recordHealth: "HEALTHY" });
  }

  // Some collectors intentionally run incrementally (for example, a 100-page safety tick).
  // Those runs must contribute no completeness verdict until the collector says the inventory pass is complete.
  if (metrics.evaluationEligible === false) {
    // The one exception: the source index (sitemap) collapsed versus the last healthy full pass. Slice size is irrelevant to that.
    const indexVerdict = indexCollapseVerdict(metrics);
    if (indexVerdict) {
      const pct = Math.round(indexVerdict.ratio * 100);
      const score = indexVerdict.verdict === "CRITICAL" ? 20 : indexVerdict.verdict === "INCOMPLETE" ? 45 : Math.max(0, 100 - pct);
      return {
        ...make(indexVerdict.verdict, score, `Source index (sitemap) ${indexVerdict.verdict === "WARNING" ? "is down" : "dropped by"} ${pct}% versus the last healthy full pass; existing data is protected.`, true, { countDropRatio: indexVerdict.ratio, recordHealth: indexVerdict.verdict }),
        pageDropRatio: null,
      };
    }
    return {
      ...make("RECOVERING", null, "Incremental run recorded; completeness will be evaluated only after a complete source inventory pass.", false),
      countDropRatio: null,
      pageDropRatio: null,
    };
  }

  if (metrics.blocked) {
    return make("BLOCKED", 0, "Source access was blocked/refused; existing data must be preserved.", true);
  }
  if (metrics.structureChanged) {
    return make("CRITICAL", 0, "Source response structure changed; completeness cannot be trusted.", true);
  }
  if (metrics.failedCount && metrics.failedCount > 0 && currentCount === null) {
    return make("FAILED", 0, metrics.error || "Source run failed before a trustworthy inventory count was produced.", true);
  }
  // (evaluationEligible === false already returned above, so no further eligibility test is needed here.)
  if (metrics.paginationComplete === false) {
    return make("INCOMPLETE", 35, "Pagination did not complete; the run is not a complete inventory.", true);
  }
  if (currentCount === 0 && reference && reference > 0) {
    return make("CRITICAL", 0, "The source returned zero records against a non-zero historical baseline.", true, { countDropRatio: 1, recordHealth: "CRITICAL" });
  }
  if (currentCount === null) {
    return make("RECOVERING", null, "No comparable inventory count is available yet; historical baseline is still being established.", baseline.anomalyOpen);
  }
  if (!reference || baseline.sampleCount7d + baseline.sampleCount30d === 0) {
    // An earlier anomaly is still unresolved and no healthy run is left to compare with (the healthy history aged out). This is NOT a
    // new source: treating it as a first run would let a long collapse become the baseline. Protection continues until an
    // administrator accepts the new size, or a healthy full pass can be judged again.
    if (baseline.anomalyOpen) {
      return make("RECOVERING", null, "An earlier source anomaly is unresolved and no healthy run remains to compare with; existing data stays protected until an administrator accepts the new size.", true);
    }
    return make(
      currentCount === 0 ? "NO_DATA" : "RECOVERING",
      currentCount === 0 ? 0 : null,
      "First comparable run; source-specific historical baseline is not established yet.",
      currentCount === 0,
    );
  }

  const recordVerdict = classifyDrop(countDropRatio) ?? "HEALTHY";
  const pageVerdict = classifyDrop(pageDropRatio); // null = page check not evaluated
  const worse: DropVerdict =
    pageVerdict !== null && DROP_SEVERITY[pageVerdict] > DROP_SEVERITY[recordVerdict] ? pageVerdict : recordVerdict;
  const health = { recordHealth: recordVerdict, pageHealth: pageVerdict } as const;

  if (worse !== "HEALTHY") {
    const pageIsWorse = pageVerdict !== null && DROP_SEVERITY[pageVerdict] > DROP_SEVERITY[recordVerdict];
    const ratio = pageIsWorse ? pageDropRatio ?? 0 : countDropRatio ?? 0;
    const pct = Math.round(ratio * 100);
    const what = pageIsWorse ? "Fetched pages" : "Inventory";
    const verb = worse === "WARNING" ? "is down" : "dropped by";
    const score = worse === "CRITICAL" ? 20 : worse === "INCOMPLETE" ? 45 : Math.max(0, 100 - pct);
    return make(worse, score, `${what} ${verb} ${pct}% versus the source's own ${pageIsWorse ? "page-count" : "record-count"} baseline.`, true, health);
  }
  if (metrics.rejectedCount && currentCount > 0 && metrics.rejectedCount / currentCount >= 0.3) {
    return make("WARNING", 60, "Rejected-record volume is unusually high for this run.", true, health);
  }
  return make("HEALTHY", 100, "Inventory volume and pagination are within the source-specific historical baseline.", false, health);
}

export function parseMetricsMessage(
  message: string | null | undefined,
): { metrics: SourceRunMetrics; dataStatus?: DataHealthStatus; protectExistingData?: boolean; recordHealth?: DataHealthStatus | null; pageHealth?: DataHealthStatus | null } | null {
  if (!message?.startsWith("[DATA_ENGINE_V1] ")) return null;
  const newline = message.indexOf("\n");
  if (newline < 0) return null;
  try {
    const payload = JSON.parse(message.slice("[DATA_ENGINE_V1] ".length, newline));
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

const PREFIX = "[DATA_ENGINE_V1] ";
const MAX_MESSAGE = 2000;

/**
 * The JSON header must always survive intact: it is the history the next baseline is built from. Only the human text
 * is truncated. If the header alone is too large, the (re-derivable) baseline is dropped from it first.
 */
export function formatMetricsMessage(
  metrics: SourceRunMetrics,
  result: CompletenessResult,
  humanMessage?: string,
): string {
  const safeMetrics: SourceRunMetrics = { ...metrics, error: metrics.error?.slice(0, 200) };
  const full = {
    metrics: safeMetrics,
    dataStatus: result.status,
    protectExistingData: result.protectExistingData,
    recordHealth: result.recordHealth,
    pageHealth: result.pageHealth,
    completenessScore: result.score,
    reason: result.reason,
    baseline: result.baseline,
  };
  let header = JSON.stringify(full);
  if (PREFIX.length + header.length + 1 > MAX_MESSAGE) {
    const { baseline: _omit, ...slim } = full;
    void _omit;
    header = JSON.stringify(slim);
  }
  const room = Math.max(0, MAX_MESSAGE - PREFIX.length - header.length - 1);
  return `${PREFIX}${header}\n${(humanMessage ?? "").slice(0, room)}`;
}


/** Metrics of a run that was refused before it read anything (robots.txt, 401/403, CAPTCHA). No count: a refusal is not a measurement of size. */
export const refusedRunMetrics = (error: string): SourceRunMetrics => ({
  blocked: true,
  failedCount: 1,
  paginationComplete: false,
  coverageComplete: false,
  evaluationEligible: true,
  error: error.slice(0, 200),
});

export type BaselineAcceptance =
  | { ok: true; metrics: SourceRunMetrics; fromStatus: DataHealthStatus; count: number; previousReference: number | null }
  | { ok: false; reason: string };

/**
 * May an administrator accept the source's CURRENT size as its new baseline? Only when the latest evaluated run is flagged AND is a
 * clean, complete measurement: not blocked, not failed, no structure change, not empty, pagination finished, not an incremental slice.
 * A blocked or half-read run says nothing about how big the source really is. The returned metrics become a run-log row that
 * resets the baseline (see buildSourceBaseline); nothing else is touched.
 */
export function baselineToAccept(runs: HistoricalRun[]): BaselineAcceptance {
  const sorted = newestFirst(runs);
  const protection = protectionFromRuns(sorted);
  if (protection.basis !== "verdict" || !protection.protected) return { ok: false, reason: "Nothing to accept: the source's latest evaluated run is not flagged." };
  const run = latestEvaluatedRun(sorted);
  if (!run || !run.dataStatus) return { ok: false, reason: "No evaluated run to accept." };
  const m = run.metrics;
  const status = run.dataStatus;
  if (status === "BLOCKED" || status === "FAILED" || status === "NO_DATA") return { ok: false, reason: `The latest run is ${status}: a run that could not read the source cannot define its size.` };
  if (m.blocked || m.structureChanged || m.failedCount) return { ok: false, reason: "The latest run was blocked, failed or saw a changed page structure; wait for a clean complete pass." };
  if (m.evaluationEligible === false) return { ok: false, reason: "The latest run was only a slice of the source; wait for a complete pass." };
  if (m.paginationComplete === false) return { ok: false, reason: "The latest run did not finish reading every page; wait for a complete pass." };
  const count = countOf(m);
  if (count === null || count <= 0) return { ok: false, reason: "The latest run found no records; that cannot be accepted as the source's size." };
  const before = buildSourceBaseline(sorted.slice(sorted.indexOf(run) + 1), run.startedAt);
  return {
    ok: true,
    fromStatus: status,
    count,
    previousReference: before.median7d ?? before.median30d,
    metrics: { ...m, evaluationEligible: true, blocked: false, error: undefined, baselineAccepted: true, acceptedFromStatus: status },
  };
}
