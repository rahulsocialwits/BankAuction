import { SITE_URL } from "@/lib/seo";
import type { Prisma } from "@prisma/client";
import { effectiveAuctionStatus } from "@/lib/domain/auctionLifecycle";

export const apiPropertyInclude = {
  auctions: { include: { bank: true }, orderBy: { createdAt: "desc" }, take: 1 },
  attributes: true,
} as const;

type ApiProperty = Prisma.PropertyGetPayload<{ include: typeof apiPropertyInclude }>;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * The public shape of a listing. Deliberately leaves out what the website keeps behind the premium plan:
 * borrower name, officer contact details and document links.
 */
export function toApiProperty(p: ApiProperty, detail = false) {
  const a = p.auctions[0];
  const base = {
    id: p.id,
    slug: p.slug,
    url: `${SITE_URL}/property/${p.slug}`,
    title: p.title,
    category: p.category,
    location: { state: p.geoState, city: p.geoCity, locality: p.geoLocality, address: p.addressText },
    bank: a?.bank ? { name: a.bank.name, slug: a.bank.slug } : null,
    auction: a
      ? {
          status: effectiveAuctionStatus(a),
          reservePrice: num(a.reservePrice),
          emd: num(a.emd),
          minimumBidIncrement: num(a.minimumIncrement),
          start: iso(a.auctionStart),
          end: iso(a.auctionEnd),
          applicationDeadline: iso(a.applicationDeadline),
          method: a.auctionMethod,
          possession: a.possessionStatus,
          noticeNumber: a.noticeNumber,
        }
      : null,
    updatedAt: p.updatedAt.toISOString(),
  };
  if (!detail) return base;
  const attrs = Object.fromEntries(p.attributes.filter((x) => x.value && x.key !== "legal_schedule").map((x) => [x.key, x.value]));
  return {
    ...base,
    description: p.description,
    legalSchedule: p.attributes.find((x) => x.key === "legal_schedule")?.value ?? null,
    details: attrs,
    createdAt: p.createdAt.toISOString(),
  };
}
