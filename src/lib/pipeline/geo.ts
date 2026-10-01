import { prisma } from "@/lib/db/prisma";
import { chatJSONDetailed } from "@/lib/ai/relayModelsClient";
import { canonCity, titleCase } from "./locations";

const BATCH = 12;

const SYSTEM = `You normalise locations of Indian bank-auction properties. For each numbered listing decide:
- city: the main city or town the property is physically in, written in English the usual way (Mumbai, Thane, Navi Mumbai, Pune, Bangalore, Hyderabad, Kochi, Thrissur ...). If the text names only a village or taluk, use the district headquarters or nearest city that the text itself names.
- locality: the neighbourhood, area, colony or road INSIDE that city, if the text clearly names one (for example "Mira Road", "Kurla West", "Vasai"). Otherwise null. A locality must really be part of the city you give; never put a different city or a district in the locality field.
- state: the Indian state of that city.
Use only places that appear in the text; never guess or invent. If the text does not allow a city, use null for all three.
Return ONLY a JSON array like [{"i":1,"city":"Thane","locality":"Mira Road","state":"Maharashtra"}] with one object per listing.`;

interface GeoAnswer {
  i: number;
  city: string | null;
  locality: string | null;
  state: string | null;
}

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").replace(/^[\s,.\-–]+|[\s,.\-–]+$/g, "").trim();
  if (t.length < 2 || t.length > max || /\d{3,}/.test(t) || /^(null|none|n\/a|unknown)$/i.test(t)) return null;
  return t;
};

/**
 * Asks the Relay AI to read each new listing and record its real city / area / state. The City and Area
 * filters use these verified values instead of guessing from raw text, so a property in Satara can never
 * appear under Mumbai. Processes at most `limit` listings per call; returns how many were done.
 */
export async function enrichLocations(limit = 48): Promise<{ processed: number; tokens: number; failed: boolean; error?: string }> {
  const todo = await prisma.property.findMany({
    where: { geoCheckedAt: null, status: { in: ["PUBLISHED", "PENDING_REVIEW"] } },
    select: { id: true, title: true, addressText: true, description: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  let processed = 0;
  let tokens = 0;
  let failures = 0;
  let lastError: string | undefined;

  const batches: typeof todo[] = [];
  for (let start = 0; start < todo.length; start += BATCH) batches.push(todo.slice(start, start + BATCH));

  // Batches run side by side (4 at a time): a slow model would otherwise take a minute per batch.
  async function runBatch(batch: typeof todo) {
    const lines = batch
      .map((p, k) => `${k + 1}. ${p.title} | listed location: ${p.addressText ?? "-"} | ${(p.description ?? "").replace(/\s+/g, " ").slice(0, 120)}`)
      .join("\n");
    try {
      const r = await chatJSONDetailed<GeoAnswer[]>(SYSTEM, lines);
      tokens += r.tokens;
      if (!Array.isArray(r.data)) {
        lastError = "AI reply was not a JSON array";
        return;
      }
      for (const a of r.data) {
        const p = batch[Number(a?.i) - 1];
        if (!p) continue;
        const city = clean(a.city, 40);
        let locality = clean(a.locality, 40);
        if (city && locality && canonCity(locality).toLowerCase() === canonCity(city).toLowerCase()) locality = null;
        await prisma.property.update({
          where: { id: p.id },
          data: {
            geoCity: city ? canonCity(city) : null,
            geoLocality: city && locality ? titleCase(locality) : null,
            geoState: city ? clean(a.state, 40) : null,
            geoCheckedAt: new Date(),
          },
        });
        processed++;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      failures++;
    }
  }

  const PARALLEL = 4;
  for (let i = 0; i < batches.length; i += PARALLEL) {
    await Promise.all(batches.slice(i, i + PARALLEL).map(runBatch));
    if (failures >= 2) return { processed, tokens, failed: true, error: lastError }; // AI trouble: stop, retry next run
  }
  return { processed, tokens, failed: false, error: lastError };
}
