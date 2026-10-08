import type { DataHealthStatus, HistoricalRun } from "./completeness";

/*
 * Source data protection (pure logic, no database, no Prisma).
 *
 * The completeness engine (completeness.ts) judges every source run. This module turns the latest judgement into a
 * decision the write layer can obey: "an automatic action that REMOVES or HIDES an existing listing, because of what
 * the source returned, must not run while the source's latest evaluated run is anomalous".
 *
 * What this is NOT: it never touches normal auction-date lifecycle (deriveAuctionStatusFromDates). An auction that
 * passes its date is completed whatever the source health. It only gates removals that are driven by source content.
 */

/** Verdicts for which completeness.ts sets protectExistingData = true. Used for rows written before the flag was stored. */
export const PROTECTIVE_STATUSES: ReadonlySet<DataHealthStatus> = new Set<DataHealthStatus>([
  "WARNING",
  "INCOMPLETE",
  "CRITICAL",
  "BLOCKED",
  "FAILED",
  "NO_DATA",
]);

export interface SourceProtection {
  /** true = automatic source-driven removals for this source must be skipped. */
  protected: boolean;
  /** The verdict this decision rests on; null when no evaluated run exists. */
  status: DataHealthStatus | null;
  reason: string;
  evaluatedAt: string | null;
  /** verdict = from an evaluated run; none = no evaluated run (nothing to protect against); unreadable = history could not be read (fails closed). */
  basis: "verdict" | "none" | "unreadable";
}

/**
 * The run that decides the source's current protection: the newest run that carries a verdict.
 * Skipped: runs with no verdict, and RECOVERING runs (incremental / not yet evaluable) that did not ask for protection, so a
 * routine incremental run cannot silently "clear" an earlier anomalous full pass. A RECOVERING run that DID ask for protection
 * (an unresolved anomaly with no healthy baseline left to compare against, see completeness.ts) is a verdict and keeps it on.
 */
export function latestEvaluatedRun(runs: HistoricalRun[]): HistoricalRun | undefined {
  return runs.find((r) => r.dataStatus !== undefined && (r.dataStatus !== "RECOVERING" || r.protectExistingData === true));
}

/** Latest protection state from a source's recent runs, NEWEST FIRST. */
export function protectionFromRuns(runs: HistoricalRun[]): SourceProtection {
  const evaluated = latestEvaluatedRun(runs);
  if (!evaluated || !evaluated.dataStatus) {
    return { protected: false, status: null, reason: "No evaluated run in the recent history; nothing indicates an anomaly.", evaluatedAt: null, basis: "none" };
  }
  const status = evaluated.dataStatus;
  const isProtected = evaluated.protectExistingData ?? PROTECTIVE_STATUSES.has(status);
  return {
    protected: isProtected,
    status,
    reason: isProtected
      ? `Latest evaluated run is ${status}: existing data is protected from source-driven removal.`
      : `Latest evaluated run is ${status}.`,
    evaluatedAt: evaluated.startedAt.toISOString(),
    basis: "verdict",
  };
}

/** When the run history cannot be read, protect (a failed safety check must not become permission to remove data). */
export function unreadableProtection(error: unknown): SourceProtection {
  return {
    protected: true,
    status: null,
    reason: `Source health could not be read (${error instanceof Error ? error.message.slice(0, 120) : "unknown error"}); removal skipped.`,
    evaluatedAt: null,
    basis: "unreadable",
  };
}

/** Policy for automatic removals that already exist (thin-listing hide, notice removal): allowed unless the source is flagged. */
export const allowsAutomaticRemoval = (p: SourceProtection): boolean => !p.protected;

/**
 * Stricter policy for any FUTURE disappearance-based action ("this listing is no longer on the source"): it needs a
 * positive, current HEALTHY verdict. No verdict, or a RECOVERING-only history, is not enough.
 * No such action exists in the code today; whoever adds one must go through this function.
 */
export const allowsDisappearanceAction = (p: SourceProtection): boolean => !p.protected && p.status === "HEALTHY";

/** statusSource values look like "feed:<source name>"; the run log uses "<source name>". */
export const sourceNameFromStatusSource = (statusSource: string | null | undefined): string | null => {
  if (!statusSource) return null;
  const name = statusSource.startsWith("feed:") ? statusSource.slice("feed:".length) : statusSource;
  return name.trim() || null;
};

export interface RemovalRequest {
  propertyId: string;
  /** PropertyChange.field to log, e.g. "thin_fix" or "deep_scan". */
  field: string;
  oldValue?: string;
  /** Human reason, stored as the PropertyChange newValue. */
  reason: string;
}

/** The only operation the guarded layer needs from storage. */
export interface RemovalStore {
  hide(request: RemovalRequest): Promise<void>;
}

export type RemovalOutcome = { applied: true } | { applied: false; skipped: string };

/**
 * THE gate for source-driven removal of an existing listing. Applies the removal only when the source is not protected.
 * Existing valid records are left untouched otherwise.
 */
export async function removeListingIfSourceTrusted(
  store: RemovalStore,
  protection: SourceProtection,
  request: RemovalRequest,
): Promise<RemovalOutcome> {
  if (!allowsAutomaticRemoval(protection)) return { applied: false, skipped: protection.reason };
  await store.hide(request);
  return { applied: true };
}
