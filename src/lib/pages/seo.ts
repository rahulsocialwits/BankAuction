import type { Metadata } from "next";
import { SITE_URL, clip } from "@/lib/seo";
import type { AboutContent, FaqContent, PolicyContent } from "./content";

/** Plain text from the admin's mini-format (bold, links, bullets), for meta descriptions and structured data. */
export function plain(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Seo = { seoTitle: string; seoDescription: string };

export function pageMetadata(content: Seo, fallbackTitle: string, fallbackDescription: string, path: string): Metadata {
  const title = content.seoTitle || fallbackTitle;
  const description = clip(content.seoDescription || fallbackDescription, 160);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export function policySchema(c: PolicyContent, path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: c.heroTitle,
    url: `${SITE_URL}${path}`,
    description: clip(c.seoDescription || plain(c.sections[0]?.body ?? c.heroSubtitle), 160),
    isPartOf: { "@type": "WebSite", name: "BankAuction.co", url: SITE_URL },
    ...(c.lastUpdated && !Number.isNaN(Date.parse(c.lastUpdated)) ? { dateModified: new Date(c.lastUpdated).toISOString() } : {}),
  };
}

export function faqSchema(c: FaqContent) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: c.categories.flatMap((cat) =>
      cat.items.map((it) => ({ "@type": "Question", name: it.q, acceptedAnswer: { "@type": "Answer", text: plain(it.a) } })),
    ),
  };
}

export function aboutSchema(c: AboutContent, sameAs: string[]) {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: c.title,
    url: `${SITE_URL}/about`,
    description: clip(c.seoDescription || plain(c.intro), 160),
    mainEntity: { "@type": "Organization", name: "BankAuction.co", url: SITE_URL, ...(sameAs.length ? { sameAs } : {}) },
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${SITE_URL}${it.path}` })),
  };
}
