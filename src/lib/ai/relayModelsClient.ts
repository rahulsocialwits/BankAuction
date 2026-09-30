/**
 * Minimal OpenAI-compatible chat client for the Relay Models provider.
 * Kept generic (no vendor SDK) so swapping AI_BASE_URL/AI_API_KEY to a
 * different OpenAI-compatible provider later needs no code change.
 */
const DEFAULT_MODEL = "glm-5.3-cursor";

export async function chatJSON<T>(systemPrompt: string, userPrompt: string): Promise<T | null> {
  const apiKey = process.env.AI_API_KEY?.trim();
  const baseUrl = process.env.AI_BASE_URL?.trim().replace(/\/+$/, "");
  const model = process.env.AI_EXTRACTOR_MODEL?.trim() || DEFAULT_MODEL;
  if (!apiKey || !baseUrl) return null;
  // A masked/placeholder value (e.g. "sk-••••") pasted into the env var breaks the HTTP header.
  if (/[^\x20-\x7E]/.test(apiKey)) {
    throw new Error("AI_API_KEY contains invalid characters (looks like a masked value). Re-paste the real key in the environment settings.");
  }

  const request = (m: string) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: m,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

  let res = await request(model);
  let errorBody = res.ok ? "" : await res.text();

  // The configured model may not be enabled on this account; fall back to the known-good default once.
  if (!res.ok && model !== DEFAULT_MODEL && /model_not_found|No available channel/i.test(errorBody)) {
    res = await request(DEFAULT_MODEL);
    errorBody = res.ok ? "" : await res.text();
  }

  if (!res.ok) {
    throw new Error(`Relay Models request failed: HTTP ${res.status} ${errorBody}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  // Some models wrap JSON in a ```json fence even when asked not to -- strip
  // that defensively rather than relying on response_format (not every
  // OpenAI-compatible proxy supports it consistently).
  const cleaned = content.replace(/^```json\s*|```$/g, "").trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
