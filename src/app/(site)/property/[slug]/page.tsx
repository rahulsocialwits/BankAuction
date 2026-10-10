import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import PropertyEnquiry from "@/components/PropertyEnquiry";
import { tidyText } from "@/lib/text";
import type { Metadata } from "next";
import { clip, dayLabel, inr } from "@/lib/seo";
import { titleCase } from "@/lib/pipeline/locations";
import PropertyCarousel from "@/components/PropertyCarousel";
import PropertyGallery from "@/components/PropertyGallery";
import MapPopupButton from "@/components/MapPopupButton";
import { qualityOf } from "@/lib/map/mapPins";
import { toPropertyCardData } from "@/lib/queries/listProperties";
import { effectiveAuctionStatus } from "@/lib/domain/auctionLifecycle";

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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await prisma.property.findUnique({
    where: { slug },
    select: {
      title: true,
      status: true,
      description: true,
      addressText: true,
      category: true,
      auctions: { select: { reservePrice: true, emd: true, auctionStart: true, auctionMethod: true, bank: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!p || p.status !== "PUBLISHED") return { title: "Property not found", robots: { index: false } };

  const a = p.auctions[0];
  const reserve = inr(a?.reservePrice);
  const date = dayLabel(a?.auctionStart);
  const place = p.addressText ? titleCase(p.addressText) : null;
  const title = clip(`${tidyText(p.title).replace(/\.$/, "")}${reserve ? ` – Reserve ${reserve}` : ""}`, 70);
  const facts = [
    reserve && `Reserve price ${reserve}`,
    inr(a?.emd) && `EMD ${inr(a?.emd)}`,
    date && `auction on ${date}`,
    a?.bank?.name && `by ${a.bank.name}`,
    place && `in ${place}`,
  ].filter(Boolean);
  const description = clip(
    `${tidyText(p.title).replace(/\.$/, "")}. ${facts.length ? facts.join(", ") + "." : ""} ${a?.auctionMethod ? a.auctionMethod + ". " : ""}See full details, legal schedule and documents, and send an enquiry.`,
    158,
  );
  return {
    title,
    description,
    alternates: { canonical: `/property/${slug}` },
    openGraph: { title, description, type: "article", url: `/property/${slug}` },
    twitter: { card: "summary", title, description },
  };
}

export default async function PropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const property = await prisma.property.findUnique({
    where: { slug },
    include: {
      // borrower is never selected: this page is cached and shared by every visitor (see tests/borrowerExposure.test.ts)
      auctions: { omit: { borrower: true }, include: { bank: true, branch: true }, orderBy: { createdAt: "desc" }, take: 1 },
      documents: { include: { document: true } },
      attributes: true,
      media: { include: { media: true }, orderBy: { sortOrder: "asc" }, take: 12 },
    },
  });

  if (!property || property.status !== "PUBLISHED") notFound();

  // Similar listings: same city first, topped up with the same type in the same state; never this property itself.
  const similarInclude = { auctions: { include: { bank: true }, orderBy: { createdAt: "desc" as const }, take: 1 }, media: { include: { media: true }, orderBy: { sortOrder: "asc" as const }, take: 1 } };
  const sameCity = property.geoCity
    ? await prisma.property.findMany({ where: { status: "PUBLISHED", id: { not: property.id }, geoCity: property.geoCity, ...(property.category ? { category: property.category } : {}) }, orderBy: { createdAt: "desc" }, take: 8, include: similarInclude })
    : [];
  const topUp = sameCity.length < 8 && property.category && property.geoState
    ? await prisma.property.findMany({ where: { status: "PUBLISHED", id: { notIn: [property.id, ...sameCity.map((x) => x.id)] }, category: property.category, geoState: property.geoState }, orderBy: { createdAt: "desc" }, take: 8 - sameCity.length, include: similarInclude })
    : [];
  const similar = [...sameCity, ...topUp];

  const auction = property.auctions[0];
  // stored status, except that an open auction whose date is over is shown as completed (nothing is written)
  const shownStatus = auction ? effectiveAuctionStatus(auction) : null;
  // Earlier auction rounds of this very property (it did not sell, the bank listed it again). Public facts only: no borrower, no officer.
  const earlier = auction
    ? await prisma.auction.findMany({ where: { propertyId: property.id, id: { not: auction.id } }, orderBy: { auctionStart: "desc" }, select: { id: true, auctionStart: true, auctionEnd: true, reservePrice: true, emd: true, status: true, externalAuctionId: true } })
    : [];
  const priceChange =
    earlier[0]?.reservePrice && auction?.reservePrice && Number(earlier[0].reservePrice) !== Number(auction.reservePrice)
      ? Math.round(((Number(auction.reservePrice) - Number(earlier[0].reservePrice)) / Number(earlier[0].reservePrice)) * 1000) / 10
      : null;
  const legalSchedule = property.attributes.find((a) => a.key === "legal_schedule")?.value;
  const rawType = property.attributes.find((a) => a.key === "source_property_type")?.value;
  // Everything else an admin or source attached (area size, floor, …), as "Label: value".
  const HIDDEN_ATTRS = new Set(["legal_schedule", "source_property_type", "coord_quality", "borrower_status", "enrichment_status", "deep_scanned"]);
  const extraDetails = property.attributes
    .filter((a) => a.value && !HIDDEN_ATTRS.has(a.key))
    .map((a) => ({ key: a.key, label: a.key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), value: a.value as string }));

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10">
      <nav className="text-xs text-brand-muted mb-4">
        <Link href="/" className="hover:text-brand">Home</Link> / <Link href="/properties" className="hover:text-brand">Properties</Link> / <span>{property.title}</span>
      </nav>

      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 min-w-0">
          {/* The photos live in the left column; the enquiry card on the right starts level with them. */}
          <PropertyGallery photos={property.media.map((m) => m.media.sourceUrl)} title={property.title} />
          <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full mb-3 ${STATUS_STYLES[shownStatus ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
            {shownStatus ? shownStatus.charAt(0) + shownStatus.slice(1).toLowerCase().replace("_", " ") : "Status unknown"}
          </span>
          {earlier.length > 0 && <span className="ml-2 inline-block text-xs font-semibold px-3 py-1 rounded-full mb-3 bg-amber-50 text-amber-800">Re-auction · attempt {earlier.length + 1}</span>}
          <h1 className="text-2xl font-semibold mb-1">{property.title}</h1>
          <p className="text-brand-muted text-sm mb-6">
            {property.addressText ?? "Location not specified"}
            {auction?.bank ? ` · ${auction.bank.name}` : ""}
            {auction?.branch ? ` (${auction.branch.name})` : ""}
            {property.latitude !== null && property.longitude !== null && (
              <> · <MapPopupButton lat={property.latitude} lng={property.longitude} title={property.title} quality={qualityOf(property.attributes.find((a) => a.key === "coord_quality")?.value ?? null)} /></>
            )}
          </p>

          <section className="bg-white border border-brand-border rounded-2xl p-5 mb-6">
            <h2 className="font-semibold mb-4">Auction Summary</h2>
            <dl className="grid grid-cols-2 gap-4">
              {/* Only what the notice states is shown; a missing value is never printed as "Not Available" */}
              {auction?.reservePrice != null && <Field label="Reserve Price" value={<span className="text-brand font-semibold">{formatMoney(auction.reservePrice)}</span>} />}
              {auction?.emd != null && <Field label="EMD" value={formatMoney(auction.emd)} />}
              {auction?.auctionStart && <Field label="Auction Start" value={formatDate(auction.auctionStart)} />}
              {auction?.auctionEnd && <Field label="Auction End" value={formatDate(auction.auctionEnd)} />}
              {auction?.applicationDeadline && <Field label="Application Deadline" value={formatDate(auction.applicationDeadline)} />}
              {auction?.auctionMethod && <Field label="Auction Method" value={auction.auctionMethod} />}
              {auction?.possessionStatus && <Field label="Possession Status" value={auction.possessionStatus} />}
              {auction?.noticeNumber && <Field label="Notice Number" value={auction.noticeNumber} />}
              {auction?.minimumIncrement && <Field label="Minimum Bid Increment" value={formatMoney(auction.minimumIncrement)} />}
              {(auction?.inspectionDate || auction?.inspectionLocation) && (
                <Field
                  label="Inspection"
                  value={[auction.inspectionDate ? formatDate(auction.inspectionDate) : null, auction.inspectionTime, auction.inspectionLocation].filter(Boolean).join(" · ")}
                />
              )}
              <div>
                <dt className="text-xs text-brand-muted mb-0.5">Borrower</dt>
                <dd className="text-sm text-brand-muted">
                  Borrower details available with Premium.{" "}
                  <Link href="/pricing" className="text-gold font-semibold whitespace-nowrap">See plans →</Link>
                </dd>
              </div>
            </dl>
          </section>

          {earlier.length > 0 && (
            <section className="bg-white border border-brand-border rounded-2xl p-5 mb-6">
              <h2 className="font-semibold mb-1">Previous auctions of this property</h2>
              <p className="text-xs text-brand-muted mb-3">
                This property was put up for auction before and was listed again.
                {priceChange !== null && (priceChange < 0 ? ` The reserve price is ${Math.abs(priceChange)}% lower than in the previous auction.` : ` The reserve price is ${priceChange}% higher than in the previous auction.`)}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-brand-muted">
                    <tr className="text-left">
                      <th className="py-1.5 pr-3 font-medium">Attempt</th>
                      <th className="py-1.5 pr-3 font-medium">Auction date</th>
                      <th className="py-1.5 pr-3 font-medium">Reserve price</th>
                      <th className="py-1.5 pr-3 font-medium">EMD</th>
                      <th className="py-1.5 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...earlier].reverse().map((r, i) => (
                      <tr key={r.id} className="border-t border-brand-border">
                        <td className="py-2 pr-3">{i + 1}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{r.auctionStart ? formatDate(r.auctionStart) : "—"}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{r.reservePrice != null ? formatMoney(r.reservePrice) : "—"}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{r.emd != null ? formatMoney(r.emd) : "—"}</td>
                        <td className="py-2 text-brand-muted">{(() => { const rs = effectiveAuctionStatus(r); return rs === "COMPLETED" || rs === "EXPIRED" ? "Not sold — listed again" : rs.charAt(0) + rs.slice(1).toLowerCase().replace("_", " "); })()}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-brand-border bg-brand-bg/60 font-medium">
                      <td className="py-2 pr-3">{earlier.length + 1} (current)</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{auction?.auctionStart ? formatDate(auction.auctionStart) : "—"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{auction?.reservePrice != null ? formatMoney(auction.reservePrice) : "—"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{auction?.emd != null ? formatMoney(auction.emd) : "—"}</td>
                      <td className="py-2">{shownStatus ? shownStatus.charAt(0) + shownStatus.slice(1).toLowerCase().replace("_", " ") : "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="mb-6">
            <h2 className="font-semibold mb-2">Property Overview</h2>
            <p className="text-sm leading-6 text-black/80 whitespace-pre-line">{tidyText(property.description) || "No description provided."}</p>
            {rawType && <p className="text-xs text-brand-muted mt-2">Listed type: {rawType}</p>}
          </section>

          {extraDetails.length > 0 && (
            <section className="mb-6">
              <h2 className="font-semibold mb-2">Property Details</h2>
              <dl className="grid grid-cols-2 gap-4 bg-white border border-brand-border rounded-2xl p-5">
                {extraDetails.map((d) => (
                  <Field key={d.key} label={d.label} value={d.value} />
                ))}
              </dl>
            </section>
          )}

          {legalSchedule && (
            <section className="mb-6">
              <h2 className="font-semibold mb-2">Legal / Property Schedule</h2>
              <p className="text-sm leading-6 text-black/70 whitespace-pre-line">{tidyText(legalSchedule)}</p>
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

        <aside id="property-enquiry" className="lg:col-span-1 lg:sticky lg:top-32 lg:self-start">
          <div className="bg-white border border-brand-border rounded-2xl p-5">
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
                  <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5 13.6c-.2.6-1.2 1.1-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.700-1.200-4.400-3.900-4.600-4.100-.1-.2-1.100-1.400-1.100-2.700s.7-1.900.9-2.200c.2-.3.5-.3.700-.3h.5c.2 0 .4 0 .6.500l.8 2c.1.200.1.400 0 .5l-.4.600c-.1.200-.3.300-.1.600.600 1 1.400 1.800 2.300 2.300.3.200.5.100.7-.1l.7-.9c.2-.2.400-.2.600-.1l1.900.9c.3.1.5.2.5.3 0 .2 0 .7-.2 1.200Z" />
                </svg>
                I&apos;m interested — WhatsApp
              </a>
            </div>
          </div>
        </aside>
      </div>

      <p className="mt-8 rounded-xl border border-brand-border bg-[#F8FAFC] p-4 text-xs text-brand-muted">
        Details are collected from the bank / auction portal notices and may change or be incomplete. Please verify the property, reserve price, EMD and auction date with the bank and read the official notice before bidding. This is not legal or financial advice.
      </p>

      {similar.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-brand mb-5">Similar Properties</h2>
          <PropertyCarousel properties={similar.map(toPropertyCardData)} />
        </section>
      )}
    </main>
  );
}
