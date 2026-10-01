import { PropertyCategory } from "@prisma/client";

/**
 * Best-effort mapping from a source's free-text property type to our own
 * taxonomy. This is OUR classification applied to their label, not a fact
 * we're attributing to the source — the original raw string is always kept
 * (as a PropertyAttribute) alongside it so nothing is lost or misrepresented.
 * Returns null when no rule matches rather than guessing.
 */
export function classifyPropertyType(raw: string | null | undefined): PropertyCategory | null {
  if (!raw) return null;
  const s = raw.toLowerCase();

  // "Movable" assets (machinery, stock, vehicles) are not real estate, so they are treated like vehicles: never listed.
  if (/\b(movables?|movable assets?)\b/.test(s)) return "VEHICLE";
  if (/\b(car|truck|bus|tractor|jcb|two[\s-]?wheeler|motorcycle|scooter|vehicle|commercial vehicle|heavy machinery)\b/.test(s) &&
      !/plant\s*(and|&)\s*machinery/.test(s)) {
    return "VEHICLE";
  }
  if (/plant\s*(and|&)\s*machinery|factory|warehouse|godown|industrial|manufactur|workshop/.test(s)) {
    return "INDUSTRIAL";
  }
  if (/agricultural|farm(?!\s*house)|orchard|plantation/.test(s)) {
    return "AGRICULTURAL";
  }
  if (/shop|showroom|office|commercial|retail|mall|restaurant|hotel|hospital|clinic|school/.test(s)) {
    return "COMMERCIAL";
  }
  if (/\bplots?\b|\bsite\b|\bland\b(?!\s*(and|&)\s*building)|open land|na plot/.test(s)) {
    return "LAND_PLOT";
  }
  if (/land\s*(and|&)\s*building|house|flat|apartment|residential|villa|duplex|penthouse|builder floor/.test(s)) {
    return "RESIDENTIAL";
  }
  return null;
}
