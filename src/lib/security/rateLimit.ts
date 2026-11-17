import { prisma } from "@/lib/db/prisma";

/**
 * Sliding-window rate limit backed by the DB.
 * Uses SourceRunLog rows with source="rate_limit:<route>:<ip>" to count attempts.
 * No schema change required.
 *
 * Returns true if the action is allowed; false if the limit is exceeded.
 */
export async function checkRateLimit(
  route: string,
  ip: string,
  options: { windowMs?: number; max?: number } = {}
): Promise<boolean> {
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const max = options.max ?? 10;
  const source = `rate_limit:${route}:${ip}`;
  const since = new Date(Date.now() - windowMs);

  try {
    const count = await prisma.sourceRunLog.count({
      where: { source, startedAt: { gte: since } },
    });

    if (count >= max) return false;

    await prisma.sourceRunLog.create({
      data: {
        source,
        kind: "rate_limit",
        trigger: "request",
        status: "ok",
        startedAt: new Date(),
        durationMs: 0,
      },
    });

    return true;
  } catch {
    // Fail open: if DB is unavailable, allow the request
    return true;
  }
}
