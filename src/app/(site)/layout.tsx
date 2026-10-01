import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getSiteSettings } from "@/lib/queries/siteSettings";
import { SITE_URL } from "@/lib/seo";
import { getAutoHomeDescription } from "@/lib/queries/autoMeta";
import JsonLd from "@/components/JsonLd";
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

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const s = await getSiteSettings();
  // Who we are and how to search the site: lets Google show the name, logo and a search box in results.
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "BankAuction.co",
      url: SITE_URL,
      logo: s.headerLogoUrl.startsWith("http") ? s.headerLogoUrl : `${SITE_URL}${s.headerLogoUrl.startsWith("data:") ? "/brand/logo.png" : s.headerLogoUrl}`,
      sameAs: [s.facebookUrl, s.instagramUrl, s.linkedinUrl, s.youtubeUrl].filter(Boolean),
      contactPoint: [{ "@type": "ContactPoint", telephone: s.phone, email: s.generalEmail, contactType: "customer support", areaServed: "IN", availableLanguage: ["English", "Hindi"] }],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "BankAuction.co",
      url: SITE_URL,
      potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/properties?q={search_term_string}`, "query-input": "required name=search_term_string" },
    },
  ];
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <JsonLd data={schema} />
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
