"use server";

import { prisma } from "@/lib/db/prisma";
import { invalidateAiConfig } from "@/lib/ai/aiConfig";
import { chatJSONDetailed } from "@/lib/ai/relayModelsClient";

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
