"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import SubmitButton from "./SubmitButton";
import type { AiFormState } from "@/app/admin/(shell)/ai/actions";

type Msg = { role: "user" | "assistant"; content: string; meta?: string };

interface Props {
  initialRules: string;
  chat: (history: { role: "user" | "assistant"; content: string }[]) => Promise<{ ok: boolean; reply: string; meta?: string }>;
  addRule: (rule: string) => Promise<{ ok: boolean; rules: string; message: string }>;
  saveRules: (prev: AiFormState, fd: FormData) => Promise<AiFormState>;
}

const SUGGESTIONS = ["Vehicles mat lena, sirf property", "Sirf Maharashtra aur Gujarat ki properties lo", "Jo listing ka reserve price nahi hai use skip karo"];

export default function AiChat({ initialRules, chat, addRule, saveRules }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [rules, setRules] = useState(initialRules);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [saveState, saveAction] = useActionState(saveRules, null);
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

  function save(ruleText: string) {
    start(async () => {
      const r = await addRule(ruleText);
      setRules(r.rules);
      setNote(r.message);
    });
  }

  return (
    <div className="grid gap-5">
      <div className="border border-brand-border rounded-xl overflow-hidden">
        <div className="max-h-80 overflow-y-auto p-3 space-y-3 bg-brand-bg/50 min-h-[8rem]">
          {msgs.length === 0 && (
            <div className="text-xs text-brand-muted">
              Yahan apne AI se seedha baat karo. Bolo kya lena hai aur kya nahi; jo instruction pakki karni ho uske neeche <b>Save as rule</b> dabao.
              <div className="flex flex-wrap gap-2 mt-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-brand-border bg-white px-3 py-1 hover:border-brand">
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
                  <button type="button" onClick={() => save(m.content)} className="underline hover:text-brand">Save as rule</button>
                )}
              </div>
            </div>
          ))}
          {pending && <div className="text-xs text-brand-muted">AI soch raha hai…</div>}
          <div ref={endRef} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2 p-2 border-t border-brand-border bg-white"
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="AI se baat karo…" className="flex-1 border border-brand-border rounded-lg px-3 py-2 text-sm" />
          <button disabled={pending || !input.trim()} className="bg-brand text-white text-sm rounded-lg px-4 disabled:opacity-50">Send</button>
        </form>
      </div>
      {note && <div className="text-xs text-green-700">✓ {note}</div>}

      <form action={saveAction}>
        <label className="block text-sm font-medium mb-1">Standing rules (har extraction mein lagte hain)</label>
        <textarea
          key={rules}
          name="rules"
          rows={5}
          defaultValue={rules}
          placeholder="- Vehicles mat lena, sirf property"
          className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm font-mono text-xs"
        />
        <div className="flex items-center gap-3 mt-2">
          <SubmitButton className="bg-brand text-white text-sm font-medium rounded-lg px-5 py-2 hover:bg-brand-dark">Save rules</SubmitButton>
          {saveState && <span className={`text-sm ${saveState.ok ? "text-green-700" : "text-red-600"}`}>{saveState.ok ? "✓ " : ""}{saveState.message}</span>}
        </div>
        <p className="text-xs text-brand-muted mt-1">
          Vehicles ka rule code mein pehle se pakka hai, AI chahe bhool jaye. Baaki rules AI ko har page ke saath bheje jaate hain.
        </p>
      </form>
    </div>
  );
}
