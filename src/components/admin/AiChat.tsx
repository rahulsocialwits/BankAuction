"use client";

import { useRef, useState, useTransition } from "react";
import type { AiRule } from "@/lib/ai/rules";
import type { RulesResult } from "@/app/admin/(shell)/ai/actions";

type Msg = { role: "user" | "assistant"; content: string; meta?: string };

interface Props {
  initialRules: AiRule[];
  chat: (history: { role: "user" | "assistant"; content: string }[]) => Promise<{ ok: boolean; reply: string; meta?: string }>;
  addRule: (input: string) => Promise<RulesResult>;
  toggleRule: (id: string) => Promise<RulesResult>;
  deleteRule: (id: string) => Promise<RulesResult>;
}

const SUGGESTIONS = [
  "Do not take vehicle auctions, properties only",
  "Only take properties in Maharashtra and Gujarat",
  "Skip listings that have no reserve price",
];

const KIND: Record<AiRule["kind"], { label: string; cls: string }> = {
  skip: { label: "Skip", cls: "bg-red-50 text-red-700" },
  only: { label: "Only take", cls: "bg-blue-50 text-blue-700" },
  format: { label: "Format", cls: "bg-purple-50 text-purple-700" },
  other: { label: "Rule", cls: "bg-gray-100 text-gray-600" },
};

export default function AiChat({ initialRules, chat, addRule, toggleRule, deleteRule }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [rules, setRules] = useState(initialRules);
  const [note, setNote] = useState("");
  const [manual, setManual] = useState("");
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  function send(text: string) {
    const t = text.trim();
    if (!t || pending) return;
    const next: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next);
    setInput("");
    start(async () => {
      const r = await chat(next.map(({ role, content }) => ({ role, content })));
      setMsgs((m) => [...m, { role: "assistant", content: r.reply, meta: r.ok ? r.meta : "error" }]);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
  }

  function run(fn: () => Promise<RulesResult>) {
    start(async () => {
      const r = await fn();
      setRules(r.rules);
      setNote(r.message);
    });
  }

  const active = rules.filter((r) => r.enabled).length;

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Chat */}
      <div>
        <h3 className="font-semibold mb-1">Talk to your AI</h3>
        <p className="text-xs text-brand-muted mb-3">Chat directly with your Relay Models AI. Tell it what to take or skip, then save the instruction as a rule.</p>
        <div className="border border-brand-border rounded-xl overflow-hidden">
          <div className="h-80 overflow-y-auto p-3 space-y-3 bg-brand-bg/50">
            {msgs.length === 0 && (
              <div className="text-xs text-brand-muted">
                Try one of these, or type your own:
                <div className="flex flex-wrap gap-2 mt-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-brand-border bg-white px-3 py-1 hover:border-brand text-left">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <div className={`inline-block max-w-[90%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap text-left ${m.role === "user" ? "bg-brand text-white" : m.meta === "error" ? "bg-red-50 text-red-700" : "bg-white border border-brand-border"}`}>
                  {m.content}
                </div>
                <div className="text-[10px] text-brand-muted mt-0.5 flex gap-3 justify-end">
                  {m.role === "assistant" && m.meta && m.meta !== "error" && <span className="mr-auto">{m.meta}</span>}
                  {m.role === "user" && (
                    <button type="button" disabled={pending} onClick={() => run(() => addRule(m.content))} className="underline hover:text-brand">
                      Save as rule
                    </button>
                  )}
                </div>
              </div>
            ))}
            {pending && <div className="text-xs text-brand-muted">Thinking…</div>}
            <div ref={endRef} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 p-2 border-t border-brand-border bg-white"
          >
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message your AI…" className="flex-1 border border-brand-border rounded-lg px-3 py-2 text-sm" />
            <button disabled={pending || !input.trim()} className="bg-brand text-white text-sm rounded-lg px-4 disabled:opacity-50">Send</button>
          </form>
        </div>
      </div>

      {/* Rules dashboard */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="font-semibold">AI rules dashboard</h3>
          <span className="text-xs text-brand-muted">{active} active of {rules.length}</span>
        </div>
        <p className="text-xs text-brand-muted mb-3">
          Every saved rule is rewritten by the AI into one clear sentence and sent with every page it reads. Switch a rule off to stop using it without deleting it.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = manual;
            setManual("");
            run(() => addRule(v));
          }}
          className="flex gap-2 mb-3"
        >
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Add a rule in your own words…" className="flex-1 border border-brand-border rounded-lg px-3 py-2 text-sm" />
          <button disabled={pending || !manual.trim()} className="border border-brand-border rounded-lg px-4 text-sm hover:bg-brand-bg disabled:opacity-50">Add</button>
        </form>
        {note && <div className="text-xs text-green-700 mb-2">✓ {note}</div>}

        <ul className="border border-brand-border rounded-xl divide-y divide-brand-border bg-white">
          <li className="px-3 py-2.5 flex items-start gap-3">
            <span className={`mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded ${KIND.skip.cls}`}>Built in</span>
            <div className="flex-1 text-sm">Never import vehicles (cars, bikes, trucks, tractors).
              <div className="text-[11px] text-brand-muted">Enforced in code for every source. Cannot be switched off.</div>
            </div>
          </li>
          {rules.map((r) => (
            <li key={r.id} className={`px-3 py-2.5 flex items-start gap-3 ${r.enabled ? "" : "opacity-50"}`}>
              <span className={`mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${KIND[r.kind].cls}`}>{KIND[r.kind].label}</span>
              <div className="flex-1 text-sm break-words">
                {r.text}
                {r.createdAt > "2001" && <div className="text-[11px] text-brand-muted">Added {new Date(r.createdAt).toLocaleDateString("en-IN")}</div>}
              </div>
              <div className="flex gap-2 text-xs shrink-0">
                <button type="button" disabled={pending} onClick={() => run(() => toggleRule(r.id))} className="border border-brand-border rounded px-2 py-1 hover:bg-brand-bg">
                  {r.enabled ? "Turn off" : "Turn on"}
                </button>
                <button type="button" disabled={pending} onClick={() => run(() => deleteRule(r.id))} className="border border-brand-border rounded px-2 py-1 text-red-600 hover:bg-red-50">
                  Delete
                </button>
              </div>
            </li>
          ))}
          {rules.length === 0 && <li className="px-3 py-6 text-center text-xs text-brand-muted">No custom rules yet. Add one above or from the chat.</li>}
        </ul>
      </div>
    </div>
  );
}
