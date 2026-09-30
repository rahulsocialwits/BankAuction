import { prisma } from "@/lib/db/prisma";
import { getAiConfig } from "@/lib/ai/aiConfig";
import { DEFAULT_EXTRACTION_PROMPT } from "@/data-sources/feeds/webScan";
import { AiSettingsForm, TestButton, type Preset } from "@/components/admin/AiAdminForms";
import AiChat from "@/components/admin/AiChat";
import { saveAiSettings, testAi, chatWithAi, addAiRule, saveAiRules } from "./actions";

export const dynamic = "force-dynamic";

// Relay Models prices per 1M tokens (input = output), checked from their model list.
const PRESETS: Preset[] = [
  { id: "muse-spark-1.2", price: "$0.0038 — cheapest, built for extraction/classification", note: "Recommended first choice" },
  { id: "nemotron-3.5-lightning", price: "$0.0038 — very cheap, 1M context", note: "" },
  { id: "deepseek-v4-flash", price: "$0.0075 — cheap, stronger reasoning", note: "Good step up if Muse misses fields" },
  { id: "qwen3.7-plus", price: "$0.0075 — cheap, reliable structured output", note: "" },
  { id: "gpt-6-luna", price: "$0.019 — fast tier of GPT-6", note: "" },
  { id: "glm-5.3-flash", price: "$0.045 — fast GLM", note: "" },
  { id: "gemini-3.8-flash", price: "$0.075", note: "" },
  { id: "glm-5.3-cursor", price: "current default", note: "" },
];

export default async function AiAdminPage() {
  const [cfg, row, usage] = await Promise.all([
    getAiConfig(),
    prisma.aiSettings.findUnique({ where: { id: "default" } }),
    prisma.sourceRunLog.aggregate({ where: { startedAt: { gte: new Date(Date.now() - 7 * 864e5) } }, _sum: { aiTokens: true }, _count: { _all: true } }),
  ]);

  return (
    <div className="max-w-3xl">
      <div className="inline-block text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 rounded px-2 py-0.5 mb-2">Developer only</div>
      <h1 className="text-2xl font-semibold text-brand mb-1">AI Admin</h1>
      <p className="text-sm text-brand-muted mb-6">
        Controls the Relay Models layer that reads source websites. Sourcing never uses any other AI. The key and base URL
        stay in Vercel environment variables (they are never stored or shown here).
      </p>

      <section className="bg-white border border-brand-border rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-3">Status</h2>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><dt className="text-xs text-brand-muted">API key</dt><dd className={cfg.keyValid ? "text-green-700" : "text-red-600"}>{cfg.keyValid ? `Valid (${cfg.keyHint})` : `Problem: ${cfg.keyHint}`}</dd></div>
          <div><dt className="text-xs text-brand-muted">Base URL</dt><dd className="break-all">{cfg.baseUrl || <span className="text-red-600">missing (AI_BASE_URL)</span>}</dd></div>
          <div><dt className="text-xs text-brand-muted">Model in use</dt><dd>{cfg.model}</dd></div>
          <div><dt className="text-xs text-brand-muted">Settings source</dt><dd>{cfg.fromDb ? "Saved here (overrides environment)" : "Environment defaults"}</dd></div>
          <div><dt className="text-xs text-brand-muted">Last 7 days</dt><dd>{(usage._sum.aiTokens ?? 0).toLocaleString("en-IN")} tokens across {usage._count._all} runs</dd></div>
        </dl>
        <div className="mt-4"><TestButton action={testAi} /></div>
      </section>

      <section className="bg-white border border-brand-border rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-1">Talk to your AI</h2>
        <p className="text-xs text-brand-muted mb-3">Relay Models se seedha chat. Jo aap bologe wahi rules ban kar har source scan mein lagega.</p>
        <AiChat initialRules={cfg.rules} chat={chatWithAi} addRule={addAiRule} saveRules={saveAiRules} />
      </section>

      <section className="bg-white border border-brand-border rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-3">Settings</h2>
        <AiSettingsForm
          action={saveAiSettings}
          initial={{
            enabled: cfg.enabled,
            extractorModel: row?.extractorModel ?? cfg.model,
            fallbackModel: row?.fallbackModel ?? cfg.fallbackModel,
            maxPageChars: cfg.maxPageChars,
            extractionPrompt: row?.extractionPrompt ?? "",
          }}
          presets={PRESETS}
          defaultPrompt={DEFAULT_EXTRACTION_PROMPT}
        />
      </section>

      <section className="bg-white border border-brand-border rounded-xl p-5">
        <h2 className="font-semibold mb-3">Model guide (Relay Models, $ per 1M tokens)</h2>
        <table className="w-full text-xs">
          <tbody>
            {PRESETS.map((p) => (
              <tr key={p.id} className="border-t border-brand-border">
                <td className="py-2 pr-3 font-mono">{p.id}</td>
                <td className="py-2 pr-3">{p.price}</td>
                <td className="py-2 text-brand-muted">{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-brand-muted mt-3">
          Reasoning models also bill their hidden thinking as output, so a &quot;thinking&quot; model costs more per page than
          its price suggests. For extraction prefer the cheap non-reasoning ones. Architecture for developers: <code className="bg-brand-bg px-1 rounded">docs/DATA_PIPELINE.md</code>.
        </p>
      </section>
    </div>
  );
}
