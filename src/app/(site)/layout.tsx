import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getSiteSettings } from "@/lib/queries/siteSettings";
import { SITE_URL } from "@/lib/seo";
import { getAutoHomeDescription } from "@/lib/queries/autoMeta";
import "../globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  const description = s.homeDescription || (await getAutoHomeDescription());
  return {
    metadataBase: new URL(SITE_URL),
    // Every page sets its own title; the site name is appended automatically.
    title: { default: s.homeTitle, template: "%s | BankAuction.co" },
    description,
    openGraph: { siteName: "BankAuction.co", type: "website", locale: "en_IN", title: s.homeTitle, description },
    twitter: { card: "summary", title: s.homeTitle, description },
    keywords: s.homeKeywords ? s.homeKeywords.split(",").map((k) => k.trim()).filter(Boolean) : undefined,
    icons: s.faviconUrl
      ? { icon: s.faviconUrl, shortcut: s.faviconUrl, apple: s.faviconUrl }
      : { icon: "/brand/favicon.svg", shortcut: "/brand/favicon.svg" },
  };
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
