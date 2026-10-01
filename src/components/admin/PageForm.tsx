"use client";

import Link from "next/link";
import { useActionState } from "react";
import SubmitButton from "./SubmitButton";
import type { PageFormState } from "@/app/admin/(shell)/pages/actions";

/** Wraps an editor: Save button, result message and a link to the live page, sticky at the bottom. */
export default function PageForm({
  action,
  pageKey,
  viewPath,
  children,
}: {
  action: (prev: PageFormState, fd: FormData) => Promise<PageFormState>;
  pageKey: string;
  viewPath: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="pageKey" value={pageKey} />
      {children}
      <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-white/90 backdrop-blur border-t border-brand-border flex flex-wrap items-center gap-4 z-10">
        <SubmitButton className="bg-brand text-white font-medium rounded-lg px-6 py-2.5 hover:bg-brand-dark">Save page</SubmitButton>
        <Link href={viewPath} target="_blank" className="text-sm text-brand hover:underline">View live page ↗</Link>
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
