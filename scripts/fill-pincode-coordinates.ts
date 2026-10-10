/*
 * Places properties at the centre of their PIN code area (better than the city centre; flagged coord_quality = pincode).
 *   npx tsx scripts/fill-pincode-coordinates.ts [maxPins] [budgetSeconds] [--dry] [--city=Mumbai]      defaults: 20 PINs, 120 seconds
 * --dry looks the PINs up and prints what it WOULD do, writing nothing. Without --dry it writes to the database in .env.
 * One Nominatim request per second. It never changes a point taken from a notice and never replaces a PIN point by a city point.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { fillPincodeCoordinates } from "../src/lib/map/pincodeCoordinates";

(async () => {
  const nums = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const city = process.argv.find((a) => a.startsWith("--city="))?.slice(7);
  const dry = process.argv.includes("--dry");
  const r = await fillPincodeCoordinates({ maxPins: Number(nums[0] ?? "20"), budgetMs: Number(nums[1] ?? "120") * 1000, city, dry, onLog: (l) => console.log(l) });
  console.log("\nDONE", JSON.stringify(r), dry ? "(dry run: nothing written)" : "");
  await prisma.$disconnect();
  process.exit(0);
})();
