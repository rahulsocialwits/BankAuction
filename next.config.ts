import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

// The JavaScript render fallback of the crawler (src/data-sources/feeds/render.ts) starts a headless Chromium on the SERVER only:
// playwright-core drives @sparticuz/chromium (a Chromium build for AWS Lambda / Vercel). Both are server-external packages: they
// are loaded from node_modules at run time (never bundled, never sent to the browser). The build copies an external package into a
// serverless function only if it can trace it, and it does NOT follow their own dependencies (for example tar-fs of
// @sparticuz/chromium, which unpacks the browser) nor the browser binary files. So the packages are listed here WITH every
// dependency they need, for the functions that run the crawler (scheduler tick, cron route, admin pages whose buttons start a run).
function withDependencies(roots: string[]): string[] {
  const seen = new Set<string>();
  const walk = (name: string) => {
    if (seen.has(name)) return;
    const pkg = join(process.cwd(), "node_modules", name, "package.json");
    if (!existsSync(pkg)) return;
    seen.add(name);
    try {
      const j = JSON.parse(readFileSync(pkg, "utf8")) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
      for (const dep of Object.keys({ ...j.dependencies, ...j.optionalDependencies })) walk(dep);
    } catch {
      /* unreadable package.json: that package is still listed */
    }
  };
  roots.forEach(walk);
  return [...seen].map((n) => `./node_modules/${n}/**/*`);
}

const BROWSER_FILES = withDependencies(["@sparticuz/chromium", "playwright-core"]);

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
