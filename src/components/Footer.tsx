import Link from "next/link";
import { getSiteSettings } from "@/lib/queries/siteSettings";
import { getTopBanks } from "@/lib/queries/footerLinks";
import { getLocalityMap } from "@/lib/queries/localities";
import { PRIORITY_CITIES } from "@/lib/constants";

const PROPERTY_TYPES = [
  { label: "Residential", value: "RESIDENTIAL" },
  { label: "Commercial", value: "COMMERCIAL" },
  { label: "Plots", value: "LAND_PLOT" },
  { label: "Vehicles", value: "VEHICLE" },
  { label: "Industrial", value: "INDUSTRIAL" },
];

const SOCIAL_ICONS: { key: "facebookUrl" | "instagramUrl" | "linkedinUrl" | "youtubeUrl"; label: string; path: string }[] = [
  { key: "facebookUrl", label: "Facebook", path: "M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12" },
  { key: "instagramUrl", label: "Instagram", path: "M12 2c2.7 0 3 0 4.1.1 1.1.1 1.8.2 2.4.5.7.3 1.2.6 1.7 1.1.5.5.9 1 1.1 1.7.3.6.4 1.3.5 2.4.1 1.1.1 1.4.1 4.1s0 3-.1 4.1c-.1 1.1-.2 1.8-.5 2.4a4.4 4.4 0 0 1-2.8 2.8c-.6.3-1.3.4-2.4.5-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-1.1-.1-1.8-.2-2.4-.5a4.4 4.4 0 0 1-2.8-2.8c-.3-.6-.4-1.3-.5-2.4C2 15 2 14.7 2 12s0-3 .1-4.1c.1-1.1.2-1.8.5-2.4a4.4 4.4 0 0 1 2.8-2.8c.6-.3 1.3-.4 2.4-.5C9 2 9.3 2 12 2m0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10m0 8.3a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6m5.2-8.5a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4" },
  { key: "linkedinUrl", label: "LinkedIn", path: "M19 3A2 2 0 0 1 21 5v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14M8.3 18.5V10H5.7v8.5h2.6M7 8.9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3m11.5 9.6v-4.6c0-2.5-1.3-3.6-3.1-3.6a2.7 2.7 0 0 0-2.4 1.3v-1.2h-2.6v8.1h2.6v-4.3c0-1.1.2-2.2 1.6-2.2s1.4 1.3 1.4 2.3v4.2h2.5" },
  { key: "youtubeUrl", label: "YouTube", path: "M21.6 7.2s-.2-1.5-.8-2.1c-.8-.8-1.7-.8-2.1-.9C15.9 4 12 4 12 4s-3.9 0-6.7.2c-.4 0-1.3.1-2.1.9-.6.6-.8 2.1-.8 2.1S2.2 9 2.2 10.7v1.6c0 1.7.2 3.5.2 3.5s.2 1.5.8 2.1c.8.8 1.9.8 2.3.9 1.7.1 7.5.2 7.5.2s3.9 0 6.7-.2c.4-.1 1.3-.1 2.1-.9.6-.6.8-2.1.8-2.1s.2-1.8.2-3.5v-1.6c0-1.7-.2-3.5-.2-3.5M9.9 14.6V8.7l5.6 3-5.6 3" },
];

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-semibold mb-3 text-sm">{title}</div>
      <ul className="space-y-1.5 text-sm text-brand-muted">{children}</ul>
    </div>
  );
}

export default async function Footer() {
  const [s, topBanks, localityMap] = await Promise.all([getSiteSettings(), getTopBanks(), getLocalityMap().catch(() => null)]);
  const cities = (localityMap ? Object.keys(localityMap) : [...PRIORITY_CITIES]).slice(0, 6);

  return (
    <footer className="bg-brand-bg border-t border-brand-border mt-16">
      <div className="w-full px-5 lg:px-10 xl:px-16 py-12 grid grid-cols-2 lg:grid-cols-6 gap-x-8 gap-y-10">
        <div className="col-span-2 lg:col-span-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.footerLogoUrl} alt="BankAuction.co" height={36} loading="lazy" className="h-9 w-auto mb-3" />
          <p className="text-sm text-brand-muted max-w-xs mb-5">
            India&apos;s trusted platform for bank auction properties. Explore residential, commercial, industrial, and
            land auction listings at the best prices.
          </p>
          <div className="flex items-center gap-3">
            {SOCIAL_ICONS.map((social) => {
              const url = s[social.key];
              if (!url) return null;
              return (
                <a
                  key={social.key}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={social.label}
                  className="w-9 h-9 flex items-center justify-center rounded-full border border-brand-border hover:border-brand hover:text-brand transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d={social.path} />
                  </svg>
                </a>
              );
            })}
          </div>
        </div>

        <FooterColumn title="Property Type">
          {PROPERTY_TYPES.map((t) => (
            <li key={t.value}><Link href={`/properties?category=${t.value}&status=all`} className="hover:text-brand">{t.label}</Link></li>
          ))}
          <li><Link href="/property-types" className="hover:text-brand font-medium">All Property Type</Link></li>
        </FooterColumn>

        <FooterColumn title="Banks">
          {topBanks.map((b) => (
            <li key={b.id}><Link href={`/properties?bank=${b.id}&status=all`} className="hover:text-brand">{b.name}</Link></li>
          ))}
          <li><Link href="/banks" className="hover:text-brand font-medium">All Bank</Link></li>
        </FooterColumn>

        <FooterColumn title="Top Cities">
          {cities.map((c) => (
            <li key={c}><Link href={`/properties?city=${encodeURIComponent(c)}&status=all`} className="hover:text-brand">{c}</Link></li>
          ))}
          <li><Link href="/cities" className="hover:text-brand font-medium">All City</Link></li>
        </FooterColumn>

        <div className="col-span-2 lg:col-span-1">
          <div className="font-semibold mb-3 text-sm">Contact Info.</div>
          <ul className="space-y-1.5 text-sm text-brand-muted">
            <li>Call: {s.phone}</li>
            <li className="break-words">General: {s.generalEmail}</li>
            <li className="break-words">Listings: {s.listingsEmail}</li>
            <li className="break-words">Partnerships: {s.partnershipsEmail}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-brand-border text-center text-xs text-brand-muted py-4 px-5">
        <p>
          Copyright © {new Date().getFullYear()} All rights reserved. Designed By{" "}
          <a href="https://thesocialwits.com/" target="_blank" rel="noreferrer" className="text-brand hover:underline">
            SocialWits
          </a>
        </p>
        <p className="mt-1 space-x-3">
          <Link href="/about" className="hover:text-brand">About</Link>
          <span>·</span>
          <Link href="/contact" className="hover:text-brand">Contact</Link>
          <span>·</span>
          <Link href="/how-it-works" className="hover:text-brand">How It Works</Link>
          <span>·</span>
          <Link href="/disclaimer" className="hover:text-brand">Disclaimer</Link>
          <span>·</span>
          <Link href="/privacy-policy" className="hover:text-brand">Privacy Policy</Link>
          <span>·</span>
          <Link href="/terms-and-conditions" className="hover:text-brand">Terms and Conditions</Link>
        </p>
      </div>
    </footer>
  );
}
