/*
 * Automatic recovery (Phase 3, PR 7). Pure logic, no database.
 *
 *   HEALTHY -> COLLAPSED -> PROTECTED -> RECOVERY QUEUED -> FULL HEALTHY PASS -> HEALTHY
 *
 * A source whose size collapsed (verdict INCOMPLETE or CRITICAL) is already PROTECTED by sourceProtection.ts. Until now a person had to
 * start a full pass to get a fresh, trustworthy reading. Here the engine queues ONE full pass by itself.
 *
 * Rules (each is tested):
 *  - only after protection is active, only for a collapse (INCOMPLETE / CRITICAL). BLOCKED, FAILED, WARNING and NO_DATA need a person:
 *    re-running cannot fix a refusal, and we never go looking for another way in.
 *  - one request at a time; a cooldown between requests; a cap on attempts per collapse; a queued request expires.
 *  - recovery NEVER clears protection. Protection is derived from the latest evaluated run (sourceProtection.ts), so only a complete,
 *    HEALTHY pass that started after the request ends it. Partial / incremental passes change nothing.
 *  - what "queue" means depends on the source (mechanismFor): BankAuctions.in gets its existing "Import all" switch turned on;
 *    every other source already runs its own full passes on its own schedule, so the request is only recorded and watched.
 */

import type { DataHealthStatus, HistoricalRun } from "./completeness";
import type { SourceProtection } from "./sourceProtection";

export const RECOVERY_KIND = "recovery";
export const COLLAPSE_STATUSES: ReadonlySet<DataHealthStatus> = new Set<DataHealthStatus>(["INCOMPLETE", "CRITICAL"]);
export const RECOVERY_COOLDOWN_MS = 12 * 3_600_000;
export const QUEUE_EXPIRY_MS = 24 * 3_600_000;
export const MAX_RECOVERY_ATTEMPTS = 3;

export type RecoveryState = "QUEUED" | "DONE" | "FAILED_ATTEMPT" | "EXPIRED" | "CANCELLED" | "EXHAUSTED";
export type RecoveryMechanism = "import_all" | "scheduled";

export interface RecoveryEvent {
  id?: string;
  state: RecoveryState;
  at: Date;
  mechanism: RecoveryMechanism;
  reason: string;
}

export const mechanismFor = (source: string): RecoveryMechanism => (source === "BankAuctions.in" ? "import_all" : "scheduled");

export type RecoveryAction = "queue" | "complete" | "fail_attempt" | "expire" | "cancel" | "exhausted" | "none";
export interface RecoveryPlan {
  action: RecoveryAction;
  reason: string;
}

const isCompletePass = (r: HistoricalRun) => r.metrics.evaluationEligible !== false && r.metrics.paginationComplete === true;

export function planRecovery(input: {
  protection: SourceProtection;
  /** newest first */
  history: HistoricalRun[];
  /** newest first */
  events: RecoveryEvent[];
  now: Date;
  mechanism: RecoveryMechanism;
}): RecoveryPlan {
  const { protection, history, events, now } = input;
  const newest = events[0];

  if (newest && newest.state === "QUEUED") {
    const after = history.filter((r) => r.dataStatus !== undefined && r.startedAt.getTime() >= newest.at.getTime());
    const full = after.find(isCompletePass);
    if (full) {
      if (full.dataStatus === "HEALTHY" && !protection.protected) return { action: "complete", reason: "A complete pass came back HEALTHY; protection ended because of that run." };
      if (full.dataStatus === "HEALTHY") return { action: "none", reason: "A complete HEALTHY pass is in, but protection is still on; waiting for the next evaluation." };
      return { action: "fail_attempt", reason: `The complete pass came back ${full.dataStatus}; protection stays on.` };
    }
    if (!protection.protected && protection.basis === "verdict") return { action: "cancel", reason: "Protection ended without a complete pass (another run or an admin decision); the request is closed." };
    if (now.getTime() - newest.at.getTime() > QUEUE_EXPIRY_MS) return { action: "expire", reason: "No complete pass finished within 24 hours; the request expired." };
    return { action: "none", reason: "Recovery already queued; waiting for a complete pass (partial passes do not count)." };
  }

  if (!protection.protected || protection.basis !== "verdict") return { action: "none", reason: "Source is not protected; nothing to recover." };
  const status = protection.status;
  if (!status || !COLLAPSE_STATUSES.has(status)) return { action: "none", reason: `Latest verdict is ${status ?? "unknown"}; this is not a size collapse, so a person needs to look at it.` };

  const lastHealthyAt = history.find((r) => r.dataStatus === "HEALTHY")?.startedAt.getTime() ?? -Infinity;
  const episode = events.filter((e) => e.at.getTime() > lastHealthyAt);
  if (episode.some((e) => e.state === "EXHAUSTED")) return { action: "none", reason: "Automatic recovery already gave up for this collapse; a person must decide." };
  const queued = episode.filter((e) => e.state === "QUEUED");
  if (queued.length >= MAX_RECOVERY_ATTEMPTS) {
    return { action: "exhausted", reason: `${queued.length} automatic recovery passes did not restore the source. Look at the source, then ask an admin to accept the new size (Coverage page) if the change is real.` };
  }
  const last = queued[0];
  if (last && now.getTime() - last.at.getTime() < RECOVERY_COOLDOWN_MS) {
    const hours = Math.ceil((RECOVERY_COOLDOWN_MS - (now.getTime() - last.at.getTime())) / 3_600_000);
    return { action: "none", reason: `Last recovery request was recent; wait about ${hours} more hour(s).` };
  }
  return { action: "queue", reason: `Source collapsed (${status}) and is protected; queueing one full recovery pass (attempt ${queued.length + 1} of ${MAX_RECOVERY_ATTEMPTS}).` };
}

/** The only operations the executor needs. */
export interface RecoveryStore {
  events(source: string): Promise<RecoveryEvent[]>; // newest first, with ids
  add(source: string, event: RecoveryEvent): Promise<string>;
  remove(id: string): Promise<void>;
  /** Start the extra full pass. For "scheduled" this does nothing: the source's own schedule does the pass. */
  startFullPass(source: string, mechanism: RecoveryMechanism): Promise<void>;
}

const STATE_FOR: Record<Exclude<RecoveryAction, "queue" | "none">, RecoveryState> = {
  complete: "DONE",
  fail_attempt: "FAILED_ATTEMPT",
  expire: "EXPIRED",
  cancel: "CANCELLED",
  exhausted: "EXHAUSTED",
};

/** One step of the recovery lifecycle for a source. Safe to call on every run. */
export async function advanceRecovery(
  store: RecoveryStore,
  input: { source: string; protection: SourceProtection; history: HistoricalRun[]; now: Date },
): Promise<RecoveryPlan> {
  const events = await store.events(input.source);
  const mechanism = mechanismFor(input.source);
  const plan = planRecovery({ protection: input.protection, history: input.history, events, now: input.now, mechanism });
  if (plan.action === "none") return plan;

  if (plan.action !== "queue") {
    await store.add(input.source, { state: STATE_FOR[plan.action], at: input.now, mechanism, reason: plan.reason });
    return plan;
  }

  const id = await store.add(input.source, { state: "QUEUED", at: input.now, mechanism, reason: plan.reason });
  // Two runs can reach this point together. Everything queued since the last event counts as one episode: the earliest wins.
  const prev = events[0];
  const mine = (await store.events(input.source))
    .filter((e) => e.state === "QUEUED" && (!prev || e.at.getTime() > prev.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime() || String(a.id).localeCompare(String(b.id)));
  if (mine[0]?.id !== id) {
    await store.remove(id);
    return { action: "none", reason: "Another run queued the recovery at the same moment." };
  }
  await store.startFullPass(input.source, mechanism);
  return plan;
}
