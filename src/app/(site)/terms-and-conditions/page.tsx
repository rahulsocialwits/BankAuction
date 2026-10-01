import type { Metadata } from "next";
import PolicyView from "@/components/PolicyView";
import JsonLd from "@/components/JsonLd";
import { getPolicy } from "@/lib/pages/store";
import { breadcrumbSchema, pageMetadata, plain, policySchema } from "@/lib/pages/seo";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getPolicy("terms");
  return pageMetadata(c, "Terms and Conditions", c.heroSubtitle || plain(c.sections[0]?.body ?? ""), "/terms-and-conditions");
}

export default async function Page() {
  const c = await getPolicy("terms");
  return (
    <>
      <JsonLd data={[policySchema(c, "/terms-and-conditions"), breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Terms and Conditions", path: "/terms-and-conditions" }])]} />
      <PolicyView content={c} path="/terms-and-conditions" />
    </>
  );
}