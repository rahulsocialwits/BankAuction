"use client";

export default function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="print:hidden text-sm font-medium border border-brand-border rounded-lg px-4 py-2 hover:bg-brand-bg">
      {label}
    </button>
  );
}
