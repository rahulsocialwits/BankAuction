/**
 * Source pages often glue sentences together ("measuringAll that part", "Sketch)South : ...").
 * Re-inserts the missing spaces and puts each boundary direction on its own line. Display only.
 */
export function tidyText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/([a-z0-9\)\.])([A-Z][a-z])/g, "$1 $2")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\b(North|South|East|West)\s*:\s*/g, "\n$1: ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
