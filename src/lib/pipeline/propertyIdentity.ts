/*
 * Property identity: "are these two listings the SAME physical property?" (pure, no database).
 *
 * One decision, used by every automatic path that merges or hides look-alike listings (the importer's match, its last look
 * at the database, and the scheduled exact-duplicate clean-up).
 *
 * PRINCIPLE: a fuzzy match on title, price and date is NOT enough to call two listings the same property. Two flats in one
 * building, or two plots a bank sells at one price on one day, look alike on exactly those three things. A merge needs
 * deterministic evidence: the same source-qualified id, or the same normalised address (with matching numbers), or a very
 * distinctive title (with a plot/flat/survey number) that no address contradicts. When the evidence is not there the listings are
 * kept apart: an extra duplicate is cheap and visible, a silently swallowed real auction is not.
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
  /** The source's own address text (Property.addressText / the record's location). */
  address?: string | null;
  /** The source's auction id. Only a source-qualified one ("src:<host>:<id>") counts as identity evidence here. */
  externalId?: string | null;
}

/* ---- address helpers ---- */

const ADDR_STOP = new Set(["the", "of", "and", "at", "in", "no", "number", "near", "opp", "opposite", "road", "rd", "street", "st", "village", "vill", "dist", "district", "tehsil", "taluka", "taluk", "state", "india", "pin", "pincode", "p", "o", "ps", "po"]);
const PIN = /(?<![0-9])[1-9][0-9]{5}(?![0-9])/;

/** The 6-digit PIN code inside an address text, or null. */
export const extractPin = (text: string | null | undefined): string | null => (text ? (PIN.exec(text)?.[0] ?? null) : null);

/** Informative address words: lower case, PIN and filler removed. Slashes and dashes split ("5171/5952" is two numbers). */
export function addressTokens(text: string | null | undefined): Set<string> {
  const t = (text ?? "").toLowerCase().replace(PIN, " ").replace(/[^a-z0-9]+/g, " ");
  return new Set(t.split(" ").filter((w) => w && !ADDR_STOP.has(w)));
}

const numbersOf = (tokens: Set<string>): Set<string> => new Set([...tokens].filter((w) => /[0-9]/.test(w)));
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

export type AddressRelation =
  | "match" //     the same address: nearly the same words AND the same numbers (plot / flat / survey numbers)
  | "conflict" //  different PIN codes, or different plot/flat/survey numbers: certainly not the same property
  | "different" // clearly different places (almost no words in common)
  | "unknown"; //  one side is missing or too short to judge

/** How two address texts relate. Both must say enough (4+ words, and a number or 6+ words) before "match" or "different" is possible. */
export function addressRelation(a: string | null | undefined, b: string | null | undefined): AddressRelation {
  const pa = extractPin(a);
  const pb = extractPin(b);
  if (pa && pb && pa !== pb) return "conflict";
  const ta = addressTokens(a);
  const tb = addressTokens(b);
  const enough = (t: Set<string>) => t.size >= 4 && (numbersOf(t).size > 0 || t.size >= 6);
  if (!enough(ta) || !enough(tb)) return "unknown";
  const na = numbersOf(ta);
  const nb = numbersOf(tb);
  if (na.size > 0 && nb.size > 0 && !sameSet(na, nb)) return "conflict";
  const j = titleOverlap(ta, tb);
  if (j >= 0.8 && sameSet(na, nb)) return "match";
  if (j < 0.3) return "different";
  return "unknown";
}

/* ---- the decision ---- */

export type MatchRule = "same_source_id" | "same_address" | "distinctive_title";

export interface MatchDecision {
  match: boolean;
  rule?: MatchRule;
  /** One plain sentence: why they were treated as the same, or why not. */
  reason: string;
}

/** A title is distinctive when it carries enough words and a number (plot / flat / survey / door number). "Individual House" is not. */
export const isDistinctiveTitle = (tokens: Set<string>): boolean => tokens.size >= 4 && numbersOf(tokens).size > 0;

/**
 * Same physical property? Order of evidence:
 *  1. the same source-qualified auction id ("src:<host>:<id>");
 *  2. contradiction (different PIN, or different plot/flat numbers in the addresses) = never the same;
 *  3. the same address;
 *  4. a distinctive, near-identical title with equal numbers, when no address says "different".
 * Price and date are NOT evidence: a revised reserve price and a later date are exactly what a re-auction looks like, and
 * unrelated units share a price and a day. They only matter downstream (a re-auction round is added to the matched property).
 */
export function decideSameProperty(candidate: IdentityFacts, known: IdentityFacts): MatchDecision {
  // Only a SOURCE-QUALIFIED id ("src:<host>:<id>") is unique across sources. A bare number from two different sources can collide,
  // so plain ids are left to the importer's own same-id path (which knows the bank and the enrich mode).
  if (candidate.externalId && known.externalId && candidate.externalId === known.externalId && candidate.externalId.startsWith("src:")) return { match: true, rule: "same_source_id", reason: "same source-qualified auction id" };
  const rel = addressRelation(candidate.address, known.address);
  if (rel === "conflict") return { match: false, reason: "addresses carry different PIN codes or different plot/flat numbers" };
  if (rel === "match") return { match: true, rule: "same_address", reason: "same normalised address" };
  if (
    rel !== "different" &&
    titlesSimilar(candidate.tokens, known.tokens) &&
    isDistinctiveTitle(candidate.tokens) &&
    isDistinctiveTitle(known.tokens) &&
    sameSet(numbersOf(candidate.tokens), numbersOf(known.tokens))
  ) {
    return { match: true, rule: "distinctive_title", reason: "near-identical distinctive title with the same numbers, and no address contradicts it" };
  }
  return { match: false, reason: "not enough evidence: price, date and a similar title alone do not identify one property" };
}

/**
 * Exact-title clean-up (same bank, same title, same reserve price): allowed only when the title says something specific and the
 * addresses (when both exist) do not contradict each other. "Shops" / "Individual House" at one price are different units.
 */
export function exactTitleMergeAllowed(a: IdentityFacts, b: IdentityFacts): boolean {
  if (a.tokens.size < 3 || b.tokens.size < 3) return false;
  const rel = addressRelation(a.address, b.address);
  return rel !== "conflict" && rel !== "different";
}

/** Text stored with a merge so a person can see why two listings were treated as one. */
export const formatMergeNote = (rule: MatchRule | "exact_title", source: string, detail: string): string => `[merge:${rule}] ${source}: ${detail}`.slice(0, 480);
