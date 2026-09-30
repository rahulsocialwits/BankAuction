/**
 * Standing rules for the extraction AI. Stored as JSON text in ai_settings.rules; older plain-text
 * rules (one "- line" each) are read transparently.
 */
export interface AiRule {
  id: string;
  text: string; // one clear sentence
  kind: "skip" | "only" | "format" | "other";
  enabled: boolean;
  createdAt: string; // ISO
}

export function parseRules(raw: string | null | undefined): AiRule[] {
  const s = (raw ?? "").trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s) as Partial<AiRule>[];
      return arr
        .filter((r) => r && typeof r.text === "string" && r.text.trim())
        .map((r, i) => ({
          id: r.id ?? `r${i}`,
          text: String(r.text).trim(),
          kind: (["skip", "only", "format", "other"].includes(String(r.kind)) ? r.kind : "other") as AiRule["kind"],
          enabled: r.enabled !== false,
          createdAt: r.createdAt ?? new Date(0).toISOString(),
        }));
    } catch {
      /* fall through to legacy */
    }
  }
  return s
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `legacy${i}`, text, kind: "other" as const, enabled: true, createdAt: new Date(0).toISOString() }));
}

export const serializeRules = (rules: AiRule[]) => JSON.stringify(rules);

/** The text that is appended to the extraction prompt: enabled rules only. */
export function rulesToPrompt(rules: AiRule[]): string {
  return rules
    .filter((r) => r.enabled)
    .map((r) => `- ${r.text}`)
    .join("\n");
}
