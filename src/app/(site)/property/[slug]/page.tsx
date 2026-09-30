import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { PLACEHOLDER_IMAGE_URL } from "@/lib/constants";
import { Suspense } from "react";
import PropertyEnquiry from "@/components/PropertyEnquiry";

export const revalidate = 120;

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
    },
  });

  if (!property || property.status !== "PUBLISHED") notFound();

  const auction = property.auctions[0];
  const legalSchedule = property.attributes.find((a) => a.key === "legal_schedule")?.value;
  const rawType = property.attributes.find((a) => a.key === "source_property_type")?.value;

  return (
    <main className="max-w-5xl mx-auto px-5 py-10">
      <nav className="text-xs text-brand-muted mb-4">
        <Link href="/" className="hover:text-brand">Home</Link> / <Link href="/properties" className="hover:text-brand">Properties</Link> / <span>{property.title}</span>
      </nav>

      <div className="relative h-56 sm:h-72 rounded-2xl overflow-hidden mb-6 bg-brand-bg">
        <Image src={PLACEHOLDER_IMAGE_URL} alt={property.title} fill unoptimized priority className="object-cover" />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded mb-3 ${STATUS_STYLES[auction?.status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
            {auction?.status ?? "STATUS UNKNOWN"}
          </span>
          <h1 className="text-2xl font-semibold mb-1">{property.title}</h1>
          <p className="text-brand-muted text-sm mb-6">
            {property.addressText ?? "Location not specified"}
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
              <div>
                <dt className="text-xs text-brand-muted mb-0.5">Borrower</dt>
                <dd className="text-sm font-medium">
                  {auction?.borrower ? (
                    <Link href="/pricing" className="inline-flex items-center gap-2 group">
                      <span className="blur-[5px] select-none group-hover:blur-[6px]">{auction.borrower}</span>
                      <span className="text-[11px] text-gold font-semibold whitespace-nowrap">Unlock →</span>
                    </Link>
                  ) : (
                    "Not Available"
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="mb-6">
            <h2 className="font-semibold mb-2">Property Overview</h2>
            <p className="text-sm leading-6 text-black/80">{property.description ?? "No description provided."}</p>
            {rawType && <p className="text-xs text-brand-muted mt-2">Listed type: {rawType}</p>}
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
                    <Link href="/pricing" className="inline-flex items-center gap-2 group">
                      <span className="blur-[4px] select-none text-brand font-medium group-hover:blur-[5px]">View Official Document</span>
                      <span className="text-xs text-gold font-semibold whitespace-nowrap">Unlock →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="lg:col-span-1">
          <div className="bg-white border border-brand-border rounded-2xl p-5 sticky top-24">
            <h2 className="font-semibold mb-1">Interested in this property?</h2>
            <p className="text-xs text-brand-muted mb-4">Send an enquiry and our team will get back to you.</p>

            <Suspense fallback={<div className="h-40 rounded-lg bg-brand-bg animate-pulse" />}>
              <PropertyEnquiry propertyId={property.id} slug={property.slug} />
            </Suspense>

            <div className="border-t border-brand-border mt-5 pt-4">
              <p className="text-xs text-brand-muted mb-3">
                Always confirm auction details against the official documents above before participating.
              </p>
              <Link href="/contact" className="block text-center border border-brand-border font-medium rounded-lg py-2 text-sm hover:border-brand">
                Contact Us
              </Link>
              <a
                href={`https://wa.me/918160144606?text=${encodeURIComponent(
                  `Hi, I am interested in this property: ${property.title}\nhttps://auction.bizsocio.com/property/${property.slug}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center justify-center gap-2 bg-[#25D366] text-white font-medium rounded-lg py-2 text-sm hover:bg-[#1ebe5a]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.5 3.5A11.8 11.8 0 0 0 12 0C5.4 0 .1 5.3.1 11.9c0 2.1.5 4.1 1.6 5.9L0 24l6.4-1.7a11.9 11.9 0 0 0 5.6 1.4c6.6 0 11.9-5.3 11.9-11.9 0-3.2-1.2-6.200-3.400-8.300ZM12 21.700c-1.800 0-3.500-.5-5-1.400l-.4-.2-3.800 1 1-3.700-.2-.4a9.800 9.800 0 0 1-1.500-5.200C2.100 6.500 6.600 2.100 12 2.100c2.600 0 5.100 1 6.900 2.900a9.700 9.700 0 0 1 2.900 6.900c0 5.400-4.400 9.800-9.800 9.800Zm5.400-7.300c-.3-.1-1.700-.9-2-1s-.5-.1-.7.100-.8 1-.9 1.100-.3.200-.6.100a8 8 0 0 1-2.400-1.500 9 9 0 0 1-1.600-2c-.2-.3 0-.5.100-.6l.4-.5.3-.5c.1-.2 0-.4 0-.5l-.9-2.200c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.400s-1 1-1 2.400 1 2.800 1.200 3 2 3.100 4.900 4.300c.7.300 1.200.5 1.600.6.700.2 1.300.2 1.800.1.600-.1 1.700-.7 1.900-1.400.2-.7.2-1.200.2-1.400l-.5-.3Z" />
                </svg>
                I&apos;m interested — WhatsApp
              </a>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
