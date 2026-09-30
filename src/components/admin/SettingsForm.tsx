"use client";

import { useActionState } from "react";
import SubmitButton from "./SubmitButton";

export type SaveState = { ok: boolean; message: string } | null;

export default function SettingsForm({
  action,
  children,
}: {
  action: (prev: SaveState, formData: FormData) => Promise<SaveState>;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-8 max-w-2xl">
      {children}
      <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-white/90 backdrop-blur border-t border-brand-border flex items-center gap-4">
        <SubmitButton className="bg-brand text-white font-medium rounded-lg px-6 py-2.5 hover:bg-brand-dark">
          Save Settings
        </SubmitButton>
        {state && (
          <span role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
            {state.ok ? "✓ " : ""}
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
