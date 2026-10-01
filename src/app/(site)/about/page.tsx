import type { Metadata } from "next";
import AboutView from "@/components/AboutView";
import JsonLd from "@/components/JsonLd";
import { getAbout } from "@/lib/pages/store";
import { getSiteSettings } from "@/lib/queries/siteSettings";
import { aboutSchema, breadcrumbSchema, pageMetadata, plain } from "@/lib/pages/seo";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getAbout();
  return pageMetadata(c, "About Us", plain(c.intro), "/about");
}

export default async function AboutPage() {
  const [c, s] = await Promise.all([getAbout(), getSiteSettings()]);
  const sameAs = [s.facebookUrl, s.instagramUrl, s.linkedinUrl, s.youtubeUrl].filter(Boolean);
  return (
    <>
      <JsonLd data={[aboutSchema(c, sameAs), breadcrumbSchema([{ name: "Home", path: "/" }, { name: "About Us", path: "/about" }])]} />
      <AboutView content={c} />
    </>
  );
}
