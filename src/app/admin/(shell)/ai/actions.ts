"use server";

import { prisma } from "@/lib/db/prisma";
import { getAiConfig, invalidateAiConfig } from "@/lib/ai/aiConfig";
import { parseRules, serializeRules, type AiRule } from "@/lib/ai/rules";
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
      `The site lists PROPERTIES ONLY (never vehicles). Reply briefly, in English unless the owner writes in another language. ` +
      `When the owner gives an instruction about what to take or skip, confirm it in one sentence; they can save it as a rule with the button under their message. ` +
      `Current active rules:\n${cfg.rules || "(none yet)"}`;
    const trimmed = history.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));
    const r = await chatText(system, trimmed);
    return { ok: true, reply: r.reply || "(no reply)", meta: `${r.model} · ${r.tokens} tokens` };
  } catch (e) {
    return { ok: false, reply: e instanceof Error ? e.message : "Chat failed." };
  }
}

export type RulesResult = { ok: boolean; rules: AiRule[]; message: string };

async function loadRules(): Promise<AiRule[]> {
  const row = await prisma.aiSettings.findUnique({ where: { id: "default" } });
  return parseRules(row?.rules);
}

async function storeRules(rules: AiRule[]) {
  const json = serializeRules(rules);
  await prisma.aiSettings.upsert({ where: { id: "default" }, create: { id: "default", rules: json }, update: { rules: json } });
  invalidateAiConfig();
}

/**
 * Turns whatever the owner typed ("vehicles mat lena") into ONE clean English rule with a type, using the
 * Relay model, then adds it to the rules dashboard. Falls back to the owner's own words if the AI is down.
 */
export async function addAiRule(input: string): Promise<RulesResult> {
  const raw = input.replace(/\s+/g, " ").trim().slice(0, 400);
  const rules = await loadRules();
  if (!raw) return { ok: false, rules, message: "Type a rule first." };

  let text = raw;
  let kind: AiRule["kind"] = "other";
  try {
    const r = await chatJSONDetailed<{ rule?: string; kind?: string }>(
      'You turn a site owner\'s instruction for a bank-auction listing importer into ONE short, clear English rule sentence (imperative, under 25 words, keep every place, bank or number they mention). ' +
        'Classify it: "skip" (do not take something), "only" (take only something), "format" (how to write a field) or "other". ' +
        'Reply ONLY with JSON: {"rule":"...","kind":"skip|only|format|other"}',
      raw,
    );
    if (r.data?.rule && typeof r.data.rule === "string") text = r.data.rule.trim().slice(0, 300);
    if (r.data?.kind && ["skip", "only", "format", "other"].includes(r.data.kind)) kind = r.data.kind as AiRule["kind"];
  } catch {
    /* keep the owner's own wording */
  }

  if (rules.some((x) => x.text.toLowerCase() === text.toLowerCase())) return { ok: true, rules, message: "That rule already exists." };
  const next = [...rules, { id: `r${Date.now().toString(36)}`, text, kind, enabled: true, createdAt: new Date().toISOString() }];
  await storeRules(next);
  return { ok: true, rules: next, message: "Rule added. It applies from the next run." };
}

export async function toggleAiRule(id: string): Promise<RulesResult> {
  const next = (await loadRules()).map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
  await storeRules(next);
  return { ok: true, rules: next, message: "Updated." };
}

export async function deleteAiRule(id: string): Promise<RulesResult> {
  const next = (await loadRules()).filter((r) => r.id !== id);
  await storeRules(next);
  return { ok: true, rules: next, message: "Rule deleted." };
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
