import type { NextConfig } from "next";

// The JavaScript render fallback of the crawler (src/data-sources/feeds/render.ts) starts a headless Chromium on the SERVER only:
// playwright-core drives @sparticuz/chromium (a Chromium build for AWS Lambda / Vercel). Both are loaded with a run-time import
// (never bundled, never sent to the browser), so the build cannot see them: they are listed here so that they are copied into
// the serverless functions that run the crawler (the scheduler tick, the cron route, the admin pages whose buttons start a run).
const BROWSER_FILES = ["./node_modules/@sparticuz/chromium/**/*", "./node_modules/playwright-core/**/*"];

const nextConfig: NextConfig = {
  experimental: {
    // Master-admin image uploads (home hero etc.) go through server actions; the default limit is 1 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  outputFileTracingIncludes: {
    "/api/cron/*": BROWSER_FILES,
    "/api/me": BROWSER_FILES,
    "/admin/*": BROWSER_FILES,
  },
};

export default nextConfig;
