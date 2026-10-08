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
  httpStatus?: number;
  apiStatus?: string;
  blocked?: boolean;
  structureChanged?: boolean;
  error?: string;
}

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
}

export interface CompletenessResult {
  status: DataHealthStatus;
  score: number | null;
  reason: string;
  protectExistingData: boolean;
  baseline: SourceBaseline;
  currentCount: number | null;
  countDropRatio: number | null;
  pageDropRatio: number | null;
}

export interface HistoricalRun {
  startedAt: Date;
  technicalStatus: string;
  metrics: SourceRunMetrics;
  dataStatus?: DataHealthStatus;
}

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

export function buildSourceBaseline(runs: HistoricalRun[], now = new Date()): SourceBaseline {
  const valid = runs
    .filter((r) => r.metrics.evaluationEligible !== false)
    .map((r) => ({ ...r, count: countOf(r.metrics) }))
    .filter((r): r is typeof r & { count: number } => r.count !== null);

  const since7 = now.getTime() - 7 * 864e5;
  const since30 = now.getTime() - 30 * 864e5;
  const r7 = valid.filter((r) => r.startedAt.getTime() >= since7);
  const r30 = valid.filter((r) => r.startedAt.getTime() >= since30);

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
    median7d: median(r7.map((r) => r.count)),
    min7d: r7.length ? Math.min(...r7.map((r) => r.count)) : null,
    max7d: r7.length ? Math.max(...r7.map((r) => r.count)) : null,
    median30d: median(r30.map((r) => r.count)),
    recentTrend: trend,
    lastSuccessfulRun: successful?.startedAt.toISOString() ?? null,
    lastCompleteRun: complete?.startedAt.toISOString() ?? null,
    lastIncompleteRun: incomplete?.startedAt.toISOString() ?? null,
    sampleCount7d: r7.length,
    sampleCount30d: r30.length,
  };
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

  const pageReference = baseline.median7d ?? baseline.median30d;
  const currentPages = metrics.pagesFetched;
  const pageDropRatio = currentPages !== undefined && pageReference && pageReference > 0
    ? Math.max(0, (pageReference - currentPages) / pageReference)
    : null;

  const protect = (status: DataHealthStatus) =>
    ["WARNING", "INCOMPLETE", "CRITICAL", "BLOCKED", "FAILED", "NO_DATA"].includes(status);

  if (metrics.blocked) {
    return { status: "BLOCKED", score: 0, reason: "Source access was blocked/refused; existing data must be preserved.", protectExistingData: true, baseline, currentCount, countDropRatio, pageDropRatio };
  }
  if (metrics.structureChanged) {
    return { status: "CRITICAL", score: 0, reason: "Source response structure changed; completeness cannot be trusted.", protectExistingData: true, baseline, currentCount, countDropRatio, pageDropRatio };
  }
  if (metrics.failedCount && metrics.failedCount > 0 && currentCount === null) {
    return { status: "FAILED", score: 0, reason: metrics.error || "Source run failed before a trustworthy inventory count was produced.", protectExistingData: true, baseline, currentCount, countDropRatio, pageDropRatio };
  }
  if (metrics.paginationComplete === false && metrics.evaluationEligible !== false) {
    return { status: "INCOMPLETE", score: 35, reason: "Pagination did not complete; the run is not a complete inventory.", protectExistingData: true, baseline, currentCount, countDropRatio, pageDropRatio };
  }
  if (currentCount === 0 && reference && reference > 0) {
    return { status: "CRITICAL", score: 0, reason: "The source returned zero records against a non-zero historical baseline.", protectExistingData: true, baseline, currentCount, countDropRatio: 1, pageDropRatio };
  }
  if (currentCount === null) {
    return { status: "RECOVERING", score: null, reason: "No comparable inventory count is available yet; historical baseline is still being established.", protectExistingData: false, baseline, currentCount, countDropRatio, pageDropRatio };
  }
  if (!reference || baseline.sampleCount7d + baseline.sampleCount30d === 0) {
    return { status: currentCount === 0 ? "NO_DATA" : "RECOVERING", score: currentCount === 0 ? 0 : null, reason: "First comparable run; source-specific historical baseline is not established yet.", protectExistingData: currentCount === 0, baseline, currentCount, countDropRatio, pageDropRatio };
  }
  if (pageDropRatio !== null && pageDropRatio >= 0.6) {
    return { status: "CRITICAL", score: 20, reason: `Fetched pages dropped by ${Math.round(pageDropRatio * 100)}% versus the source baseline.`, protectExistingData: true, baseline, currentCount, countDropRatio, pageDropRatio };
  }
  if (countDropRatio !== null && countDropRatio >= 0.6) {
    return { status: "CRITICAL", score: 20, reason: `Inventory dropped by ${Math.round(countDropRatio * 100)}% versus the source baseline.`, protectExistingData: true, baseline, currentCount, countDropRatio, pageDropRatio };
  }
  if (countDropRatio !== null && countDropRatio >= 0.3) {
    return { status: "INCOMPLETE", score: 45, reason: `Inventory dropped by ${Math.round(countDropRatio * 100)}% versus the source baseline.`, protectExistingData: true, baseline, currentCount, countDropRatio, pageDropRatio };
  }
  if ((countDropRatio !== null && countDropRatio >= 0.1) || (pageDropRatio !== null && pageDropRatio >= 0.1)) {
    const pct = Math.round(Math.max(countDropRatio ?? 0, pageDropRatio ?? 0) * 100);
    return { status: "WARNING", score: Math.max(0, 100 - pct), reason: `Inventory/page volume is down ${pct}% versus the source baseline.`, protectExistingData: true, baseline, currentCount, countDropRatio, pageDropRatio };
  }
  if (metrics.rejectedCount && currentCount > 0 && metrics.rejectedCount / currentCount >= 0.3) {
    return { status: "WARNING", score: 60, reason: "Rejected-record volume is unusually high for this run.", protectExistingData: true, baseline, currentCount, countDropRatio, pageDropRatio };
  }
  return { status: "HEALTHY", score: 100, reason: "Inventory volume and pagination are within the source-specific historical baseline.", protectExistingData: false, baseline, currentCount, countDropRatio, pageDropRatio };
}

export function parseMetricsMessage(message: string | null | undefined): { metrics: SourceRunMetrics; dataStatus?: DataHealthStatus } | null {
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

export function formatMetricsMessage(
  metrics: SourceRunMetrics,
  result: CompletenessResult,
  humanMessage?: string,
): string {
  const payload = JSON.stringify({
    metrics,
    dataStatus: result.status,
    completenessScore: result.score,
    reason: result.reason,
    baseline: result.baseline,
  });
  return `[DATA_ENGINE_V1] ${payload}\n${humanMessage ?? ""}`.slice(0, 2000);
}
