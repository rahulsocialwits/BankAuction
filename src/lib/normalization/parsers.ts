/** Parses "DD-MM-YYYY h:mm am/pm" (as used by bankauctions.in). Returns null, never a guessed date. */
export function parseIndianDateTime(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min, ampm] = m;
  let hour = parseInt(hh, 10) % 12;
  if (ampm.toLowerCase() === "pm") hour += 12;
  const date = new Date(
    Date.UTC(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10), hour, parseInt(min, 10))
  );
  // Source dates are IST (UTC+5:30); store as the equivalent UTC instant.
  date.setUTCMinutes(date.getUTCMinutes() - 330);
  return isNaN(date.getTime()) ? null : date;
}

/** Parses a rupee amount like "3221000" or "32,21,000" into a plain number, or null if absent/placeholder. */
export function parseMoney(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[₹,\s]/g, "");
  if (!cleaned || /^-+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "Not Available" placeholders some sources use instead of leaving a cell blank. */
export function nullIfPlaceholder(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v || /^-+$/.test(v) || /^(n\/?a|not available|not applicable)$/i.test(v)) return null;
  return v;
}

export function parseYesNo(raw: string | null | undefined): boolean | null {
  const v = nullIfPlaceholder(raw);
  if (v === null) return null;
  if (/^yes$/i.test(v)) return true;
  if (/^no$/i.test(v)) return false;
  return null;
}

/** Extracts an auto-extension duration in minutes from free text like
 * "...end time will increase by 5 minutes.", without inventing a value if absent. */
export function parseExtensionMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/increase by\s+(\d+)\s*minute/i);
  return m ? parseInt(m[1], 10) : null;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}
