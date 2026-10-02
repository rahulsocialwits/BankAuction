"use server";

import { requireMaster } from "@/lib/auth/adminAuth";
import { runDemo } from "@/lib/scrapDemo/run";
import type { DemoResult, DemoSourceType } from "@/lib/scrapDemo/types";

export interface DemoState {
  result: DemoResult | null;
}

/** Runs one demo workflow in memory and returns what it found. It never writes to the database. */
export async function runScrapDemo(_prev: DemoState, formData: FormData): Promise<DemoState> {
  await requireMaster();
  const type = (["sample", "url", "paste"] as const).includes(String(formData.get("type")) as DemoSourceType) ? (String(formData.get("type")) as DemoSourceType) : "sample";
  const result = await runDemo({
    name: String(formData.get("name") ?? "").trim().slice(0, 80),
    type,
    url: String(formData.get("url") ?? "").trim().slice(0, 500),
    pasted: String(formData.get("pasted") ?? ""),
    mock: formData.get("mock") === "on",
  });
  return { result };
}
