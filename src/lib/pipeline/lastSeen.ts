import type { DataHealthStatus, SourceRunMetrics } from "./completeness";
import { allowsDisappearanceAction, type SourceProtection } from "./sourceProtection";

/*
 * Last-seen / disappearance tracking (pure logic + a store interface; the Prisma store is lastSeenStore.ts).
 *
 * FLAG-ONLY. The flow is
 *   SOURCE HEALTHY -> LISTING NOT SEEN -> DISAPPEARANCE FLAG -> ADMIN REVIEW -> (future) controlled action
 * and never
 *   SOURCE ERROR -> LISTING NOT SEEN -> REMOVE.
 * Nothing in here changes a Property or an Auction. The only writes are the tracking rows themselves.
 *
 * - A SIGHTING is recorded every time an importer reads a listing (markSeen).
 * - A SWEEP runs once, right after a source finishes a COMPLETE pass whose verdict is HEALTHY and whose protection is clear.
 *   Listings that were not seen during that pass get their missing count +1; at DEFAULT_MISSING_PASSES consecutive missed
 *   passes they are flagged. A listing seen again clears its flag.
 * - A source takes part only if it declares when its pass started (metrics.passStartedAt). Today that is BAANKNET only.
 */

/** Consecutive healthy full passes a listing must miss before it is flagged. */
export const DEFAULT_MISSING_PASSES = 2;
/** If more than this share of the tracked listings is missing from one pass, nothing is flagged (a bad read that the metrics did not catch). */
export const MAX_MISSING_SHARE = 0.2;
/** The share guard applies from this many tracked listings upward (below it, a few real removals look like a big share). */
export const MIN_FOR_SHARE_GUARD = 20;

export const SEEN_PREFIX = "seen:";
export const MISSING_PREFIX = "missing:";
export const FLAG_FIELD = "disappearance_flag";
export const CLEAR_FIELD = "disappearance_cleared";

export interface MissingState {
  /** Consecutive qualifying passes the listing was missing from. */
  n: number;
  flagged: boolean;
  /** Start of the last pass that counted (so the same pass is never counted twice). */
  pass: string | null;
  flaggedAt?: string;
}

export interface SweepCandidate {
  propertyId: string;
  lastSeenAt: Date;
  missing: MissingState | null;
}

export interface LastSeenStore {
  /** Record that these listings were seen now (creates or refreshes one pointer per listing and source). */
  touch(source: string, propertyIds: string[], now: Date): Promise<void>;
  /** Which of these listings currently carry a disappearance flag for the source. */
  flaggedAmong(source: string, propertyIds: string[]): Promise<string[]>;
  /** Tracked listings of the source that are published and still open (an ended auction leaving a source is normal). */
  candidates(source: string): Promise<SweepCandidate[]>;
  saveState(source: string, propertyId: string, state: MissingState): Promise<void>;
  /** One history note on the listing (PropertyChange). */
  audit(propertyId: string, field: string, note: string): Promise<void>;
}

export type GateInput = { metrics: SourceRunMetrics; dataStatus: DataHealthStatus | null | undefined; protection: SourceProtection };
export type Gate = { ok: true; passStartedAt: Date } | { ok: false; reason: string };

/**
 * THE gate. A disappearance sweep needs: a HEALTHY verdict on a COMPLETE, eligible full pass that says when it started, no block /
 * failure / structure change, and the stricter allowsDisappearanceAction (a positive HEALTHY, nothing flagged; fails closed).
 */
export function disappearanceGate(input: GateInput): Gate {
  const { metrics: m, dataStatus, protection } = input;
  if (dataStatus !== "HEALTHY") return { ok: false, reason: `the pass is ${dataStatus ?? "unevaluated"}, not HEALTHY` };
  if (m.evaluationEligible === false) return { ok: false, reason: "the run was only a slice of the source" };
  if (m.paginationComplete !== true) return { ok: false, reason: "the pass did not complete" };
  if (m.blocked || m.structureChanged || m.failedCount) return { ok: false, reason: "the run was blocked, failed or saw a changed page structure" };
  const started = m.passStartedAt ? new Date(m.passStartedAt) : null;
  if (!started || Number.isNaN(started.getTime())) return { ok: false, reason: "the source does not say when its pass started" };
  if (!allowsDisappearanceAction(protection)) return { ok: false, reason: `source protection does not allow it (${protection.reason})` };
  return { ok: true, passStartedAt: started };
}

/** Records sightings. A listing that was flagged and is seen again is cleared at once. Never throws. */
export async function markSeen(store: LastSeenStore, source: string, propertyIds: Iterable<string>, now: Date = new Date()): Promise<void> {
  try {
    const ids = [...new Set(propertyIds)];
    if (!ids.length) return;
    await store.touch(source, ids, now);
    const flagged = await store.flaggedAmong(source, ids);
    for (const id of flagged) {
      await store.saveState(source, id, { n: 0, flagged: false, pass: null });
      await store.audit(id, CLEAR_FIELD, `[last-seen] Seen again on ${source} (${now.toISOString().slice(0, 10)}): the disappearance flag was cleared.`);
    }
  } catch {
    /* tracking must never break an import */
  }
}

export type SweepOutcome =
  | { evaluated: false; reason: string }
  | { evaluated: true; candidates: number; seen: number; missing: number; flagged: number; cleared: number; skippedReason?: string };

export async function runDisappearanceSweep(
  store: LastSeenStore,
  source: string,
  input: GateInput,
  opts: { threshold?: number; now?: Date } = {},
): Promise<SweepOutcome> {
  const gate = disappearanceGate(input);
  if (!gate.ok) return { evaluated: false, reason: gate.reason };
  const threshold = Math.max(1, opts.threshold ?? DEFAULT_MISSING_PASSES);
  const passISO = gate.passStartedAt.toISOString();
  const now = opts.now ?? new Date();
  try {
    const all = await store.candidates(source);
    const seen = all.filter((c) => c.lastSeenAt.getTime() >= gate.passStartedAt.getTime());
    const notSeen = all.filter((c) => c.lastSeenAt.getTime() < gate.passStartedAt.getTime());
    let cleared = 0;
    for (const c of seen) {
      if (c.missing && (c.missing.n > 0 || c.missing.flagged)) {
        await store.saveState(source, c.propertyId, { n: 0, flagged: false, pass: passISO });
        if (c.missing.flagged) {
          cleared++;
          await store.audit(c.propertyId, CLEAR_FIELD, `[last-seen] Seen again on ${source} in a healthy full pass: the disappearance flag was cleared.`);
        }
      }
    }
    const tooMany = all.length >= MIN_FOR_SHARE_GUARD && notSeen.length / all.length > MAX_MISSING_SHARE;
    if (tooMany) {
      return { evaluated: true, candidates: all.length, seen: seen.length, missing: notSeen.length, flagged: 0, cleared, skippedReason: `${notSeen.length} of ${all.length} tracked listings (more than ${Math.round(MAX_MISSING_SHARE * 100)}%) were not seen: more likely an incomplete read than real removals, so nothing was flagged` };
    }
    let flagged = 0;
    for (const c of notSeen) {
      if (c.missing?.pass === passISO) continue; // this pass was already counted
      const n = (c.missing?.n ?? 0) + 1;
      const isFlagged = n >= threshold;
      const wasFlagged = c.missing?.flagged === true;
      await store.saveState(source, c.propertyId, { n, flagged: isFlagged, pass: passISO, ...(isFlagged ? { flaggedAt: c.missing?.flaggedAt ?? now.toISOString() } : {}) });
      if (isFlagged && !wasFlagged) {
        flagged++;
        await store.audit(c.propertyId, FLAG_FIELD, `[last-seen] Not seen on ${source} in ${n} consecutive healthy full passes (last seen ${c.lastSeenAt.toISOString().slice(0, 10)}). Flag only: nothing was hidden or removed.`);
      }
    }
    return { evaluated: true, candidates: all.length, seen: seen.length, missing: notSeen.length, flagged, cleared };
  } catch (e) {
    return { evaluated: false, reason: `tracking could not be read or written (${e instanceof Error ? e.message.slice(0, 100) : "unknown error"})` };
  }
}
