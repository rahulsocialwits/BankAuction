import { prisma } from "@/lib/db/prisma";
import {
  buildSourceBaseline,
  evaluateCompleteness,
  formatMetricsMessage,
  parseMetricsMessage,
  type DataHealthStatus,
  type SourceRunMetrics,
} from "./completeness";

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

/** Records one pipeline run for Admin → Data Engine → History. Never throws: logging must not break a run. */
export async function logRun(input: RunLogInput) {
  const startedAt = input.startedAt ?? new Date();
  try {
    let message = input.message?.slice(0, 2000);
    if (input.metrics) {
      const previous = await prisma.sourceRunLog.findMany({
        where: {
          source: input.source,
          startedAt: { gte: new Date(Date.now() - 30 * 864e5) },
        },
        orderBy: { startedAt: "desc" },
        take: 60,
        select: { startedAt: true, status: true, message: true },
      });

      const historical = previous
        .map((r) => {
          const parsed = parseMetricsMessage(r.message);
          return parsed
            ? { startedAt: r.startedAt, technicalStatus: r.status, metrics: parsed.metrics, dataStatus: parsed.dataStatus }
            : null;
        })
        .filter((r): r is NonNullable<typeof r> => !!r);

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
