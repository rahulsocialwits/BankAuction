import Link from "next/link";
import Image from "next/image";

const NAV = [
  { href: "/properties", label: "Properties" },
  { href: "/auctions", label: "Auctions" },
  { href: "/banks", label: "Banks" },
  { href: "/cities", label: "Cities" },
  { href: "/property-types", label: "Property Types" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-brand-border">
      <div className="bg-brand text-white text-xs">
        <div className="max-w-6xl mx-auto px-5 py-1.5 flex items-center justify-between">
          <span>Indian bank-auction property discovery platform</span>
          <span className="hidden sm:inline">Mon–Sat, 10 AM–6 PM</span>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between gap-6">
        <Link href="/" className="shrink-0 flex items-center">
          <Image src="/brand/logo.png" alt="BankAuction.co" width={168} height={66} priority className="h-11 w-auto" />
        </Link>
        <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-black/80">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-brand transition-colors">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/login" className="text-sm font-medium hidden sm:inline hover:text-brand">
            Login
          </Link>
          <Link
            href="/auctions"
            className="bg-gold text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gold-dark transition-colors"
          >
            Explore Auctions
          </Link>
        </div>
      </div>
    </header>
  );
}
