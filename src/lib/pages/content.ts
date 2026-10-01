/**
 * Content of the editable public pages. The master admin edits these in Admin → Pages; the defaults below are
 * what the site shows until a page is saved (and what "Reset to default" brings back).
 *
 * Text fields use a tiny safe format: a blank line starts a new paragraph, lines starting with "- " make a bullet
 * list, **bold** makes bold text and [text](https://link) makes a link. No HTML is ever rendered.
 */

export type PageKey = "about" | "privacy" | "terms" | "disclaimer" | "faq";
export const PAGE_KEYS: PageKey[] = ["about", "privacy", "terms", "disclaimer", "faq"];

export const PAGE_META: Record<PageKey, { label: string; path: string; kind: "about" | "policy" | "faq" }> = {
  about: { label: "About Us", path: "/about", kind: "about" },
  privacy: { label: "Privacy Policy", path: "/privacy-policy", kind: "policy" },
  terms: { label: "Terms and Conditions", path: "/terms-and-conditions", kind: "policy" },
  disclaimer: { label: "Disclaimer", path: "/disclaimer", kind: "policy" },
  faq: { label: "FAQ", path: "/faq", kind: "faq" },
};

export interface PolicySection {
  id: string;
  title: string;
  body: string;
}
export interface PolicyContent {
  heroTitle: string;
  heroSubtitle: string;
  lastUpdated: string; // free text, e.g. "1 October 2026"
  sections: PolicySection[];
  seoTitle: string;
  seoDescription: string;
}

export interface FaqItem {
  q: string;
  a: string;
}
export interface FaqCategory {
  id: string;
  name: string;
  items: FaqItem[];
}
export interface FaqContent {
  heroTitle: string;
  heroSubtitle: string;
  categories: FaqCategory[];
  seoTitle: string;
  seoDescription: string;
}

export interface AboutContent {
  title: string;
  intro: string;
  imageUrl: string; // 1200 × 1200 picture (empty = illustrated placeholder)
  imageAlt: string;
  missionTitle: string;
  missionPoints: string[];
  visionTitle: string;
  visionPoints: string[];
  buttonLabel: string;
  buttonHref: string;
  seoTitle: string;
  seoDescription: string;
}

export type PageContent = PolicyContent | FaqContent | AboutContent;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "section";

const sec = (title: string, body: string): PolicySection => ({ id: slug(title), title, body });

export const DEFAULT_ABOUT: AboutContent = {
  title: "About BankAuction.co",
  intro:
    "BankAuction.co is a discovery platform for Indian bank-auction properties. We bring public auction notices from banks into one searchable place, so a buyer can compare flats, houses, plots and commercial assets by state, city, bank and price, and then verify every detail with the bank before bidding.",
  imageUrl: "",
  imageAlt: "BankAuction.co: find bank auction properties across India",
  missionTitle: "Our Mission",
  missionPoints: [
    "**Make bank auctions easy to find.** Every live and upcoming listing in one clean, searchable place.",
    "**Keep information honest.** Where a notice does not state a fact, we show it as Not Available instead of guessing.",
    "**Stay current.** Listings refresh automatically, so prices, dates and statuses are up to date.",
  ],
  visionTitle: "Our Vision",
  visionPoints: [
    "**To be the first place** an Indian buyer looks when they want a property sold through a bank auction.",
    "**To make auctions less intimidating** with plain-language details, clear documents and a transparent process.",
  ],
  buttonLabel: "How it works",
  buttonHref: "/how-it-works",
  seoTitle: "About Us",
  seoDescription: "BankAuction.co brings bank auction properties from across India into one searchable place, with clear details and honest, source-based information.",
};

export const DEFAULT_PRIVACY: PolicyContent = {
  heroTitle: "Privacy Policy",
  heroSubtitle: "We are committed to protecting your privacy and being clear about how we collect, use and safeguard your personal information.",
  lastUpdated: "1 October 2026",
  sections: [
    sec(
      "Introduction",
      "This Privacy Policy explains how BankAuction.co collects, uses and protects your information when you visit our website or use our services.\n\nBy using the site you agree to the practices described here. If you do not agree, please do not use the site.",
    ),
    sec(
      "Information we collect",
      "We collect only what we need to run the service:\n\n- **Details you give us:** your name, email address and phone number when you register, send an enquiry or contact us, and the message you write.\n- **Account details:** your login email and a securely hashed password if you create an account.\n- **Usage information:** pages visited, searches made and basic device and browser details, collected through cookies and similar tools.\n\nWe do not ask for bank account, card or government identity numbers on this site.",
    ),
    sec(
      "How we use your information",
      "We use your information to:\n\n- answer your enquiries and connect you with the information you asked about;\n- create and manage your account and any premium plan;\n- send alerts you have asked for;\n- understand how the site is used and improve it;\n- keep the site secure and prevent misuse.\n\nWe do not sell your personal information.",
    ),
    sec(
      "Cookies",
      "Cookies are small files stored in your browser. We use them to keep you signed in, remember simple preferences and measure how the site is used. You can block or delete cookies in your browser settings; some parts of the site may then not work properly.",
    ),
    sec(
      "Sharing and third parties",
      "We share information only when needed to run the service, for example with trusted providers for hosting, email delivery and (when you buy a plan) payment processing. These providers may use the information only to perform their service for us. We may also disclose information if the law requires it.\n\nThe site contains links to bank and auction websites. Their privacy practices are their own, so please read their policies.",
    ),
    sec(
      "Data retention and security",
      "We keep your information only as long as it is needed for the purposes above or as the law requires. We use reasonable technical and organisational measures to protect it, but no method of transmission or storage is completely secure.",
    ),
    sec(
      "Your choices and rights",
      "You may ask us to access, correct or delete the personal information we hold about you, and you can unsubscribe from alerts at any time. To make a request, use the details on our Contact page and we will respond within a reasonable time, in line with applicable Indian law including the Digital Personal Data Protection Act, 2023.",
    ),
    sec(
      "Contact us",
      "If you have a question about this policy or your information, please reach us through the [Contact page](/contact).",
    ),
  ],
  seoTitle: "Privacy Policy",
  seoDescription: "How BankAuction.co collects, uses and protects your personal information, your choices, and how to contact us about privacy.",
};

export const DEFAULT_TERMS: PolicyContent = {
  heroTitle: "Terms and Conditions",
  heroSubtitle: "Please read these terms carefully before using BankAuction.co.",
  lastUpdated: "1 October 2026",
  sections: [
    sec(
      "Acceptance of terms",
      "By accessing or using BankAuction.co you agree to these Terms and Conditions and to our Privacy Policy. If you do not agree, please do not use the site.",
    ),
    sec(
      "About the service",
      "BankAuction.co is an independent information platform that collects publicly available bank-auction notices and presents them in a searchable form. **We are not an auctioneer, a broker or a bank, and we do not sell properties.** Bids, payments and transfers happen directly with the bank or its authorised auction platform.",
    ),
    sec(
      "Information is for discovery only",
      "Listings are compiled from public notices and may be incomplete, delayed or changed by the bank after publication. Always confirm the property details, dates, reserve price, EMD and terms against the official notice and with the bank before taking any action.",
    ),
    sec(
      "No professional advice",
      "Nothing on this site is legal, financial, tax or investment advice. Buying a property at auction carries risks (title, possession, dues, litigation). Please get independent professional advice and inspect the property before bidding.",
    ),
    sec(
      "Accounts and premium plans",
      "You are responsible for keeping your login details safe and for activity under your account. Premium plans unlock extra information such as borrower details and document links for the period you have paid for. Fees, if any, are shown at the time of purchase; refund rules, where they apply, are stated on the pricing page.",
    ),
    sec(
      "Acceptable use",
      "You agree not to:\n\n- copy, scrape or resell the site's content in bulk without our written permission;\n- attempt to disrupt, overload or gain unauthorised access to the site;\n- submit false or misleading enquiries;\n- use the site for any unlawful purpose.",
    ),
    sec(
      "Intellectual property",
      "The site's design, text and software belong to BankAuction.co or its licensors. Auction notices and bank names remain the property of their respective owners and are used only to describe the listings.",
    ),
    sec(
      "Third-party links",
      "The site links to bank and auction websites that we do not control. We are not responsible for their content, availability or practices.",
    ),
    sec(
      "Limitation of liability",
      "To the fullest extent permitted by law, BankAuction.co is not liable for any loss or damage arising from your use of, or reliance on, information on the site, including any decision to bid on or buy a property. The site is provided on an \"as is\" and \"as available\" basis.",
    ),
    sec(
      "Changes to these terms",
      "We may update these terms from time to time. The date at the top shows when they were last changed. Continuing to use the site after a change means you accept the updated terms.",
    ),
    sec(
      "Governing law",
      "These terms are governed by the laws of India. Any dispute is subject to the exclusive jurisdiction of the courts at the location of our registered office.",
    ),
    sec("Contact", "Questions about these terms? Please use the [Contact page](/contact)."),
  ],
  seoTitle: "Terms and Conditions",
  seoDescription: "The terms and conditions for using BankAuction.co: what the service is, how to use it, premium plans and your responsibilities.",
};

export const DEFAULT_DISCLAIMER: PolicyContent = {
  heroTitle: "Disclaimer",
  heroSubtitle: "BankAuction.co is an independent discovery platform. Please read this before you rely on anything shown here.",
  lastUpdated: "1 October 2026",
  sections: [
    sec(
      "Independent platform",
      "BankAuction.co is not affiliated with, endorsed by or acting for any bank, financial institution or auction authority listed on the site. Bank and brand names are used only to identify the source of each listing.",
    ),
    sec(
      "Verify before you bid",
      "**All property and auction details must be independently verified with the concerned bank before you participate in any auction.** Confirm the notice, dates, reserve price, EMD, inspection arrangements, dues and the exact terms of sale from the official documents.",
    ),
    sec(
      "Accuracy and timeliness",
      "Listings are collected from public notices and refreshed regularly, but banks can change, postpone or cancel an auction at any time. We do not guarantee that the information is complete, accurate or up to date. Where a notice does not state a fact, we show it as Not Available rather than guessing.",
    ),
    sec(
      "Not advice",
      "The content is for general information only and is not legal, financial, tax or investment advice. Take professional advice before making any decision.",
    ),
    sec(
      "Auction risks",
      "Properties sold through bank auctions are usually sold \"as is where is\" and may carry risks such as title defects, pending litigation, unpaid dues or occupation by third parties. You bid and buy at your own risk.",
    ),
    sec(
      "Limitation of liability",
      "BankAuction.co and its team are not responsible for any loss arising from the use of this site or from reliance on information on it.",
    ),
  ],
  seoTitle: "Disclaimer",
  seoDescription: "BankAuction.co is an independent discovery platform. Always verify auction details with the concerned bank before bidding.",
};

const fq = (q: string, a: string): FaqItem => ({ q, a });

export const DEFAULT_FAQ: FaqContent = {
  heroTitle: "Frequently Asked Questions",
  heroSubtitle: "Find answers to common questions about bank auctions and about using BankAuction.co.",
  categories: [
    {
      id: "getting-started",
      name: "Getting started",
      items: [
        fq("What is BankAuction.co?", "BankAuction.co is a free-to-search platform that gathers bank-auction property notices from across India into one place, so you can search by state, city, bank, property type and price."),
        fq("Is it free to use?", "Searching and viewing listings is free. A paid premium plan unlocks extra information such as borrower details and links to the official documents."),
        fq("How often are listings updated?", "Listings are refreshed automatically several times a day. Banks can still change or cancel an auction, so always confirm with the bank."),
        fq("Do you sell the properties?", "No. We are not an auctioneer or a broker. We show the information; bidding and payment happen with the bank or its authorised auction portal."),
      ],
    },
    {
      id: "bank-auctions",
      name: "Bank auctions",
      items: [
        fq("What is a bank auction?", "When a borrower does not repay a loan, the bank can sell the property that was pledged as security, usually through a public auction under the SARFAESI Act, to recover its dues."),
        fq("What is the reserve price?", "The reserve price is the minimum amount below which the bank will not sell the property. Bidding starts at or above it."),
        fq("What is EMD?", "EMD (Earnest Money Deposit) is a refundable deposit, usually a percentage of the reserve price, that a bidder pays to take part. It is returned if you do not win and adjusted against the price if you do."),
        fq("Can anyone take part in a bank auction?", "Generally yes: any eligible individual or entity who registers with the auction platform and pays the EMD can bid. Each notice states its own conditions, so read it fully."),
      ],
    },
    {
      id: "buying-process",
      name: "Buying process",
      items: [
        fq("How do I take part in an auction?", "Find the listing, read the official notice, inspect the property if allowed, register with the bank's auction platform, pay the EMD before the deadline and bid on the auction date."),
        fq("What does symbolic or physical possession mean?", "With physical possession the bank can hand over the property directly. With symbolic possession the bank has taken legal control on paper, but the property may still be occupied, so the buyer may need legal steps to get actual possession."),
        fq("Can I inspect the property before bidding?", "Most notices give an inspection date and a contact person. Inspect it whenever you can, and check title and dues with a lawyer before you bid."),
        fq("What happens if I win?", "You normally pay a part of the price immediately and the balance within the period stated in the notice (often 15 to 30 days). The bank then issues a sale certificate."),
      ],
    },
    {
      id: "account-premium",
      name: "Account and premium",
      items: [
        fq("What does the premium plan include?", "Premium shows full borrower details and opens the official documents attached to each listing, along with alerts. See the Pricing page for the current plans."),
        fq("How do I pay for a plan?", "Plans are paid online through our payment partner. If online payment is not yet available for you, contact us and we will activate a plan manually."),
        fq("How do I contact support?", "Use the Contact page or the phone number and email shown in the footer. We reply during working hours."),
      ],
    },
  ],
  seoTitle: "FAQ: Bank Auction Questions Answered",
  seoDescription: "Answers to common questions about bank auctions in India: reserve price, EMD, SARFAESI, possession, how to bid, and how BankAuction.co works.",
};

export const DEFAULTS: Record<PageKey, PageContent> = {
  about: DEFAULT_ABOUT,
  privacy: DEFAULT_PRIVACY,
  terms: DEFAULT_TERMS,
  disclaimer: DEFAULT_DISCLAIMER,
  faq: DEFAULT_FAQ,
};

// ---------- cleaning what the admin form sends (never trust the client) ----------

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const lines = (v: unknown, maxItems: number, maxLen: number): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : []).map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems);

/** Only http(s), mailto, tel and site-relative links are allowed. */
export function safeHref(href: string): string {
  const h = href.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(h) || (h.startsWith("/") && !h.startsWith("//"))) return h;
  return "";
}

export function cleanPolicy(raw: unknown, fallback: PolicyContent): PolicyContent {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const used = new Set<string>();
  const sections = (Array.isArray(r.sections) ? r.sections : [])
    .map((s) => {
      const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const title = str(o.title, 120);
      const body = str(o.body, 12000);
      let id = slug(title);
      for (let i = 2; used.has(id); i++) id = `${slug(title)}-${i}`;
      used.add(id);
      return { id, title, body };
    })
    .filter((s) => s.title && s.body)
    .slice(0, 40);
  return {
    heroTitle: str(r.heroTitle, 100) || fallback.heroTitle,
    heroSubtitle: str(r.heroSubtitle, 300),
    lastUpdated: str(r.lastUpdated, 40),
    sections: sections.length ? sections : fallback.sections,
    seoTitle: str(r.seoTitle, 70),
    seoDescription: str(r.seoDescription, 170),
  };
}

export function cleanFaq(raw: unknown, fallback: FaqContent): FaqContent {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const used = new Set<string>();
  const categories = (Array.isArray(r.categories) ? r.categories : [])
    .map((c) => {
      const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      const name = str(o.name, 60);
      let id = slug(name);
      for (let i = 2; used.has(id); i++) id = `${slug(name)}-${i}`;
      used.add(id);
      const items = (Array.isArray(o.items) ? o.items : [])
        .map((it) => {
          const x = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
          return { q: str(x.q, 200), a: str(x.a, 4000) };
        })
        .filter((it) => it.q && it.a)
        .slice(0, 60);
      return { id, name, items };
    })
    .filter((c) => c.name && c.items.length)
    .slice(0, 12);
  return {
    heroTitle: str(r.heroTitle, 100) || fallback.heroTitle,
    heroSubtitle: str(r.heroSubtitle, 300),
    categories: categories.length ? categories : fallback.categories,
    seoTitle: str(r.seoTitle, 70),
    seoDescription: str(r.seoDescription, 170),
  };
}

export function cleanAbout(raw: unknown, fallback: AboutContent): AboutContent {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const img = str(r.imageUrl, 300);
  return {
    title: str(r.title, 100) || fallback.title,
    intro: str(r.intro, 1500),
    imageUrl: img.startsWith("/api/media/") || /^https:\/\//i.test(img) ? img : "",
    imageAlt: str(r.imageAlt, 140) || fallback.imageAlt,
    missionTitle: str(r.missionTitle, 60) || fallback.missionTitle,
    missionPoints: lines(r.missionPoints, 8, 300),
    visionTitle: str(r.visionTitle, 60) || fallback.visionTitle,
    visionPoints: lines(r.visionPoints, 8, 300),
    buttonLabel: str(r.buttonLabel, 30),
    buttonHref: safeHref(str(r.buttonHref, 200)),
    seoTitle: str(r.seoTitle, 70),
    seoDescription: str(r.seoDescription, 170),
  };
}

export function cleanPage(key: PageKey, raw: unknown): PageContent {
  switch (PAGE_META[key].kind) {
    case "about":
      return cleanAbout(raw, DEFAULT_ABOUT);
    case "faq":
      return cleanFaq(raw, DEFAULT_FAQ);
    default:
      return cleanPolicy(raw, DEFAULTS[key] as PolicyContent);
  }
}
