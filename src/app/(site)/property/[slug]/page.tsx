import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { PLACEHOLDER_IMAGE_URL } from "@/lib/constants";
import { submitPropertyLead } from "./actions";
import { getCurrentUser } from "@/lib/auth/userSession";

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

export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ leadSent?: string; leadError?: string }>;
}) {
  const { slug } = await params;
  const { leadSent, leadError } = await searchParams;
  const user = await getCurrentUser();

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

            {leadSent && <div className="bg-green-50 text-green-700 text-sm rounded-lg px-3 py-2.5 mb-4">Thanks — we&apos;ll be in touch shortly.</div>}
            {leadError && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2.5 mb-4">Please enter your name.</div>}

            {user ? (
              <form action={submitPropertyLead} className="space-y-3">
                <input type="hidden" name="propertyId" value={property.id} />
                <input type="hidden" name="slug" value={property.slug} />
                <input name="name" required defaultValue={user.name ?? ""} placeholder="Your name" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
                <input name="phone" placeholder="Phone" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
                <input name="email" type="email" defaultValue={user.email} placeholder="Email" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
                <textarea name="message" placeholder="Message (optional)" rows={3} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
                <button type="submit" className="w-full bg-brand text-white font-medium rounded-lg py-2.5 hover:bg-brand-dark">
                  Send Enquiry
                </button>
              </form>
            ) : (
              <div className="bg-brand-bg border border-brand-border rounded-lg p-4 text-center">
                <p className="text-sm text-brand-muted mb-3">Sign in to send an enquiry on this property.</p>
                <Link
                  href={`/login?next=${encodeURIComponent(`/property/${property.slug}`)}`}
                  className="block bg-brand text-white font-medium rounded-lg py-2.5 mb-2 hover:bg-brand-dark text-sm"
                >
                  Login
                </Link>
                <Link
                  href={`/register?next=${encodeURIComponent(`/property/${property.slug}`)}`}
                  className="text-xs text-brand hover:underline"
                >
                  New here? Register free
                </Link>
              </div>
            )}

            <div className="border-t border-brand-border mt-5 pt-4">
              <p className="text-xs text-brand-muted mb-3">
                Always confirm auction details against the official documents above before participating.
              </p>
              <Link href="/contact" className="block text-center border border-brand-border font-medium rounded-lg py-2 text-sm hover:border-brand">
                Contact Us
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
