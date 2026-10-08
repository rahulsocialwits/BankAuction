/** Late-tick detection (pure). "Successful" means a scheduler tick row with status ok; a tick that threw does not count. */

export const LATE_AFTER_MIN = 60;

export interface SchedulerHealth {
  state: "ok" | "late" | "never";
  late: boolean;
  /** minutes since the last successful tick; null when there has been none */
  ageMin: number | null;
}

export function schedulerHealth(lastOk: { startedAt: Date; status: string } | null, now: Date = new Date()): SchedulerHealth {
  if (!lastOk || lastOk.status !== "ok") return { state: "never", late: true, ageMin: null };
  const ageMin = Math.round((now.getTime() - lastOk.startedAt.getTime()) / 60_000);
  const late = ageMin > LATE_AFTER_MIN;
  return { state: late ? "late" : "ok", late, ageMin };
}
