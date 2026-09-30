"use client";

import { useActionState } from "react";
import SubmitButton from "./SubmitButton";
import type { AiFormState } from "@/app/admin/(shell)/ai/actions";

const input = "w-full border border-brand-border rounded-lg px-3 py-2 text-sm bg-white";

function Message({ state }: { state: AiFormState }) {
  if (!state) return null;
  return (
    <span role="status" className={`text-sm break-words ${state.ok ? "text-green-700" : "text-red-600"}`}>
      {state.ok ? "✓ " : ""}
      {state.message}
    </span>
  );
}

export function TestButton({ action }: { action: (prev: AiFormState) => Promise<AiFormState> }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <SubmitButton className="border border-brand-border rounded-lg px-4 py-2 text-sm hover:bg-brand-bg">Test connection</SubmitButton>
      <Message state={state} />
    </form>
  );
}

export interface Preset {
  id: string;
  price: string;
  note: string;
}

export function AiSettingsForm({
  action,
  initial,
  presets,
  defaultPrompt,
}: {
  action: (prev: AiFormState, fd: FormData) => Promise<AiFormState>;
  initial: { enabled: boolean; extractorModel: string; fallbackModel: string; maxPageChars: number; extractionPrompt: string };
  presets: Preset[];
  defaultPrompt: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-5">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="enabled" defaultChecked={initial.enabled} /> AI enabled (turn off to stop every AI call immediately)
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Extraction model</label>
          <input name="extractorModel" list="ai-models" defaultValue={initial.extractorModel} className={input} />
          <p className="text-xs text-brand-muted mt-1">Reads a web page and returns listings. Pick from the list or type any Relay Models id.</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Fallback model</label>
          <input name="fallbackModel" list="ai-models" defaultValue={initial.fallbackModel} className={input} />
          <p className="text-xs text-brand-muted mt-1">Used once if the main model is unavailable on the account.</p>
        </div>
      </div>
      <datalist id="ai-models">
        {presets.map((p) => (
          <option key={p.id} value={p.id}>{p.price}</option>
        ))}
      </datalist>

      <div className="max-w-xs">
        <label className="block text-sm font-medium mb-1">Max page size (characters)</label>
        <input name="maxPageChars" type="number" defaultValue={initial.maxPageChars} className={input} />
        <p className="text-xs text-brand-muted mt-1">Longer pages are cut here. Smaller = cheaper.</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Extraction instructions (system prompt)</label>
        <textarea
          name="extractionPrompt"
          rows={8}
          defaultValue={initial.extractionPrompt}
          placeholder={defaultPrompt}
          className={`${input} font-mono text-xs`}
        />
        <p className="text-xs text-brand-muted mt-1">Leave empty to use the built-in default shown as placeholder. Must still ask for a JSON array.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton className="bg-brand text-white font-medium rounded-lg px-6 py-2.5 hover:bg-brand-dark">Save AI settings</SubmitButton>
        <Message state={state} />
      </div>
    </form>
  );
}
