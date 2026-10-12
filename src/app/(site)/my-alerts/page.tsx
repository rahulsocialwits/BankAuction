import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/userSession";
import DeleteSearchButton from "@/components/DeleteSearchButton";

export const metadata: Metadata = { title: "My Alerts", description: "Your saved bank auction searches.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = { q: "Keyword", category: "Type", bank: "Bank", state: "State", city: "City", locality: "Area", status: "Status", priceMin: "Min ₹", priceMax: "Max ₹" };

export default async function MyAlertsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my-alerts");
  const searches = await prisma.savedSearch.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-12 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold text-brand mb-1">My alerts</h1>
      <p className="text-sm text-brand-muted mb-6">
        Searches you saved. Open one to see its current results. Email alerts for new matches are not switched on yet: your saved searches are kept and will be used when they are.
      </p>
      {searches.length === 0 ? (
        <div className="bg-white border border-brand-border rounded-2xl p-8 text-center">
          <p className="text-sm text-brand-muted mb-3">You have no saved searches yet. Search for properties, then press <strong>Save this search</strong>.</p>
          <Link href="/properties" className="text-brand text-sm font-medium hover:underline">Search properties →</Link>
        </div>
      ) : (
        <ul className="space-y-3 list-none p-0">
          {searches.map((s) => {
            const f = (s.filters && typeof s.filters === "object" && !Array.isArray(s.filters) ? s.filters : {}) as Record<string, unknown>;
            const qs = new URLSearchParams();
            const chips: string[] = [];
            for (const [k, v] of Object.entries(f)) {
              if (typeof v !== "string" || !LABELS[k]) continue;
              qs.set(k, v);
              chips.push(`${LABELS[k]}: ${v}`);
            }
            return (
              <li key={s.id} className="bg-white border border-brand-border rounded-xl p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{s.name || "Saved search"}</div>
                  <div className="text-xs text-brand-muted mt-0.5">{chips.join(" · ")}</div>
                  <Link href={`/properties?${qs.toString()}`} className="text-xs font-semibold text-brand hover:underline mt-2 inline-block">View results →</Link>
                </div>
                <DeleteSearchButton id={s.id} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
