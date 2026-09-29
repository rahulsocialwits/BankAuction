import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-brand-bg border-t border-brand-border mt-16">
      <div className="max-w-6xl mx-auto px-5 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8 text-sm">
        <div>
          <Image src="/brand/logo.png" alt="BankAuction.co" width={140} height={55} className="h-9 w-auto mb-3" />
          <p className="text-brand-muted">
            Discover Indian bank-auction properties from source-backed public listings.
          </p>
        </div>
        <div>
          <div className="font-semibold mb-3">Property Types</div>
          <ul className="space-y-1.5 text-brand-muted">
            <li><Link href="/property-types">Residential</Link></li>
            <li><Link href="/property-types">Commercial</Link></li>
            <li><Link href="/property-types">Industrial</Link></li>
            <li><Link href="/property-types">Land &amp; Plot</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3">Company</div>
          <ul className="space-y-1.5 text-brand-muted">
            <li><Link href="/about">About Us</Link></li>
            <li><Link href="/how-it-works">How It Works</Link></li>
            <li><Link href="/contact">Contact</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3">Legal</div>
          <ul className="space-y-1.5 text-brand-muted">
            <li>Terms of Use</li>
            <li>Privacy Policy</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-brand-border text-center text-xs text-brand-muted py-4">
        © {new Date().getFullYear()} BankAuction.co. All property/auction data is sourced from public listings with attribution.
      </div>
    </footer>
  );
}
