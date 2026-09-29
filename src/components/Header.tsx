import Link from "next/link";
import Image from "next/image";
import { getSiteSettings } from "@/lib/queries/siteSettings";
import MobileNav from "./MobileNav";
import SearchBar from "./SearchBar";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/properties", label: "Listings" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact Us" },
];

export default async function Header() {
  const settings = await getSiteSettings();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-brand-border">
      <div className="bg-brand text-white text-xs">
        <div className="max-w-6xl mx-auto px-5 py-1.5 flex flex-wrap items-center justify-between gap-1">
          <span className="flex items-center gap-4">
            <a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="hover:underline">
              {settings.phone}
            </a>
            <a href={`mailto:${settings.generalEmail}`} className="hidden sm:inline hover:underline">
              {settings.generalEmail}
            </a>
          </span>
          <span className="hidden md:inline">{settings.workingHours}</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 py-3 flex items-center gap-4">
        <Link href="/" className="shrink-0 flex items-center">
          <Image src="/brand/logo.png" alt="BankAuction.co" width={168} height={66} priority className="h-11 w-auto" />
        </Link>

        <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-black/80 shrink-0">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-brand transition-colors whitespace-nowrap">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block flex-1 max-w-sm ml-auto">
          <SearchBar />
        </div>

        <Link
          href="/login"
          aria-label="Account"
          className="hidden md:flex items-center justify-center w-9 h-9 rounded-full border border-brand-border hover:border-brand hover:text-brand shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
          </svg>
        </Link>

        <MobileNav navItems={NAV} />
      </div>
    </header>
  );
}
