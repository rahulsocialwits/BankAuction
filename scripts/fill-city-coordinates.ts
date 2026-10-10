/*
 * Gives properties without coordinates the centre of their city (approximate; flagged coord_quality = city_centroid).
 *   npx tsx scripts/fill-city-coordinates.ts [maxCities] [budgetSeconds]      defaults: 400 cities, 900 seconds
 * Looks each city up ONCE at OpenStreetMap Nominatim (1 request per second, identifying user agent) and remembers it in the `cities` table.
 * It only fills properties that have NO coordinates; it never changes an existing point. Writes to the database in .env.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { fillCityCoordinates } from "../src/lib/map/cityCoordinates";

(async () => {
  const maxCities = Number(process.argv[2] ?? "400");
  const budget = Number(process.argv[3] ?? "900") * 1000;
  const r = await fillCityCoordinates({ maxCities, budgetMs: budget, onLog: (l) => console.log(l) });
  console.log("\nDONE", JSON.stringify(r));
  await prisma.$disconnect();
  process.exit(0);
})();
