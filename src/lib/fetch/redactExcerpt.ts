/*
 * A short, safe excerpt of an HTTP answer for diagnostics: cookie / token / secret / authorization values are replaced by
 * [redacted], whitespace is collapsed, and the text is cut to `max` characters. Pure; no network, no database.
 */
const SENSITIVE = /("?(?:csrf[-_ ]?token|xsrf[-_ ]?token|token|access[-_ ]?token|authorization|cookie|set-cookie|secret|session(?:id)?|api[-_ ]?key|password)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}&]+)/gi;

export function redactExcerpt(text: string, max = 1500): string {
  return text
    .replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(SENSITIVE, "$1[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
