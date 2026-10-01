import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireMaster } from "@/lib/auth/adminAuth";
import { PAGE_KEYS, PAGE_META } from "@/lib/pages/content";

export const dynamic = "force-dynamic";

const BLURB: Record<string, string> = {
  about: "Picture, story, mission and vision.",
  privacy: "Policy template with a Quick Navigation menu.",
  terms: "Policy template with a Quick Navigation menu.",
  disclaimer: "Policy template with a Quick Navigation menu.",
  faq: "Questions and answers in tabs, with search.",
};

export default async function PagesIndex() {
  await requireMaster();
  const rows = await prisma.sitePage.findMany({ select: { key: true, updatedAt: true } });
  const saved = new Map(rows.map((r) => [r.key, r.updatedAt]));

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold text-brand mb-1">Pages</h1>
      <p className="text-sm text-brand-muted mb-6 max-w-3xl">
        Edit the text, pictures and search-engine title and description of the About Us, policy and FAQ pages. Each page keeps its
        design; you change the content. Changes go live immediately.
      </p>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {PAGE_KEYS.map((k) => {
          const m = PAGE_META[k];
          const at = saved.get(k);
          return (
            <div key={k} className="bg-white border border-brand-border rounded-xl p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{m.label}</h2>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${at ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>{at ? "Customised" : "Default text"}</span>
              </div>
              <p className="text-xs text-brand-muted mt-1">{BLURB[k]}</p>
              <p className="text-[11px] text-brand-muted mt-2">{at ? `Last saved ${at.toLocaleString("en-IN")}` : "Showing the built-in text"}</p>
              <div className="mt-4 flex items-center gap-3">
                <Link href={`/admin/pages/${k}`} className="bg-brand text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-brand-dark">Edit</Link>
                <Link href={m.path} target="_blank" className="text-sm text-brand hover:underline">View ↗</Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
