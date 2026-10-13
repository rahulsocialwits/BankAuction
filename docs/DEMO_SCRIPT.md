# Client demo script (13 Oct 2026, 2 PM)

All numbers below were read from the production database on 13 Oct about 12:40 (the import is still running, so they only grow). Re-read them with `npx tsx scripts/inventory-audit.ts` before the call.

## What is real and live
- **35,000+ published properties**; about **32,000 from BAANKNET** (the official PSB Alliance portal), the rest from ACRE (54, with exact map points), bankauctions.in, Google-sheet and bank pages.
- **7,400+ active or upcoming** auctions (the rest are ended auctions kept for history).
- **31,000+ properties with a map pin**; about 19,400 at PIN-code level, ACRE's 50 are exact points taken from the source's own map link.
- Maharashtra: 3,800+ published, and its import (about 39,000 auctions) is running.
- Premium: pricing -> checkout page -> Razorpay (switches on when the Key ID and secret are set; today it shows a request flow); account page with plan and receipts; admin can make a user Premium / normal; official documents unlock for Premium members.

## Click path (about 8 minutes)
1. **Home**: city tiles show total and active counts; search "nalasopara" (spelling-tolerant) and a PIN code.
2. **/properties?city=Mumbai&view=map**: numbered markers = properties that share one map point; click one; labels say exact / PIN area / city centre.
3. **A property page** (open an ACRE one: search "Surat plot"): gallery, documents, location map with an exact point, disclaimer, Save button.
4. **/pricing -> Buy -> /checkout**: plan summary and price; say plainly that the payment gateway is in test setup.
5. **Admin -> Run Health**: ticks, sources, counts, coordinates, AI tokens. **Admin -> Registered Users**: Payment and Premium columns, Make Premium.

## eAuctionsIndia: say exactly this
- The importer for eAuctionsIndia is built (its list-page parser was tested on a real saved page: 125,451 residential listings, 10,455 pages).
- It is **waiting for operator access**: the site shows our crawler a Cloudflare verification challenge, which we do not and will not bypass. We have asked the operator to allow-list our crawler (or give a secret header / an export). As soon as they do, the import starts.
- Admin -> Run Health shows it as **"Awaiting operator access"** (blue), with the reason. No eAuctionsIndia listing is on the site today, and none is faked.

## Demo data
No mock listings are added: they would be mixed into the production list, search, counts and sitemap, and 35,000 real ones exist. If a sample is ever needed, it must live outside the production database and be labelled "Demo Data".

## If something is slow
The first visit after a cache expiry can take a few seconds; open Home, Properties and the Mumbai map once before the call so the caches are warm.
