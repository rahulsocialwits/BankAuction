# Request to eAuctionsIndia for authorised data access (draft)

Send from the business email of BankAuction.co. Keep their answer in writing and attach it to `docs/launch/SOURCE_ACCESS_STATUS.md`.

**Subject:** Request for permission / data licence: BankAuction.co (auction.bizsocio.com)

Hello,

We run BankAuction.co, an information website about bank and financial-institution property auctions in India. Many of our visitors also look at eAuctionsIndia.

We would like to include your property auction listings (title, bank, address, reserve price, EMD, auction date, property type and the link to your notice) in our catalogue, with a visible credit and a link to your page for every listing. Before we do anything, we want your permission.

Could you tell us:
1. Do you offer an API, a data feed or a periodic export of the listings, and under what licence and cost?
2. If not, do you permit automated reading of your public listing pages? If yes, which URLs, at what maximum request rate, and with which user agent should we identify ourselves?
3. Is there a Cloudflare / bot-protection allow-list we should be added to, so that our identified crawler is not challenged?
4. What credit or link-back do you require, and how long may we keep the data?

Until we hear from you we do not access your site automatically.

Regards,
BankAuction.co team

---
Technical note for whoever follows up: the crawler identifies itself as `BankAuctionBot/1.0 (+https://auction.bizsocio.com)`, reads robots.txt first and stops at the first refusal.
