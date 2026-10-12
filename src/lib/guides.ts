/*
 * Plain-language guides about bank auctions. General information only: it is not legal, financial or tax advice, and the notice of each
 * auction always decides (dates, EMD, increments, payment time, terms). Each guide has its own title and description (unique per page).
 */

export interface GuideSection { heading: string; body: string[] }
export interface Guide { slug: string; title: string; description: string; audience: string; sections: GuideSection[] }

export const GUIDES: Guide[] = [
  {
    slug: "how-bank-auctions-work",
    title: "How bank auctions work in India",
    description: "What a bank auction is, why banks sell properties, and how the sale moves from a notice to the winning bid.",
    audience: "Everyone",
    sections: [
      { heading: "Why banks auction properties", body: ["When a borrower stops repaying a loan that is secured by a property, the bank or financial institution can take steps to recover the money. Under the SARFAESI Act, a secured lender can, after following the notice process, sell the secured property through an auction.", "The auction price is meant to recover the loan, so these properties are often offered close to or below market value. They are also sold with limitations, which is why checking the details matters."] },
      { heading: "From notice to auction", body: ["The bank publishes an auction or sale notice with the property description, the reserve price, the EMD, the auction date and time, how to inspect the property and how to bid.", "Most auctions are now e-auctions: you register on the auction portal named in the notice, pay the EMD and bid online during the auction window."] },
      { heading: "What BankAuction.co does", body: ["We collect public notices and portal listings in one place so you can search by city, bank, type and price. We do not run the auction and we do not sell the property. Always confirm every detail with the bank or the portal in the official notice before you bid."] },
    ],
  },
  {
    slug: "emd-and-reserve-price",
    title: "EMD and reserve price explained",
    description: "What the reserve price and the Earnest Money Deposit (EMD) mean in a bank auction, and what happens to your EMD.",
    audience: "First-time buyers",
    sections: [
      { heading: "Reserve price", body: ["The reserve price is the minimum price the bank will accept for the property. You cannot win by bidding below it. The auction usually starts at the reserve price and goes up by the bid increment named in the notice."] },
      { heading: "EMD (Earnest Money Deposit)", body: ["To take part you pay an EMD, often around ten percent of the reserve price, but the notice states the exact amount and how to pay it. It shows you are a serious bidder.", "If you do not win, the EMD is normally returned as the notice describes. If you win, it is adjusted against the price. If a winning bidder does not complete the purchase, the bank can keep the EMD, so bid only what you can pay."] },
      { heading: "What to check", body: ["The EMD amount, the last date to pay it, the account or portal where it must be paid, the bid increment and the payment timeline after a win. All of these are in the official notice."] },
    ],
  },
  {
    slug: "how-to-bid-in-a-bank-auction",
    title: "How to bid in a bank e-auction, step by step",
    description: "A practical step-by-step path from finding a property to paying the balance after you win.",
    audience: "First-time buyers",
    sections: [
      { heading: "Before the auction", body: ["Find a property and read the full notice. Visit or inspect the property on the inspection date. Check the title and dues (see the due diligence guide). Register on the portal named in the notice and complete its KYC, then pay the EMD before the deadline."] },
      { heading: "During the auction", body: ["Log in at the auction time and bid within the window. Many e-auctions extend the end time when a bid arrives near the close, so keep your budget fixed and do not bid above it."] },
      { heading: "After you win", body: ["The bank confirms the sale. Under the usual SARFAESI rules the highest bidder pays a part of the price quickly (commonly 25 percent) and the balance within about 15 days, unless the notice says otherwise. Delay can cost you the deposit.", "After full payment you receive a sale certificate and then take possession as the sale terms describe. Registration and stamp duty follow the normal rules of your state."] },
    ],
  },
  {
    slug: "due-diligence-checklist",
    title: "Due diligence checklist before bidding on a bank auction property",
    description: "The checks to make on title, dues, possession and the notice before you pay an EMD for a bank auction property.",
    audience: "Investors and lawyers",
    sections: [
      { heading: "Title and legal checks", body: ["Ask a lawyer to run a title search and check the chain of documents. Check for an encumbrance certificate, other mortgages, pending court cases, and whether the bank followed the notice process.", "Bank auctions are usually sold on an as-is basis: the bank does not promise anything about the condition or the legal position beyond what the notice says."] },
      { heading: "Dues and possession", body: ["Find out who is in possession (physical or symbolic), and whether tenants or the borrower still live there. Check property tax, electricity, water and society or maintenance dues, because the buyer may have to clear them."] },
      { heading: "The notice and the numbers", body: ["Match the address, area, reserve price, EMD and dates on the notice with what you saw. Plan the full cost: price, stamp duty, registration, dues, repairs and possible legal costs for getting possession."] },
    ],
  },
  {
    slug: "bank-auction-guide-for-investors",
    title: "Bank auction guide for property investors",
    description: "How investors can use bank auctions: finding opportunities, comparing price with the market and managing the risks.",
    audience: "Investors",
    sections: [
      { heading: "Where the opportunity is", body: ["Reserve prices can be below the usual market price, and some auctions are repeated at lower prices. Compare the reserve price with recent sale prices nearby before you decide."] },
      { heading: "Risks to price in", body: ["Possession can take time, titles may have issues, and properties can be in poor condition. Keep a margin for legal costs, dues and repairs, and never bid on a property you have not inspected."] },
      { heading: "A workable routine", body: ["Shortlist by city and budget, read each notice, inspect, run the legal checks, set a maximum bid in advance, and walk away if the numbers do not work."] },
    ],
  },
  {
    slug: "bank-auction-guide-for-brokers",
    title: "Bank auction guide for brokers and agents",
    description: "How brokers can follow bank auction listings for clients, and what to confirm before you recommend one.",
    audience: "Brokers and agents",
    sections: [
      { heading: "Following listings for clients", body: ["Use the search and filters to track new listings by city, locality, bank and price. Share the property link with the client and always point them to the official notice for the final details."] },
      { heading: "What to confirm", body: ["Auction date and time, EMD, reserve price, inspection date, possession status and the portal used. Listings here are collected from public sources and can change, so confirm with the bank before advising a client."] },
    ],
  },
  {
    slug: "bank-auction-guide-for-lawyers",
    title: "Bank auction guide for lawyers and legal advisers",
    description: "Points a lawyer typically reviews for a client interested in a SARFAESI bank auction property.",
    audience: "Lawyers",
    sections: [
      { heading: "What to review", body: ["The demand and possession notices, compliance with the SARFAESI process, the auction sale notice and its terms, the chain of title, existing encumbrances, pending proceedings and any tenancy or third-party rights."] },
      { heading: "Terms to read carefully", body: ["As-is sale terms, the payment timeline after the bid, the consequence of default, who bears dues, and the process for the sale certificate and possession. The bank notice and the sale terms govern, not this website."] },
    ],
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug) ?? null;
