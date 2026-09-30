"use server";

import { prisma } from "@/lib/db/prisma";
import { getAiConfig, invalidateAiConfig } from "@/lib/ai/aiConfig";
import { chatJSONDetailed, chatText } from "@/lib/ai/relayModelsClient";

export type AiFormState = { ok: boolean; message: string } | null;

export async function saveAiSettings(_prev: AiFormState, formData: FormData): Promise<AiFormState> {
  try {
    const text = (n: string) => String(formData.get(n) ?? "").trim() || null;
    const model = text("extractorModel");
    const fallback = text("fallbackModel");
    for (const m of [model, fallback]) {
      if (m && !/^[A-Za-z0-9._:\/-]{2,80}$/.test(m)) throw new Error(`"${m}" is not a valid model name.`);
    }
    const maxPageChars = Number(formData.get("maxPageChars")) || null;
    if (maxPageChars !== null && (maxPageChars < 2000 || maxPageChars > 200_000)) throw new Error("Max page size must be between 2,000 and 200,000 characters.");

    const data = {
      enabled: formData.get("enabled") === "on",
      extractorModel: model,
      fallbackModel: fallback,
      maxPageChars,
      extractionPrompt: text("extractionPrompt"),
    };
    await prisma.aiSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
    invalidateAiConfig();
    return { ok: true, message: "Saved. The next run uses these settings." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save." };
  }
}

export async function chatWithAi(history: { role: "user" | "assistant"; content: string }[]): Promise<{ ok: boolean; reply: string; meta?: string }> {
  try {
    const cfg = await getAiConfig();
    const system =
      `You are the data-sourcing assistant for BankAuction.co, an Indian bank-auction property directory. ` +
      `You help the site owner decide what the listing importer should take or skip, and you can explain what you would extract from pasted page text. ` +
      `The site lists PROPERTIES ONLY (never vehicles). Reply briefly in the same language the owner uses (Hinglish is fine). ` +
      `When the owner gives an instruction about what to take or skip, restate it as ONE clear rule sentence they can save. ` +
      `Current standing rules:\n${cfg.rules || "(none yet)"}`;
    const trimmed = history.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));
    const r = await chatText(system, trimmed);
    return { ok: true, reply: r.reply || "(no reply)", meta: `${r.model} · ${r.tokens} tokens` };
  } catch (e) {
    return { ok: false, reply: e instanceof Error ? e.message : "Chat failed." };
  }
}

/** Appends one rule (a line) to the standing rules used in every extraction. */
export async function addAiRule(rule: string): Promise<{ ok: boolean; rules: string; message: string }> {
  const line = rule.replace(/\s+/g, " ").trim().slice(0, 300);
  const cur = await prisma.aiSettings.findUnique({ where: { id: "default" } });
  const existing = (cur?.rules ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!line) return { ok: false, rules: existing.join("\n"), message: "Empty rule." };
  if (existing.some((l) => l.replace(/^- /, "").toLowerCase() === line.toLowerCase())) return { ok: true, rules: existing.join("\n"), message: "Rule already saved." };
  const rules = [...existing, `- ${line}`].join("\n");
  await prisma.aiSettings.upsert({ where: { id: "default" }, create: { id: "default", rules }, update: { rules } });
  invalidateAiConfig();
  return { ok: true, rules, message: "Rule saved. It applies from the next run." };
}

export async function saveAiRules(_prev: AiFormState, formData: FormData): Promise<AiFormState> {
  const rules = String(formData.get("rules") ?? "").trim().slice(0, 4000) || null;
  await prisma.aiSettings.upsert({ where: { id: "default" }, create: { id: "default", rules }, update: { rules } });
  invalidateAiConfig();
  return { ok: true, message: "Rules saved. They apply from the next run." };
}

/** Sends one tiny request with the current settings so a developer can see the key, model and latency work. */
export async function testAi(): Promise<AiFormState> {
  invalidateAiConfig();
  const started = Date.now();
  try {
    const r = await chatJSONDetailed<{ ok?: boolean }>('Reply with exactly this JSON and nothing else: {"ok":true}', "ping");
    const ms = Date.now() - started;
    if (r.data === null && r.tokens === 0) return { ok: false, message: "AI key or base URL is not configured." };
    return {
      ok: r.data?.ok === true,
      message: `${r.data?.ok === true ? "Working" : "Model answered, but not with valid JSON"} — model ${r.model}, ${r.tokens} tokens, ${ms} ms.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Test failed." };
  }
}
