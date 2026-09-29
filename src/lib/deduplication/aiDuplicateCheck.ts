import { prisma } from "@/lib/db/prisma";
import { chatJSON } from "@/lib/ai/relayModelsClient";

interface CandidateProperty {
  id: string;
  title: string;
  addressText: string | null;
  description: string | null;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Finds properties from the same bank whose title/address text is similar
 * enough (per spec dedup tiers 3-5: bank+address, description similarity)
 * to be worth an AI opinion, then asks Relay Models to confirm whether the
 * new listing describes the same real-world property. Only called when a
 * plain externalAuctionId match wasn't found, and only calls AI when a
 * plausible textual overlap exists -- never on every fresh listing.
 */
export interface DuplicateCheckResult {
  match: { propertyId: string; confidence: number } | null;
  aiCallMade: boolean;
}

export async function findDuplicatePropertyViaAI(
  bankId: string | null | undefined,
  normalized: { title: string; addressText: string | null; description: string | null }
): Promise<DuplicateCheckResult> {
  if (!bankId) return { match: null, aiCallMade: false };

  const candidates: CandidateProperty[] = await prisma.property.findMany({
    where: { auctions: { some: { bankId } } },
    select: { id: true, title: true, addressText: true, description: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  if (candidates.length === 0) return { match: null, aiCallMade: false };

  const newText = `${normalized.title} ${normalized.addressText ?? ""} ${normalized.description ?? ""}`;
  const scored = candidates
    .map((c) => ({ c, score: jaccardSimilarity(newText, `${c.title} ${c.addressText ?? ""} ${c.description ?? ""}`) }))
    .filter((s) => s.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0) return { match: null, aiCallMade: false }; // no plausible overlap -- skip the AI call entirely

  const shortlist = scored.map((s, i) => ({
    index: i,
    title: s.c.title,
    address: s.c.addressText,
    description: s.c.description?.slice(0, 300),
  }));

  let result: { matchIndex: number | null; confidence: number } | null = null;
  try {
    result = await chatJSON<{ matchIndex: number | null; confidence: number }>(
      "You compare a newly extracted bank-auction property listing against a shortlist of already-stored listings " +
        "from the same bank, to decide if any of them describe the exact same real-world property (not just a similar " +
        "one). Respond with strict JSON only: {\"matchIndex\": <index from the shortlist, or null if none match>, " +
        "\"confidence\": <0 to 1>}. Never invent a match -- if genuinely uncertain, return null.",
      JSON.stringify({
        newListing: {
          title: normalized.title,
          address: normalized.addressText,
          description: normalized.description?.slice(0, 300),
        },
        shortlist,
      })
    );
  } catch {
    // AI verification is an enhancement, not core dedup -- a provider hiccup
    // should never block ingestion. Fall through as "no confirmed match".
    return { match: null, aiCallMade: true };
  }

  if (!result || result.matchIndex === null || result.matchIndex === undefined || result.confidence < 0.75) {
    return { match: null, aiCallMade: true };
  }

  const match = scored[result.matchIndex];
  if (!match) return { match: null, aiCallMade: true };

  return { match: { propertyId: match.c.id, confidence: result.confidence }, aiCallMade: true };
}
