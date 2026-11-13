import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Checkpoint, Store } from "./sliceCrawl";

/** File-backed staging store for the Maharashtra crawler: <out> (listings), <out>.pages.jsonl, <out>.details.jsonl, <out>.checkpoint.json. Append-only. */
export function fileStore(out: string): Store {
  const cpPath = `${out}.checkpoint.json`;
  const ensure = (p: string) => mkdirSync(dirname(p), { recursive: true });
  const appendLines = (p: string, rows: unknown[]) => { ensure(p); appendFileSync(p, rows.map((r) => JSON.stringify(r)).join("\n") + "\n"); };
  return {
    loadCheckpoint: async () => (existsSync(cpPath) ? (JSON.parse(readFileSync(cpPath, "utf8")) as Checkpoint) : null),
    saveCheckpoint: async (c) => { ensure(cpPath); writeFileSync(cpPath, JSON.stringify(c, null, 1)); },
    stagedIds: async () => new Set(existsSync(out) ? readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => (JSON.parse(l) as { key: string }).key) : []),
    appendListings: async (rows) => appendLines(out, rows),
    appendPage: async (p) => appendLines(`${out}.pages.jsonl`, [p]),
    appendDetail: async (d) => appendLines(`${out}.details.jsonl`, [d]),
  };
}

/** Reads a JSONL file into objects (blank or broken lines are skipped and counted). */
export function readJsonl<T>(path: string): { rows: T[]; broken: number } {
  if (!existsSync(path)) return { rows: [], broken: 0 };
  const rows: T[] = [];
  let broken = 0;
  for (const l of readFileSync(path, "utf8").split("\n")) {
    if (!l.trim()) continue;
    try { rows.push(JSON.parse(l) as T); } catch { broken++; }
  }
  return { rows, broken };
}
