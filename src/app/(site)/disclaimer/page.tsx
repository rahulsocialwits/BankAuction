import type { Metadata } from "next";
import PolicyView from "@/components/PolicyView";
import JsonLd from "@/components/JsonLd";
import { getPolicy } from "@/lib/pages/store";
import { breadcrumbSchema, pageMetadata, plain, policySchema } from "@/lib/pages/seo";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getPolicy("disclaimer");
  return pageMetadata(c, "Disclaimer", c.heroSubtitle || plain(c.sections[0]?.body ?? ""), "/disclaimer");
}

export default async function Page() {
  const c = await getPolicy("disclaimer");
  return (
    <>
      <JsonLd data={[policySchema(c, "/disclaimer"), breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Disclaimer", path: "/disclaimer" }])]} />
      <PolicyView content={c} path="/disclaimer" />
    </>
  );
}