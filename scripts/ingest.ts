import { runBankAuctionsIngestion } from "@/data-sources/bankauctions/adapter";

const ADAPTERS: Record<string, (limit: number) => Promise<unknown>> = {
  bankauctions: (limit) => runBankAuctionsIngestion({ limit, triggeredBy: "manual" }),
};

async function main() {
  const [sourceKey, limitArg] = process.argv.slice(2);
  if (!sourceKey || !ADAPTERS[sourceKey]) {
    console.error(`Usage: tsx scripts/ingest.ts <${Object.keys(ADAPTERS).join("|")}> [limit]`);
    process.exit(1);
  }
  const limit = limitArg ? parseInt(limitArg, 10) : 5;
  const summary = await ADAPTERS[sourceKey](limit);
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
