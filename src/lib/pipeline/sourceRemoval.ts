import { prisma } from "@/lib/db/prisma";
import { getSourceProtection } from "./runLog";
import {
  removeListingIfSourceTrusted,
  sourceNameFromStatusSource,
  type RemovalOutcome,
  type RemovalRequest,
  type RemovalStore,
} from "./sourceProtection";

/** Prisma-backed store: hides a listing (status REMOVED, never deleted) and records why in PropertyChange. */
const prismaRemovalStore: RemovalStore = {
  async hide(req) {
    await prisma.property.update({ where: { id: req.propertyId }, data: { status: "REMOVED" } });
    await prisma.propertyChange
      .create({ data: { propertyId: req.propertyId, field: req.field, oldValue: req.oldValue ?? "PUBLISHED", newValue: req.reason } })
      .catch(() => undefined);
  },
};

/**
 * Source-driven removal of an existing listing, guarded by the source's data health.
 * Every automatic path that hides a listing because of what a source returned MUST use this function.
 * (tests/sourceProtection.test.ts fails if thinFix.ts or csvImport.ts write status REMOVED directly again.)
 */
export async function removeListingFromSource(statusSource: string | null | undefined, request: RemovalRequest): Promise<RemovalOutcome> {
  const name = sourceNameFromStatusSource(statusSource);
  // A listing with no identifiable source has no run history to judge: behave as before (no verdict, no protection).
  const protection = name ? await getSourceProtection(name) : { protected: false, status: null, reason: "No source name.", evaluatedAt: null, basis: "none" as const };
  return removeListingIfSourceTrusted(prismaRemovalStore, protection, request);
}
