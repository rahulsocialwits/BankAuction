import { prisma } from "@/lib/db/prisma";

/** PropertyChange.field used for every automatic "treated as the same property" decision. */
export const MERGE_FIELD = "dedup_merge";

/**
 * Writes one PropertyChange row saying why a listing was matched to an existing property, or why a property was hidden as a
 * duplicate (oldValue = what it was before, so it can be put back; newValue = "[merge:<rule>] <source>: <detail>").
 * The same note is never written twice for the same property (re-reads of a listing repeat the same decision).
 * Never throws: history must not break an import.
 */
export async function recordMerge(propertyId: string, oldValue: string, note: string): Promise<void> {
  try {
    const seen = await prisma.propertyChange.findFirst({ where: { propertyId, field: MERGE_FIELD, newValue: note }, select: { id: true } });
    if (!seen) await prisma.propertyChange.create({ data: { propertyId, field: MERGE_FIELD, oldValue, newValue: note } });
  } catch {
    /* ignore */
  }
}
