export const titleCase = (s: string) => s.trim().toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

const ALIASES: Record<string, string> = {
  bengaluru: "Bangalore",
  bangalore: "Bangalore",
  bombay: "Mumbai",
  "new delhi": "Delhi",
  cochin: "Kochi",
  trivandrum: "Thiruvananthapuram",
  gurugram: "Gurgaon",
  vizag: "Visakhapatnam",
  calcutta: "Kolkata",
  madras: "Chennai",
};

/** One spelling per city, so "kochi", "Kochi" and "Cochin" are a single entry in the filters. */
export function canonCity(raw: string): string {
  const k = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return ALIASES[k] ?? titleCase(k);
}
