/*
 * READ-ONLY inventory audit: runs every SELECT in docs/launch/data/inventory_audit.sql against the database in .env and prints the rows.
 *   npx tsx scripts/inventory-audit.ts
 * It cannot write: only statements that start with SELECT are executed, and nothing else is read from the file.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db/prisma";

(async () => {
  const sql = readFileSync("docs/launch/data/inventory_audit.sql", "utf8");
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim())
    .filter((s) => /^select\b/i.test(s));
  for (const [i, s] of statements.entries()) {
    try {
      const rows = await prisma.$queryRawUnsafe(s);
      console.log(`\n#${i + 1}`);
      console.table(JSON.parse(JSON.stringify(rows, (_, v) => (typeof v === "bigint" ? Number(v) : v))));
    } catch (e) {
      console.log(`\n#${i + 1} failed:`, e instanceof Error ? e.message.split("\n")[0] : e);
    }
  }
  await prisma.$disconnect();
  process.exit(0);
})();
