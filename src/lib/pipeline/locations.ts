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
  // Owner decision D15: "Vasai" is the one label for the Vasai-Virar city. Virar and Nallasopara stay their own towns.
  "vasai virar": "Vasai",
  "vasai-virar": "Vasai",
  "vasai virar city": "Vasai",
  bassein: "Vasai",
  // plain spelling variants of one town
  nalasopara: "Nallasopara",
  "nala sopara": "Nallasopara",
  "nalla sopara": "Nallasopara",
  ambarnath: "Ambernath",
  dombivali: "Dombivli",
  "mumbai city": "Mumbai",
  "greater mumbai": "Mumbai",
  "mira-bhayandar": "Mira Bhayandar",
  "mira road": "Mira Bhayandar",
  "pimpri-chinchwad": "Pimpri Chinchwad",
};

/** One spelling per city, so "kochi", "Kochi" and "Cochin" are a single entry in the filters. */
export function canonCity(raw: string): string {
  const k = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return ALIASES[k] ?? titleCase(k);
}

/**
 * canonCity plus the one rule that needs the state (owner decision D15): Aurangabad and Chhatrapati Sambhajinagar are the same city
 * ONLY in Maharashtra. Aurangabad in Bihar is a different place and is left alone.
 */
export function canonCityInState(raw: string, state: string | null | undefined): string {
  const city = canonCity(raw);
  if (city.toLowerCase() === "aurangabad" && /^maharashtra$/i.test((state ?? "").trim())) return "Chhatrapati Sambhajinagar";
  return city;
}
