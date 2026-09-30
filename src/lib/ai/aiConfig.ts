import { prisma } from "@/lib/db/prisma";

// Developer-facing AI configuration. Admin → AI Admin writes the `ai_settings` row; environment
// variables (AI_API_KEY, AI_BASE_URL, AI_EXTRACTOR_MODEL) are the fallback and always supply the key.

export const DEFAULT_MODEL = "glm-5.3-cursor";
export const DEFAULT_MAX_PAGE_CHARS = 40_000;

export interface AiConfig {
  enabled: boolean;
  baseUrl: string;
  hasKey: boolean;
  keyValid: boolean;
  keyHint: string; // never the key itself
  model: string;
  fallbackModel: string;
  extractionPrompt: string | null;
  rules: string;
  maxPageChars: number;
  fromDb: boolean;
}

let cache: { at: number; cfg: AiConfig } | null = null;

export function invalidateAiConfig() {
  cache = null;
}

export async function getAiConfig(): Promise<AiConfig> {
  if (cache && Date.now() - cache.at < 30_000) return cache.cfg;

  let row: Awaited<ReturnType<typeof prisma.aiSettings.findUnique>> = null;
  try {
    row = await prisma.aiSettings.findUnique({ where: { id: "default" } });
  } catch {
    // table unreachable: environment values alone still work
  }

  const key = process.env.AI_API_KEY?.trim() ?? "";
  const cfg: AiConfig = {
    enabled: row?.enabled ?? true,
    baseUrl: (process.env.AI_BASE_URL?.trim() ?? "").replace(/\/+$/, ""),
    hasKey: key.length > 0,
    keyValid: key.length > 0 && !/[^\x20-\x7E]/.test(key),
    keyHint: key ? `${key.length} chars, starts with "${key.slice(0, 3)}"` : "missing",
    model: row?.extractorModel?.trim() || process.env.AI_EXTRACTOR_MODEL?.trim() || DEFAULT_MODEL,
    fallbackModel: row?.fallbackModel?.trim() || DEFAULT_MODEL,
    extractionPrompt: row?.extractionPrompt?.trim() || null,
    rules: row?.rules?.trim() ?? "",
    maxPageChars: row?.maxPageChars && row.maxPageChars > 1000 ? row.maxPageChars : DEFAULT_MAX_PAGE_CHARS,
    fromDb: !!row,
  };
  cache = { at: Date.now(), cfg };
  return cfg;
}
