/*
 * One-off: gives BAANKNET properties their verified city / state from the data the importer stored in `addressText`
 * ("City, [District,] State, Pincode"), without AI. It only fills EMPTY geoCity / geoState (never overwrites an AI-checked place).
 *   npx tsx scripts/backfill-baanknet-geo.ts [--dry]        Writes to the database in .env unless --dry.
 * New and re-read BAANKNET records get these fields at import (see baanknetRecordsFromSources + enrichExisting).
 */
import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { canonCity, titleCase } from "../src/lib/pipeline/locations";

const STATES = new Set(["andaman and nicobar islands", "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chandigarh", "chhattisgarh", "dadra and nagar haveli", "daman and diu", "delhi", "goa", "gujarat", "haryana", "himachal pradesh", "jammu and kashmir", "jharkhand", "karnataka", "kerala", "ladakh", "lakshadweep", "madhya pradesh", "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland", "odisha", "puducherry", "punjab", "rajasthan", "sikkim", "tamil nadu", "telangana", "tripura", "uttar pradesh", "uttarakhand", "west bengal"]);

(async () => {
  const dry = process.argv.includes("--dry");
  const rows = await prisma.property.findMany({
    where: { geoCity: null, addressText: { not: null }, auctions: { some: { statusSource: "feed:baanknet.com" } } },
    select: { id: true, addressText: true },
  });
  let ok = 0, skipped = 0;
  const sample: string[] = [];
  for (const r of rows) {
    const parts = (r.addressText ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const si = parts.findIndex((x) => STATES.has(x.toLowerCase().replace(/&/g, "and")));
    if (si < 1) { skipped++; continue; }
    const city = canonCity(parts[0]);
    const state = titleCase(parts[si].replace(/&/g, "and"));
    if (sample.length < 5) sample.push(`${r.addressText}  →  ${city} | ${state}`);
    if (!dry) await prisma.property.update({ where: { id: r.id }, data: { geoCity: city, geoState: state, geoCheckedAt: new Date() } });
    ok++;
  }
  console.log(JSON.stringify({ candidates: rows.length, filled: ok, skipped, dry }), "\n" + sample.join("\n"));
  await prisma.$disconnect();
  process.exit(0);
})();
