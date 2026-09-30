import { getAiConfig } from "./aiConfig";

/**
 * Minimal OpenAI-compatible chat client for the Relay Models provider.
 * Kept generic (no vendor SDK) so swapping AI_BASE_URL/AI_API_KEY to a
 * different OpenAI-compatible provider later needs no code change.
 * The model comes from Admin → AI Admin (DB), falling back to AI_EXTRACTOR_MODEL.
 */
export interface AiResult<T> {
  data: T | null;
  tokens: number; // total tokens billed for this call (0 if the provider omits usage)
  model: string; // model that actually answered
}

export async function chatJSONDetailed<T>(systemPrompt: string, userPrompt: string): Promise<AiResult<T>> {
  const cfg = await getAiConfig();
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!cfg.enabled) throw new Error("AI is switched off (Admin → AI Admin).");
  if (!apiKey || !cfg.baseUrl) return { data: null, tokens: 0, model: cfg.model };
  // A masked/placeholder value (e.g. "sk-••••") pasted into the env var breaks the HTTP header.
  if (!cfg.keyValid) {
    throw new Error("AI_API_KEY contains invalid characters (looks like a masked value). Re-paste the real key in the environment settings.");
  }

  const request = (m: string) =>
    fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: m,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });

  let model = cfg.model;
  let res = await request(model);
  let errorBody = res.ok ? "" : await res.text();

  // The configured model may not be enabled on this account; fall back once.
  if (!res.ok && model !== cfg.fallbackModel && /model_not_found|No available channel/i.test(errorBody)) {
    model = cfg.fallbackModel;
    res = await request(model);
    errorBody = res.ok ? "" : await res.text();
  }
  if (!res.ok) throw new Error(`Relay Models request failed: HTTP ${res.status} ${errorBody.slice(0, 400)}`);

  const json = await res.json();
  const tokens = Number(json.usage?.total_tokens ?? 0) || 0;
  const content = json.choices?.[0]?.message?.content;
  if (!content) return { data: null, tokens, model };

  // Some models wrap JSON in a ```json fence even when asked not to -- strip
  // that defensively rather than relying on response_format (not every
  // OpenAI-compatible proxy supports it consistently).
  const cleaned = String(content).replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "").trim();
  try {
    return { data: JSON.parse(cleaned) as T, tokens, model };
  } catch {
    return { data: null, tokens, model };
  }
}

export async function chatJSON<T>(systemPrompt: string, userPrompt: string): Promise<T | null> {
  return (await chatJSONDetailed<T>(systemPrompt, userPrompt)).data;
}
