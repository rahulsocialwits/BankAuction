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
  httpStatus?: number;
  apiStatus?: string;
  blocked?: boolean;
  structureChanged?: boolean;
  error?: string;
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

export function buildSourceBaseline(runs: HistoricalRun[], now = new Date()): SourceBaseline {
  const eligible = runs.filter((r) => r.metrics.evaluationEligible !== false);
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

  // Some collectors intentionally run incrementally (for example, a 100-page safety tick).
  // Those runs must contribute no completeness verdict until the collector says the inventory pass is complete.
  if (metrics.evaluationEligible === false) {
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
    return make("RECOVERING", null, "No comparable inventory count is available yet; historical baseline is still being established.", false);
  }
  if (!reference || baseline.sampleCount7d + baseline.sampleCount30d === 0) {
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
): { metrics: SourceRunMetrics; dataStatus?: DataHealthStatus; protectExistingData?: boolean } | null {
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
