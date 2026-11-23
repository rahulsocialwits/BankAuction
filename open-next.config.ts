import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal Cloudflare Workers configuration.
// Browser rendering (playwright-core / @sparticuz/chromium) is not available inside Workers;
// those code paths are guarded with try/catch and fail gracefully with UNAVAILABLE.
export default defineCloudflareConfig();
