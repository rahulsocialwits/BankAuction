import Link from "next/link";
import { getSiteSettings } from "@/lib/queries/siteSettings";
import { logoutUser } from "@/app/(site)/login/actions";
import MobileNav from "./MobileNav";
import SearchBar from "./SearchBar";
import HideOnHome from "./HideOnHome";
import AccountLink from "./AccountLink";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/properties", label: "Properties" },
  { href: "/auctions", label: "Auctions" },
  { href: "/banks", label: "Banks" },
  { href: "/cities", label: "Cities" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/blog", label: "Insights" },
];

// No cookie reads here: login state comes from the client (AccountLink / MobileNav) so
// every page using this header can be statically cached.
export default async function Header() {
  const settings = await getSiteSettings();
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-brand-border">
      <div className="bg-brand text-white">
        <div className="w-full px-5 lg:px-10 xl:px-16 py-2 flex items-center justify-between text-[11px]">
          <div className="flex gap-5">
            <a href={`tel:${settings.phone.replace(/\s/g, "")}`}>{settings.phone}</a>
            <a className="hidden sm:inline text-white/75" href={`mailto:${settings.generalEmail}`}>{settings.generalEmail}</a>
          </div>
          <span className="hidden md:block text-white/70">{settings.workingHours}</span>
        </div>
      </div>
      <div className="w-full px-5 lg:px-10 xl:px-16 py-3.5 flex items-center gap-4 xl:gap-5">
        <Link href="/" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={settings.headerLogoUrl} alt="BankAuction.co" height={44} className="h-11 w-auto" fetchPriority="high" />
        </Link>
        <nav className="hidden lg:flex items-center gap-4 xl:gap-5 text-[13px] font-semibold text-slate-700 whitespace-nowrap shrink-0">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-brand transition-colors">{n.label}</Link>
          ))}
        </nav>
        <div className="hidden xl:block flex-1 min-w-[220px] max-w-xs ml-auto">
          <HideOnHome><SearchBar /></HideOnHome>
        </div>
        <AccountLink logoutAction={logoutUser} />
        <MobileNav navItems={NAV} logoutAction={logoutUser} />
      </div>
    </header>
  );
}
