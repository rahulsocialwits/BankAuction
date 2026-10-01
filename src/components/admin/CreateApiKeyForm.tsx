"use client";

import { useActionState } from "react";
import SubmitButton from "./SubmitButton";
import CopyButton from "./CopyButton";
import type { KeyFormState } from "@/app/admin/(shell)/api/actions";

export default function CreateApiKeyForm({ action }: { action: (prev: KeyFormState, fd: FormData) => Promise<KeyFormState> }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <div>
      <form action={formAction} className="grid sm:grid-cols-[1fr_1.5fr_auto] gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold mb-1">Key name</label>
          <input name="name" required placeholder="e.g. Partner app" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Note (optional)</label>
          <input name="note" placeholder="Who it is for, what it is used for" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <SubmitButton className="bg-brand text-white text-sm font-medium rounded-lg px-5 py-2.5 hover:bg-brand-dark">Create key</SubmitButton>
      </form>

      {state && !state.ok && <div role="alert" className="mt-3 text-sm text-red-600">{state.message}</div>}
      {state?.ok && state.key && (
        <div role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-900 mb-1">{state.message}</div>
          <div className="flex flex-wrap items-center gap-3">
            <code className="text-sm bg-white border border-amber-200 rounded-lg px-3 py-2 break-all select-all">{state.key}</code>
            <CopyButton path={state.key} label="Copy key" className="text-xs border border-amber-300 bg-white rounded-lg px-3 py-2 hover:bg-amber-100" />
          </div>
          <p className="text-xs text-amber-800 mt-2">Send it to the other party over a private channel. If it is lost, delete it and create a new one.</p>
        </div>
      )}
    </div>
  );
}
