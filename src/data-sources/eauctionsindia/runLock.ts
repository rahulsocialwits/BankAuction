import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/*
 * One eAuctionsIndia import at a time on one machine (a lock file). A lock older than `staleMs` is treated as left behind by a crashed run and replaced.
 * (In GitHub Actions the workflow's own concurrency group prevents overlapping runs; this covers a person starting the command twice.)
 */
export interface LockInfo { pid: number; at: string }

export function acquireLock(path: string, now: Date = new Date(), staleMs = 2 * 3600_000): { ok: true; release: () => void } | { ok: false; holder: LockInfo } {
  if (existsSync(path)) {
    try {
      const cur = JSON.parse(readFileSync(path, "utf8")) as LockInfo;
      if (now.getTime() - Date.parse(cur.at) < staleMs) return { ok: false, holder: cur };
    } catch { /* unreadable lock: replace it */ }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ pid: process.pid, at: now.toISOString() } satisfies LockInfo));
  return { ok: true, release: () => rmSync(path, { force: true }) };
}
