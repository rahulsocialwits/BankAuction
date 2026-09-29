import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  UPCOMING: "bg-blue-50 text-blue-700",
  LIVE: "bg-green-50 text-green-700",
  AUCTION_TODAY: "bg-orange-50 text-orange-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  POSTPONED: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-red-50 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-500",
};

function formatMoney(v: unknown): string {
  if (v === null || v === undefined) return "Not Available";
  return `₹${Number(v).toLocaleString("en-IN")}`;
}

function formatDate(d: Date | null): string {
  if (!d) return "Not Available";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-brand-muted mb-0.5">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

export default async function PropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const property = await prisma.property.findUnique({
    where: { slug },
    include: {
      auctions: { include: { bank: true, branch: true }, orderBy: { createdAt: "desc" }, take: 1 },
      documents: { include: { document: true } },
      attributes: true,
      sourceRecords: { include: { source: true }, take: 1 },
    },
  });

  if (!property || property.status !== "PUBLISHED") notFound();

  const auction = property.auctions[0];
  const legalSchedule = property.attributes.find((a) => a.key === "legal_schedule")?.value;
  const rawType = property.attributes.find((a) => a.key === "source_property_type")?.value;
  const source = property.sourceRecords[0]?.source;

  return (
    <main className="max-w-5xl mx-auto px-5 py-10">
      <nav className="text-xs text-brand-muted mb-4">
        <Link href="/" className="hover:text-brand">Home</Link> / <Link href="/properties" className="hover:text-brand">Properties</Link> / <span>{property.title}</span>
      </nav>

      <div className="h-56 sm:h-72 bg-gradient-to-br from-brand-bg to-brand-border rounded-2xl flex items-center justify-center text-sm text-brand-muted mb-6">
        No image provided by source
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded mb-3 ${STATUS_STYLES[auction?.status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
            {auction?.status ?? "STATUS UNKNOWN"}
          </span>
          <h1 className="text-2xl font-semibold mb-1">{property.title}</h1>
          <p className="text-brand-muted text-sm mb-6">
            {property.addressText ?? "Location not specified by source"}
            {auction?.bank ? ` · ${auction.bank.name}` : ""}
            {auction?.branch ? ` (${auction.branch.name})` : ""}
          </p>

          <section className="bg-white border border-brand-border rounded-2xl p-5 mb-6">
            <h2 className="font-semibold mb-4">Auction Summary</h2>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Reserve Price" value={<span className="text-brand font-semibold">{formatMoney(auction?.reservePrice)}</span>} />
              <Field label="EMD" value={formatMoney(auction?.emd)} />
              <Field label="Auction Start" value={formatDate(auction?.auctionStart ?? null)} />
              <Field label="Auction End" value={formatDate(auction?.auctionEnd ?? null)} />
              <Field label="Application Deadline" value={formatDate(auction?.applicationDeadline ?? null)} />
              <Field label="Auction Method" value={auction?.auctionMethod ?? "Not Available"} />
              <Field label="Possession Status" value={auction?.possessionStatus ?? "Not Available"} />
              <Field label="Borrower" value={auction?.borrower ?? "Not Available"} />
            </dl>
          </section>

          <section className="mb-6">
            <h2 className="font-semibold mb-2">Property Overview</h2>
            <p className="text-sm leading-6 text-black/80">{property.description ?? "No description provided by source."}</p>
            {rawType && <p className="text-xs text-brand-muted mt-2">Source-listed type: {rawType}</p>}
          </section>

          {legalSchedule && (
            <section className="mb-6">
              <h2 className="font-semibold mb-2">Legal / Property Schedule</h2>
              <p className="text-sm leading-6 text-black/70 whitespace-pre-wrap">{legalSchedule}</p>
            </section>
          )}

          {property.documents.length > 0 && (
            <section className="mb-6">
              <h2 className="font-semibold mb-2">Documents &amp; Official Records</h2>
              <ul className="text-sm divide-y divide-brand-border border border-brand-border rounded-xl overflow-hidden">
                {property.documents.map((pd) => (
                  <li key={pd.documentId} className="flex items-center justify-between px-4 py-2.5">
                    <span>{pd.document.title ?? pd.document.type}</span>
                    <a href={pd.document.storedUrl ?? pd.document.sourceUrl} target="_blank" rel="noreferrer" className="text-brand font-medium hover:underline">
                      View Official Document
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="lg:col-span-1">
          <div className="bg-white border border-brand-border rounded-2xl p-5 sticky top-24">
            <h2 className="font-semibold mb-3">Contact &amp; Source</h2>
            <p className="text-xs text-brand-muted mb-4">
              This listing was discovered from a public source. Verify all details officially before acting.
            </p>
            <div className="text-sm mb-4">
              <div className="text-brand-muted text-xs mb-0.5">Source</div>
              <div className="font-medium">{source?.name ?? "Unknown"}</div>
            </div>
            {auction?.sourceUrl && (
              <a href={auction.sourceUrl} target="_blank" rel="noreferrer" className="block text-center bg-brand text-white font-medium rounded-lg py-2.5 mb-2 hover:bg-brand-dark">
                View Original Listing
              </a>
            )}
            <Link href="/contact" className="block text-center border border-brand-border font-medium rounded-lg py-2.5 hover:border-brand">
              Contact Us
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
