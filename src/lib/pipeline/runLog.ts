import { prisma } from "@/lib/db/prisma";

export interface RunLogInput {
  source: string;
  kind: "builtin" | "feed" | "csv" | "cron";
  trigger: "schedule" | "manual" | "cron" | "import";
  status: "ok" | "error" | "skipped" | "blocked" | "policy_block"; // policy_block = our own do-not-fetch list refused the address (not the website)
  created?: number;
  updated?: number;
  duplicates?: number;
  rejected?: number;
  aiTokens?: number;
  message?: string;
  startedAt?: Date;
}

/** Records one pipeline run for Admin → Data Engine → History. Never throws: logging must not break a run. */
export async function logRun(input: RunLogInput) {
  const startedAt = input.startedAt ?? new Date();
  try {
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
        message: input.message?.slice(0, 2000),
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
