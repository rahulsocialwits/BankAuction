import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { prisma } from "@/lib/db/prisma";

async function mergeGroup(propertyIds: string[]) {
  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds } },
    orderBy: { createdAt: "asc" },
  });
  if (properties.length < 2) return;

  const primary = properties[0];
  const duplicates = properties.slice(1);

  for (const dup of duplicates) {
    console.log(`Merging "${dup.title}" (${dup.id}) into primary (${primary.id})`);

    await prisma.auction.updateMany({ where: { propertyId: dup.id }, data: { propertyId: primary.id } });
    await prisma.sourceRecord.updateMany({ where: { propertyId: dup.id }, data: { propertyId: primary.id } });
    await prisma.lead.updateMany({ where: { propertyId: dup.id }, data: { propertyId: primary.id } });

    // Documents: relink, skipping any already linked to primary (unique constraint)
    const dupDocs = await prisma.propertyDocument.findMany({ where: { propertyId: dup.id } });
    for (const pd of dupDocs) {
      await prisma.propertyDocument.upsert({
        where: { propertyId_documentId: { propertyId: primary.id, documentId: pd.documentId } },
        update: {},
        create: { propertyId: primary.id, documentId: pd.documentId },
      });
    }

    await prisma.propertyChange.create({
      data: {
        propertyId: primary.id,
        field: "duplicate_merge_cleanup",
        oldValue: dup.id,
        newValue: `Retroactively merged duplicate property "${dup.title}" into this one.`,
      },
    });

    await prisma.property.delete({ where: { id: dup.id } });
  }
}

async function main() {
  // Find exact-title duplicates among published properties (the pattern
  // visible on the live site right now).
  const groups = await prisma.property.groupBy({
    by: ["title"],
    where: { status: "PUBLISHED" },
    _count: true,
    having: { title: { _count: { gt: 1 } } },
  });

  console.log(`Found ${groups.length} duplicate title group(s).`);

  for (const g of groups) {
    const matches = await prisma.property.findMany({ where: { title: g.title }, select: { id: true } });
    await mergeGroup(matches.map((m) => m.id));
  }

  console.log("Done.");
}

main().finally(() => process.exit(0));
