/*
 * Property identity: "are these two listings the SAME physical property?" (pure, no database).
 *
 * This module holds the title helpers and the matching decision that used to live inline in csvImport.ts.
 * Step 1 of the dedup hardening moved them here unchanged (legacyImportMatch) so the current behaviour could be pinned by tests.
 */

const STOP = new Set(["the", "a", "an", "of", "in", "at", "and", "for", "on", "to", "no", "near", "flat", "property", "situated", "bearing"]);

/** Informative words of a title (lower case, punctuation removed, filler words dropped). */
export function titleTokens(title: string): Set<string> {
  return new Set(title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t)));
}

/** Jaccard overlap of two token sets (0 to 1). */
export function titleOverlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Near-identical titles (overlap of 80% or more). */
export const titlesSimilar = (a: Set<string>, b: Set<string>): boolean => titleOverlap(a, b) >= 0.8 && a.size > 0 && b.size > 0;

export function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export interface IdentityFacts {
  tokens: Set<string>;
  reserve: number | null;
  start: Date | null;
}

/**
 * The matching rule exactly as it was before the hardening (csvImport.ts, "hit" lookup), for listings of the same bank:
 *   near-identical title, OR same reserve price and same auction day, OR same reserve price and 40% title overlap.
 * It is kept only so tests can show what it did; it is NOT safe (see tests/dedupe.test.ts).
 */
export function legacyImportMatch(candidate: IdentityFacts, known: IdentityFacts): boolean {
  const reservePrice = candidate.reserve ?? 0;
  return (
    titlesSimilar(candidate.tokens, known.tokens) ||
    (reservePrice > 0 && known.reserve === reservePrice && !!candidate.start && !!known.start && sameDay(candidate.start, known.start)) ||
    (reservePrice > 0 && known.reserve === reservePrice && titleOverlap(candidate.tokens, known.tokens) >= 0.4)
  );
}
