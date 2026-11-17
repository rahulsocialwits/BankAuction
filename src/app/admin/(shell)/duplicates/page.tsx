import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { classifyPair, titleTokens, type IdentityFacts } from "@/lib/pipeline/propertyIdentity";
import { findDuplicateGroups } from "@/lib/pipeline/duplicates";
import { mergeDuplicate, notDuplicate } from "./actions";
import SubmitButton from "@/components/admin/SubmitButton";

export const dynamic = "force-dynamic";

function fmt(v: number | null | undefined) {
  if (!v) return "—";
  return "₹" + v.toLocaleString("en-IN");
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString("en-IN");
}

type ClassLabel = "same" | "ambiguous" | "different";

const CLASS_STYLE: Record<ClassLabel, string> = {
  same: "bg-red-50 text-red-700 border-red-200",
  ambiguous: "bg-amber-50 text-amber-700 border-amber-200",
  different: "bg-green-50 text-green-700 border-green-200",
};
const CLASS_LABEL: Record<ClassLabel, string> = {
  same: "Likely same property",
  ambiguous: "Needs human review",
  different: "Probably different",
};

export default async function DuplicateReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "review" } = await searchParams;

  const groups = await findDuplicateGroups();

  // Enrich each group member with Auction data for the side-by-side view
  const memberIds = Array.from(new Set(groups.flatMap((g) => g.members.map((m) => m.id))));
  const auctions = await prisma.auction.findMany({
    where: { propertyId: { in: memberIds } },
    orderBy: { auctionStart: "desc" },
    select: {
      propertyId: true,
      reservePrice: true,
      auctionStart: true,
      status: true,
      bank: { select: { name: true } },
    },
  });
  const auctionMap = new Map<string, (typeof auctions)[0]>();
  for (const a of auctions) if (!auctionMap.has(a.propertyId)) auctionMap.set(a.propertyId, a);

  type PropRow = { id: string; addressText: string | null; geoCity: string | null; geoLocality: string | null; geoState: string | null; category: string | null };
  const properties = await (prisma.property.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, addressText: true, geoCity: true, geoLocality: true, geoState: true, category: true },
  }) as unknown as Promise<PropRow[]>);
  const propMap = new Map(properties.map((p: PropRow) => [p.id, p]));

  // Build pairs from groups (first vs each subsequent member)
  type Pair = {
    key: string;
    keep: (typeof groups)[0]["members"][0];
    hide: (typeof groups)[0]["members"][0];
    classification: ClassLabel;
    similarity: number;
    reason: string;
  };

  const pairs: Pair[] = [];
  for (const g of groups) {
    for (let i = 1; i < g.members.length; i++) {
      const a = g.members[0];
      const b = g.members[i];
      const aAuction = auctionMap.get(a.id);
      const bAuction = auctionMap.get(b.id);
      const aProp = propMap.get(a.id);
      const bProp = propMap.get(b.id);
      const aFacts: IdentityFacts = {
        externalId: null,
        tokens: titleTokens(a.title),
        address: aProp?.addressText ?? null,
        reserve: aAuction?.reservePrice ? Number(aAuction.reservePrice) : null,
        start: aAuction?.auctionStart ?? null,
      };
      const bFacts: IdentityFacts = {
        externalId: null,
        tokens: titleTokens(b.title),
        address: bProp?.addressText ?? null,
        reserve: bAuction?.reservePrice ? Number(bAuction.reservePrice) : null,
        start: bAuction?.auctionStart ?? null,
      };
      pairs.push({
        key: `${a.id}:${b.id}`,
        keep: a,
        hide: b,
        classification: classifyPair(aFacts, bFacts),
        similarity: g.similarity,
        reason: g.reason,
      });
    }
  }

  const filtered =
    filter === "same"
      ? pairs.filter((p) => p.classification === "same")
      : filter === "ambiguous"
      ? pairs.filter((p) => p.classification === "ambiguous")
      : pairs.filter((p) => p.classification !== "different");

  const counts = {
    same: pairs.filter((p) => p.classification === "same").length,
    ambiguous: pairs.filter((p) => p.classification === "ambiguous").length,
    different: pairs.filter((p) => p.classification === "different").length,
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-brand">Duplicate Review</h1>
          <p className="text-sm text-brand-muted mt-1">
            Side-by-side comparison of candidate duplicate pairs. Merge keeps the older listing; nothing is erased.
          </p>
        </div>
        <Link href="/admin/engine/duplicates" className="text-sm border border-brand-border rounded-lg px-4 py-2 hover:border-brand hover:text-brand">
          Bulk engine view →
        </Link>
      </div>

      {/* Summary + filter tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(["review", "same", "ambiguous"] as const).map((f) => {
          const count = f === "review" ? counts.same + counts.ambiguous : counts[f];
          const active = filter === f;
          return (
            <Link
              key={f}
              href={`/admin/duplicates?filter=${f}`}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                active
                  ? "bg-brand text-white border-brand"
                  : "border-brand-border text-brand-muted hover:border-brand hover:text-brand"
              }`}
            >
              {f === "review" ? "Needs review" : CLASS_LABEL[f]} <span className="ml-1 opacity-70">({count})</span>
            </Link>
          );
        })}
        <span className="px-4 py-2 text-sm text-brand-muted self-center">
          {counts.different} classified as different
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-green-50 text-green-700 text-sm rounded-xl px-4 py-4 text-center">
          No pairs to review in this category.
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((pair) => {
            const aAuction = auctionMap.get(pair.keep.id);
            const bAuction = auctionMap.get(pair.hide.id);
            const aProp = propMap.get(pair.keep.id);
            const bProp = propMap.get(pair.hide.id);
            return (
              <div key={pair.key} className="bg-white border border-brand-border rounded-xl overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 border-b border-brand-border flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${CLASS_STYLE[pair.classification]}`}>
                      {CLASS_LABEL[pair.classification]}
                    </span>
                    <span className="text-xs text-brand-muted">{pair.reason} · {Math.round(pair.similarity * 100)}% title match</span>
                  </div>
                  <div className="flex gap-2">
                    <form action={mergeDuplicate}>
                      <input type="hidden" name="keepId" value={pair.keep.id} />
                      <input type="hidden" name="hideId" value={pair.hide.id} />
                      <SubmitButton className="text-xs bg-red-600 text-white rounded-lg px-3 py-1.5 hover:bg-red-700 font-medium">
                        Merge → keep older
                      </SubmitButton>
                    </form>
                    <form action={notDuplicate}>
                      <input type="hidden" name="idA" value={pair.keep.id} />
                      <input type="hidden" name="idB" value={pair.hide.id} />
                      <SubmitButton className="text-xs border border-brand-border rounded-lg px-3 py-1.5 hover:bg-brand-bg">
                        Not a duplicate
                      </SubmitButton>
                    </form>
                  </div>
                </div>

                {/* Side by side */}
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-brand-border">
                  {[
                    { member: pair.keep, auction: aAuction, prop: aProp, label: "Keep (older)" },
                    { member: pair.hide, auction: bAuction, prop: bProp, label: "Would hide" },
                  ].map(({ member, auction, prop, label }) => (
                    <div key={member.id} className="p-4">
                      <div className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2">{label}</div>
                      <div className="font-medium text-sm mb-1 break-words">{member.title}</div>
                      <div className="text-xs text-brand-muted space-y-0.5">
                        {prop?.addressText && <div>📍 {prop.addressText}</div>}
                        {prop?.geoCity && (
                          <div>🗺 {[prop.geoLocality, prop.geoCity, prop.geoState].filter(Boolean).join(", ")}</div>
                        )}
                        {auction && (
                          <>
                            <div>🏦 {auction.bank?.name ?? "—"}</div>
                            <div>💰 {fmt(auction.reservePrice ? Number(auction.reservePrice) : null)} · 📅 {fmtDate(auction.auctionStart)}</div>
                            <div>Status: {auction.status}</div>
                          </>
                        )}
                        <div>Added: {member.createdAt.toLocaleDateString("en-IN")} · {member.source}</div>
                        <div>DB status: {member.status}</div>
                      </div>
                      <div className="mt-2 flex gap-2 text-xs">
                        <Link href={`/property/${member.slug}`} target="_blank" className="text-brand hover:underline">View listing ↗</Link>
                        <Link href={`/admin/properties/${member.id}/edit`} className="text-brand-muted hover:text-brand hover:underline">Edit</Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
