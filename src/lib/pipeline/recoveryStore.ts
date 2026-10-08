/*
 * Prisma edge of automatic recovery (see recovery.ts). Writes only its own run-log rows (kind "recovery", source "<source> · recovery")
 * and, for BankAuctions.in, turns on the EXISTING "Import all" switch. It never hides or removes a listing and never accepts a baseline.
 */

import { prisma } from "@/lib/db/prisma";
import { RECOVERY_KIND, type RecoveryEvent, type RecoveryMechanism, type RecoveryState, type RecoveryStore } from "./recovery";

const sourceOf = (source: string) => `${source} · recovery`;
const STATES: RecoveryState[] = ["QUEUED", "DONE", "FAILED_ATTEMPT", "EXPIRED", "CANCELLED", "EXHAUSTED"];
const toStatus = (s: RecoveryState) => s.toLowerCase();
const fromStatus = (s: string): RecoveryState | null => STATES.find((x) => x.toLowerCase() === s) ?? null;

export const prismaRecoveryStore: RecoveryStore = {
  async events(source) {
    const rows = (await prisma.sourceRunLog.findMany({
      where: { kind: RECOVERY_KIND, source: sourceOf(source) },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: 50,
      select: { id: true, status: true, message: true, startedAt: true },
    })) as unknown as { id: string; status: string; message: string | null; startedAt: Date }[];
    const out: RecoveryEvent[] = [];
    for (const r of rows) {
      const state = fromStatus(r.status);
      if (!state) continue;
      const m = /^\[(import_all|scheduled)\] ?/.exec(r.message ?? "");
      out.push({ id: r.id, state, at: r.startedAt, mechanism: (m?.[1] ?? "scheduled") as RecoveryMechanism, reason: (r.message ?? "").replace(/^\[[a-z_]+\] ?/, "") });
    }
    return out;
  },
  async add(source, event) {
    const row = await prisma.sourceRunLog.create({
      data: {
        source: sourceOf(source),
        kind: RECOVERY_KIND,
        trigger: "schedule",
        status: toStatus(event.state),
        message: `[${event.mechanism}] ${event.reason}`.slice(0, 1000),
        startedAt: event.at,
      },
      select: { id: true },
    });
    return (row as unknown as { id: string }).id;
  },
  async remove(id) {
    await prisma.sourceRunLog.deleteMany({ where: { id, kind: RECOVERY_KIND } });
  },
  async startFullPass(_source, mechanism) {
    if (mechanism !== "import_all") return; // every other source runs its own full passes on its own schedule
    // dynamic import: the adapter imports runLog, which imports this file
    const { builtInImportAll, setBuiltInImportAll } = await import("@/data-sources/bankauctions/adapter");
    if (!(await builtInImportAll())) await setBuiltInImportAll(true);
  },
};
