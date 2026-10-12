/*
 * Makes stored city names follow the canonical list (src/lib/pipeline/locations.ts): "Vasai Virar" and "Vasai-Virar" -> "Vasai",
 * "Ambarnath" -> "Ambernath", "Aurangabad" (Maharashtra only) -> "Chhatrapati Sambhajinagar", and so on. VALUES ONLY: nothing is deleted
 * and no other field is touched. Owner decisions D15 (names) and D16 (a production run needs approval, a before-snapshot and a rollback).
 *
 *   npx tsx scripts/normalize-city-aliases.ts                       DRY RUN (default): prints what would change, writes nothing
 *   npx tsx scripts/normalize-city-aliases.ts --apply               writes the change, after saving a BEFORE-SNAPSHOT file in this folder
 *   npx tsx scripts/normalize-city-aliases.ts --rollback=<file>     puts every city back as it was in that snapshot file
 *
 * The snapshot file city-normalize-backup-<time>.json holds {id, geoCity} of every changed property. Keep it until you are sure.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "../src/lib/db/prisma";
import { canonCityInState } from "../src/lib/pipeline/locations";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

(async () => {
  const rollbackFile = arg("rollback");
  if (rollbackFile) {
    const rows = JSON.parse(readFileSync(rollbackFile, "utf8")) as { id: string; geoCity: string | null }[];
    let n = 0;
    for (const r of rows) { await prisma.property.update({ where: { id: r.id }, data: { geoCity: r.geoCity } }); n++; }
    console.log(`Rolled back ${n} properties from ${rollbackFile}.`);
    return;
  }

  const apply = process.argv.includes("--apply");
  const groups = await prisma.property.groupBy({ by: ["geoCity", "geoState"], where: { geoCity: { not: null } }, _count: { _all: true } });
  const changes = groups
    .map((g) => ({ from: g.geoCity as string, state: g.geoState, to: canonCityInState(g.geoCity as string, g.geoState), n: g._count._all }))
    .filter((c) => c.to !== c.from);

  if (changes.length === 0) return console.log("Nothing to change: every stored city already has its canonical name.");
  console.log(apply ? "APPLYING:" : "DRY RUN (nothing is written). Would change:");
  for (const c of changes.sort((a, b) => b.n - a.n)) console.log(`  ${String(c.n).padStart(5)}  "${c.from}" (${c.state ?? "no state"}) -> "${c.to}"`);
  console.log(`Total: ${changes.reduce((n, c) => n + c.n, 0)} properties in ${changes.length} groups.`);
  if (!apply) return console.log("\nRun again with --apply to write it (a before-snapshot file is saved first).");

  const snapshot: { id: string; geoCity: string | null }[] = [];
  for (const c of changes) {
    const ids = await prisma.property.findMany({ where: { geoCity: c.from, geoState: c.state }, select: { id: true } });
    snapshot.push(...ids.map((x) => ({ id: x.id, geoCity: c.from })));
  }
  const file = `city-normalize-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(snapshot));
  console.log(`Before-snapshot saved: ${file} (${snapshot.length} properties).`);
  let done = 0;
  for (const c of changes) {
    done += (await prisma.property.updateMany({ where: { geoCity: c.from, geoState: c.state }, data: { geoCity: c.to } })).count;
  }
  console.log(`Updated ${done} properties. To undo: npx tsx scripts/normalize-city-aliases.ts --rollback=${file}`);
})()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
