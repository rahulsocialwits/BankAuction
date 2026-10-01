import type { Metadata } from "next";
import PolicyView from "@/components/PolicyView";
import JsonLd from "@/components/JsonLd";
import { getPolicy } from "@/lib/pages/store";
import { breadcrumbSchema, pageMetadata, plain, policySchema } from "@/lib/pages/seo";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getPolicy("privacy");
  return pageMetadata(c, "Privacy Policy", c.heroSubtitle || plain(c.sections[0]?.body ?? ""), "/privacy-policy");
}

export default async function Page() {
  const c = await getPolicy("privacy");
  return (
    <>
      <JsonLd data={[policySchema(c, "/privacy-policy"), breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Privacy Policy", path: "/privacy-policy" }])]} />
      <PolicyView content={c} path="/privacy-policy" />
    </>
  );
}