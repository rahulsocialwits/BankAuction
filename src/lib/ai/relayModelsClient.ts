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

  // Try the configured model, then the fallback, then a couple of cheap models from other vendors.
  // Moving on is only done for "model unavailable" and "provider content filter" errors: the vendor's
  // safety filter sometimes rejects ordinary auction notices (borrower names, legal text), and a
  // different vendor's model reads the same page fine.
  const chain = [...new Set([cfg.model, cfg.fallbackModel, "deepseek-v4-flash", "qwen3.7-plus"])];
  const TRANSIENT = /capacity_unavailable|temporarily unavailable|overloaded|rate.?limit|timeout/i;
  const MOVE_ON = /model_not_found|No available channel|unsafe or sensitive|"code":"?1301|capacity_unavailable|temporarily unavailable/i;

  // One model: short retries with backoff for temporary provider trouble (503/429/capacity).
  const attempt = async (m: string) => {
    let r = await request(m);
    let body = r.ok ? "" : await r.text();
    for (let n = 0; !r.ok && n < 2 && ([429, 502, 503, 504].includes(r.status) || TRANSIENT.test(body)); n++) {
      await new Promise((ok) => setTimeout(ok, 2500 * (n + 1)));
      r = await request(m);
      body = r.ok ? "" : await r.text();
    }
    return { r, body };
  };

  let model = chain[0];
  let { r: res, body: errorBody } = await attempt(model);
  for (let i = 1; !res.ok && i < chain.length && MOVE_ON.test(errorBody); i++) {
    model = chain[i];
    ({ r: res, body: errorBody } = await attempt(model));
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

/** Plain conversation with the configured Relay model (used by the AI Admin chat). */
export async function chatText(system: string, messages: { role: "user" | "assistant"; content: string }[]): Promise<{ reply: string; tokens: number; model: string }> {
  const cfg = await getAiConfig();
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!cfg.enabled) throw new Error("AI is switched off.");
  if (!apiKey || !cfg.baseUrl || !cfg.keyValid) throw new Error("AI key or base URL is not set up correctly (see Status above).");

  const call = (model: string) =>
    fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature: 0.3, messages: [{ role: "system", content: system }, ...messages] }),
      signal: AbortSignal.timeout(90_000),
    });

  const chain = [...new Set([cfg.model, cfg.fallbackModel, "deepseek-v4-flash"])];
  let model = chain[0];
  let res = await call(model);
  let body = res.ok ? "" : await res.text();
  for (let i = 1; !res.ok && i < chain.length && /model_not_found|No available channel|unsafe or sensitive|capacity_unavailable|temporarily unavailable/i.test(body); i++) {
    model = chain[i];
    res = await call(model);
    body = res.ok ? "" : await res.text();
  }
  if (!res.ok) throw new Error(`Relay Models request failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  const json = await res.json();
  return { reply: String(json.choices?.[0]?.message?.content ?? "").trim(), tokens: Number(json.usage?.total_tokens ?? 0) || 0, model };
}

export async function chatJSON<T>(systemPrompt: string, userPrompt: string): Promise<T | null> {
  return (await chatJSONDetailed<T>(systemPrompt, userPrompt)).data;
}
