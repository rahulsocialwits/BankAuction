"use server";

import { prisma } from "@/lib/db/prisma";
import { readAdminSession } from "@/lib/auth/adminAuth";

export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string;
  note?: string | Record<string, unknown>;
}

/**
 * Write one append-only audit log entry. Fails silently so an audit failure
 * never blocks the actual admin operation.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const session = await readAdminSession().catch(() => null);
    await prisma.auditLog.create({
      data: {
        actorId: session?.adminId ?? null,
        actorEmail: null,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        note: entry.note ? (typeof entry.note === "string" ? entry.note : JSON.stringify(entry.note)) : null,
      },
    });
  } catch {
    // audit failures must not block the operation
  }
}
