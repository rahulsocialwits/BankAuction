import type { Metadata } from "next";
import FaqView from "@/components/FaqView";
import JsonLd from "@/components/JsonLd";
import { getFaq } from "@/lib/pages/store";
import { breadcrumbSchema, faqSchema, pageMetadata } from "@/lib/pages/seo";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getFaq();
  return pageMetadata(c, "FAQ", c.heroSubtitle || "Answers to common questions about bank auctions and BankAuction.co.", "/faq");
}

export default async function FaqPage() {
  const c = await getFaq();
  return (
    <>
      <JsonLd data={[faqSchema(c), breadcrumbSchema([{ name: "Home", path: "/" }, { name: "FAQ", path: "/faq" }])]} />
      <FaqView content={c} />
    </>
  );
}
