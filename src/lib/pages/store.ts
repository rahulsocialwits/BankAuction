import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { DEFAULTS, cleanPage, type AboutContent, type FaqContent, type PageContent, type PageKey, type PolicyContent } from "./content";

export const PAGES_TAG = "site-pages";

const load = unstable_cache(
  async (key: PageKey): Promise<{ content: PageContent; saved: boolean; updatedAt: string | null }> => {
    try {
      const row = await prisma.sitePage.findUnique({ where: { key } });
      if (row) return { content: cleanPage(key, row.data), saved: true, updatedAt: row.updatedAt.toISOString() };
    } catch {
      /* table not reachable: the defaults still render */
    }
    return { content: DEFAULTS[key], saved: false, updatedAt: null };
  },
  ["site-page-v1"],
  { revalidate: 300, tags: [PAGES_TAG] },
);

export const getPage = load;
export const getPolicy = async (key: "privacy" | "terms" | "disclaimer") => (await load(key)).content as PolicyContent;
export const getFaq = async () => (await load("faq")).content as FaqContent;
export const getAbout = async () => (await load("about")).content as AboutContent;
