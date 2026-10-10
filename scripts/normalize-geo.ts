import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { canonCity } from "../src/lib/pipeline/locations";

/* Makes geoCity / geoState one spelling per place (values only: nothing is deleted). `--dry` prints without writing. */

const STATE_FIX: Record<string, string> = {
  "jammu and kashmir": "Jammu And Kashmir",
  "dadra and nagar haveli": "Dadra And Nagar Haveli And Daman And Diu",
  "dadra and nagar haveli and daman & diu": "Dadra And Nagar Haveli And Daman And Diu",
  "dadra and nagar haveli and daman and diu": "Dadra And Nagar Haveli And Daman And Diu",
  "daman and diu": "Dadra And Nagar Haveli And Daman And Diu",
  "andaman & nicobar islands": "Andaman And Nicobar Islands",
  "andaman and nicobar islands": "Andaman And Nicobar Islands",
};

const cleanCity = (s: string) => canonCity(s.replace(/[.,;]+$/g, "").replace(/-/g, " ").replace(/\s+/g, " ").trim());

(async () => {
  const dry = process.argv.includes("--dry");
  let changed = 0;
  const cities = await prisma.property.groupBy({ by: ["geoCity"], where: { geoCity: { not: null } } });
  // variants that differ only in spacing (Vikasnagar / Vikas Nagar): use the spelling with more properties
  const counts = await prisma.property.groupBy({ by: ["geoCity"], where: { geoCity: { not: null } }, _count: { _all: true } });
  const n = new Map(counts.map((c) => [c.geoCity!, c._count._all]));
  const byKey = new Map<string, string>();
  for (const c of cities) {
    const v = cleanCity(c.geoCity!);
    const k = v.toLowerCase().replace(/[^a-z]/g, "");
    const cur = byKey.get(k);
    if (!cur || (n.get(c.geoCity!) ?? 0) > (n.get(cur) ?? 0)) byKey.set(k, v);
  }
  for (const c of cities) {
    const target = byKey.get(cleanCity(c.geoCity!).toLowerCase().replace(/[^a-z]/g, "")) ?? cleanCity(c.geoCity!);
    if (target === c.geoCity) continue;
    console.log(`city  "${c.geoCity}" -> "${target}"`);
    if (!dry) changed += (await prisma.property.updateMany({ where: { geoCity: c.geoCity }, data: { geoCity: target } })).count;
  }
  const states = await prisma.property.groupBy({ by: ["geoState"], where: { geoState: { not: null } } });
  for (const s of states) {
    const target = STATE_FIX[s.geoState!.toLowerCase().trim()];
    if (!target || target === s.geoState) continue;
    console.log(`state "${s.geoState}" -> "${target}"`);
    if (!dry) changed += (await prisma.property.updateMany({ where: { geoState: s.geoState }, data: { geoState: target } })).count;
  }
  console.log(dry ? "dry run" : `rows updated: ${changed}`);
  await prisma.$disconnect();
  process.exit(0);
})();
