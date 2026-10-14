import { titleCase } from "@/lib/pipeline/locations";

/*
 * One spelling per Indian state or union territory. The sources write the same place differently ("Andaman & Nicobar Islands" and
 * "Andaman And Nicobar Islands", "Orissa" and "Odisha"); without one spelling the State filter listed the same state twice and a
 * filter on one spelling missed the listings stored under the other. Pure (no database), shared by the lists, counts and filters.
 */
const STATE_ALIASES: Record<string, string> = {
  orissa: "Odisha",
  "telangana state": "Telangana",
  "andhra pradesh state": "Andhra Pradesh",
  "nct of delhi": "Delhi",
  "new delhi": "Delhi",
  pondicherry: "Puducherry",
  uttaranchal: "Uttarakhand",
  "dadra and nagar haveli and daman and diu": "Dadra And Nagar Haveli And Daman And Diu",
};

const key = (raw: string) => raw.trim().toLowerCase().replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ");

/** One spelling per state: "&" is "and", then the alias table, then title case ("andaman & nicobar islands" -> "Andaman And Nicobar Islands"). */
export function canonState(raw: string): string {
  const k = key(raw);
  return STATE_ALIASES[k] ?? titleCase(k);
}

/**
 * Every spelling a database row may carry for the state the visitor picked: the canonical one, the same with "&", and the old names that
 * map to it. Used by the State filter so both spellings in the stored data are found.
 */
export function stateVariants(raw: string): string[] {
  const canon = canonState(raw);
  const out = new Set<string>([canon, raw.trim()]);
  if (/ and /i.test(canon)) out.add(canon.replace(/ and /gi, " & "));
  for (const [alias, to] of Object.entries(STATE_ALIASES)) if (to === canon) out.add(titleCase(alias));
  return [...out].filter(Boolean);
}
