/**
 * Minimal OpenAI-compatible chat client for the Relay Models provider.
 * Kept generic (no vendor SDK) so swapping AI_BASE_URL/AI_API_KEY to a
 * different OpenAI-compatible provider later needs no code change.
 */
export async function chatJSON<T>(systemPrompt: string, userPrompt: string): Promise<T | null> {
  const apiKey = process.env.AI_API_KEY?.trim();
  const baseUrl = process.env.AI_BASE_URL?.trim().replace(/\/+$/, "");
  const model = process.env.AI_EXTRACTOR_MODEL?.trim() || "glm-5.3-cursor";
  if (!apiKey || !baseUrl) return null;
  // A masked/placeholder value (e.g. "sk-••••") pasted into the env var breaks the HTTP header.
  if (/[^\x20-\x7E]/.test(apiKey)) {
    throw new Error("AI_API_KEY contains invalid characters (looks like a masked value). Re-paste the real key in the environment settings.");
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Relay Models request failed: HTTP ${res.status} ${await res.text()}`);
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
