import { prisma } from "@/lib/db/prisma";
import {
  buildSourceBaseline,
  evaluateCompleteness,
  formatMetricsMessage,
  parseMetricsMessage,
  type DataHealthStatus,
  type HistoricalRun,
  type SourceRunMetrics,
} from "./completeness";
import { protectionFromRuns, unreadableProtection, type SourceProtection } from "./sourceProtection";

export interface RunLogInput {
  source: string;
  kind: "builtin" | "feed" | "csv" | "cron";
  trigger: "schedule" | "manual" | "cron" | "import";
  status: "ok" | "error" | "skipped" | "blocked" | "policy_block";
  created?: number;
  updated?: number;
  duplicates?: number;
  rejected?: number;
  aiTokens?: number;
  message?: string;
  startedAt?: Date;
  /** Optional source inventory/run metrics. Stored in the existing message column; no schema migration required. */
  metrics?: SourceRunMetrics;
}

/** Recent runs of one source (last 30 days, newest first) that carry a data-engine verdict. Throws if the database cannot be read. */
async function loadHistoricalRuns(source: string): Promise<HistoricalRun[]> {
  const previous = await prisma.sourceRunLog.findMany({
    where: { source, startedAt: { gte: new Date(Date.now() - 30 * 864e5) } },
    orderBy: { startedAt: "desc" },
    take: 60,
    select: { startedAt: true, status: true, message: true },
  });
  const runs: HistoricalRun[] = [];
  for (const r of previous as { startedAt: Date; status: string; message: string | null }[]) {
    const parsed = parseMetricsMessage(r.message);
    if (!parsed) continue;
    runs.push({
      startedAt: r.startedAt,
      technicalStatus: r.status,
      metrics: parsed.metrics,
      dataStatus: parsed.dataStatus,
      protectExistingData: parsed.protectExistingData,
    });
  }
  return runs;
}

/**
 * Data-safety state of a source: is its latest evaluated run anomalous? Used by every automatic source-driven removal
 * (see sourceRemoval.ts). Fails CLOSED: if the history cannot be read, the source counts as protected.
 */
export async function getSourceProtection(source: string): Promise<SourceProtection> {
  try {
    return protectionFromRuns(await loadHistoricalRuns(source));
  } catch (e) {
    return unreadableProtection(e);
  }
}

/**
 * Size of the source index (inventoryCount) at the last HEALTHY full pass of a source, or undefined if there is none or it
 * cannot be read. Used by incremental collectors to notice an index collapse on every run, not only on full passes.
 * Unlike the 60-row history window, this does not drift: a collapse that persists never becomes the reference.
 */
export async function getLastHealthyInventory(source: string): Promise<number | undefined> {
  try {
    const row = await prisma.sourceRunLog.findFirst({
      where: {
        source,
        startedAt: { gte: new Date(Date.now() - 30 * 864e5) },
        AND: [{ message: { contains: '"dataStatus":"HEALTHY"' } }, { message: { contains: '"evaluationEligible":true' } }],
      },
      orderBy: { startedAt: "desc" },
      select: { message: true },
    });
    const count = parseMetricsMessage(row?.message)?.metrics.inventoryCount;
    return typeof count === "number" && count > 0 ? count : undefined;
  } catch {
    return undefined; // an extra safety check; if it cannot be read the normal verdicts still apply
  }
}

/** Records one pipeline run for Admin → Data Engine → History. Never throws: logging must not break a run. */
export async function logRun(input: RunLogInput) {
  const startedAt = input.startedAt ?? new Date();
  try {
    let message = input.message?.slice(0, 2000);
    if (input.metrics) {
      const historical = await loadHistoricalRuns(input.source);

      const baseline = buildSourceBaseline(historical, startedAt);
      const result = evaluateCompleteness(input.metrics, baseline);
      message = formatMetricsMessage(input.metrics, result, input.message);
    }

    await prisma.sourceRunLog.create({
      data: {
        source: input.source,
        kind: input.kind,
        trigger: input.trigger,
        status: input.status,
        created: input.created ?? 0,
        updated: input.updated ?? 0,
        duplicates: input.duplicates ?? 0,
        rejected: input.rejected ?? 0,
        aiTokens: input.aiTokens ?? 0,
        message,
        startedAt,
        durationMs: Date.now() - startedAt.getTime(),
      },
    });
    // Keep the table small: drop entries older than 60 days occasionally.
    if (Math.random() < 0.02) {
      await prisma.sourceRunLog.deleteMany({ where: { startedAt: { lt: new Date(Date.now() - 60 * 864e5) } } });
    }
  } catch {
    /* ignore */
  }
}

/** Extract the latest data-health state from a run-log message without changing the existing schema. */
export function dataHealthFromRunMessage(message: string | null | undefined): DataHealthStatus | null {
  return parseMetricsMessage(message)?.dataStatus ?? null;
}
