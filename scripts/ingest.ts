import { config } from "dotenv";
// tsx doesn't auto-load .env.local the way Next.js does; without this the
// AI_API_KEY/AI_BASE_URL vars are silently missing for local/manual runs.
config({ path: ".env.local" });
config({ path: ".env" });

import { runBankAuctionsIngestion } from "@/data-sources/bankauctions/adapter";
import { runAllFeeds } from "@/data-sources/feeds/run";
import { logRun } from "@/lib/pipeline/runLog";

const ADAPTERS: Record<string, (limit: number) => Promise<unknown>> = {
  bankauctions: async (limit) => ({
    main: await runBankAuctionsIngestion({ limit, triggeredBy: process.env.GITHUB_ACTIONS ? process.env.GITHUB_EVENT_NAME ?? "schedule" : "manual" }),
    feeds: await runAllFeeds(),
  }),
  feeds: () => runAllFeeds(),
};

async function main() {
  const [sourceKey, limitArg] = process.argv.slice(2);
  if (!sourceKey || !ADAPTERS[sourceKey]) {
    console.error(`Usage: tsx scripts/ingest.ts <${Object.keys(ADAPTERS).join("|")}> [limit]`);
    process.exit(1);
  }
  const limit = limitArg ? parseInt(limitArg, 10) : 250;
  const startedAt = new Date();
  const summary = await ADAPTERS[sourceKey](limit);
  await logRun({
    source: "Scheduler tick",
    kind: "cron",
    trigger: process.env.GITHUB_ACTIONS ? "cron" : "manual",
    status: "ok",
    message: `via ${process.env.GITHUB_ACTIONS ? "GitHub Actions" : "command line"} (${sourceKey})`,
    startedAt,
  });
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
