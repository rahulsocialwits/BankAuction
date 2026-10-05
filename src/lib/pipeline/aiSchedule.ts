import { prisma } from "@/lib/db/prisma";

/*
 * Central scheduler timing (Asia/Kolkata).
 * AI/web-source work is eligible on every 15-minute scheduler slot.
 * The old 6-hour AI-slot restriction has been removed.
 */

export const AI_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60_000;
const SLOT_MS = 15 * 60_000;

export function slotStartFor(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Math.floor(ist.getTime() / SLOT_MS) * SLOT_MS - IST_OFFSET_MS);
}
export const nextSlotStart = (now: Date = new Date()) => new Date(slotStartFor(now).getTime() + SLOT_MS);
export function aiWindow(now: Date = new Date()): { open: boolean; slotStart: Date } {
  return { open: true, slotStart: slotStartFor(now) };
}

export const istLabel = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: AI_TIMEZONE, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d) + " IST";

// ---------------------------------------------------------------------------------------------------------------------
// Slot work that is not tied to one source (location checks, AI review): runs once per slot.
// ---------------------------------------------------------------------------------------------------------------------

const SLOT_SOURCE = "AI slot";

/** True for exactly one caller per slot window. The marker row is hidden from Run History (kind "ai-slot"). */
export async function claimAiSlotWork(slotStart: Date): Promise<boolean> {
  const tag = `slot ${slotStart.toISOString()}`;
  try {
    const existing = await prisma.sourceRunLog.findFirst({ where: { kind: "ai-slot", source: SLOT_SOURCE, message: tag }, select: { id: true } });
    if (existing) return false;
    const mine = await prisma.sourceRunLog.create({ data: { source: SLOT_SOURCE, kind: "ai-slot", trigger: "schedule", status: "ok", message: tag } });
    const first = await prisma.sourceRunLog.findFirst({ where: { kind: "ai-slot", source: SLOT_SOURCE, message: tag }, orderBy: [{ startedAt: "asc" }, { id: "asc" }], select: { id: true } });
    return first?.id === mine.id; // if two ticks raced, only the earliest marker wins
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Per-source run lock: one AI scan per source at a time.
// ---------------------------------------------------------------------------------------------------------------------

const LOCK_STALE_MS = 10 * 60_000;

/** Returns a lock id, or null when an AI scan of this source is already running. */
export async function acquireAiLock(source: string): Promise<string | null> {
  const name = `AI lock: ${source}`;
  const live = { kind: "ai-slot", source: name, status: "running", startedAt: { gte: new Date(Date.now() - LOCK_STALE_MS) } };
  try {
    if (await prisma.sourceRunLog.findFirst({ where: live, select: { id: true } })) return null;
    const mine = await prisma.sourceRunLog.create({ data: { source: name, kind: "ai-slot", trigger: "schedule", status: "running", message: "AI scan in progress" } });
    const first = await prisma.sourceRunLog.findFirst({ where: live, orderBy: [{ startedAt: "asc" }, { id: "asc" }], select: { id: true } });
    if (first?.id !== mine.id) {
      await prisma.sourceRunLog.delete({ where: { id: mine.id } }).catch(() => undefined);
      return null;
    }
    return mine.id;
  } catch {
    return "unlocked"; // the lock table failed: do not block the run because of it
  }
}

export async function releaseAiLock(id: string | null) {
  if (!id || id === "unlocked") return;
  await prisma.sourceRunLog.update({ where: { id }, data: { status: "ok", message: "AI scan finished" } }).catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------------------------------
// For the admin card
// ---------------------------------------------------------------------------------------------------------------------

export async function aiScheduleStatus(now: Date = new Date()) {
  const { open, slotStart } = aiWindow(now);
  const ran = await prisma.sourceRunLog.findFirst({ where: { kind: "ai-slot", source: SLOT_SOURCE, message: `slot ${slotStart.toISOString()}` }, select: { startedAt: true } }).catch(() => null);
  const last = await prisma.sourceRunLog.findFirst({ where: { kind: "ai-slot", source: SLOT_SOURCE }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }).catch(() => null);
  return {
    slots: ["Every 15 minutes"],
    timezone: `${AI_TIMEZONE} (IST)`,
    windowOpen: open,
    ranThisSlot: !!ran,
    nextAt: nextSlotStart(now),
    lastRunAt: last?.startedAt ?? null,
  };
}
