"use client";

import { useFormStatus } from "react-dom";

/** A submit button that asks "are you sure?" first (used for bulk actions). */
export default function ConfirmButton({ children, className, message }: { children: React.ReactNode; className?: string; message: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      className={`${className ?? ""} disabled:opacity-60`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}
