import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Signal to next.config.ts that this is a Cloudflare Workers build so that
// outputFileTracingIncludes omits playwright-core / @sparticuz/chromium.
// Those packages cannot run in Workers (no native binary support), and including
// them in the file trace causes OpenNext's esbuild step to copy playwright-core
// into the bundle directory, where it then follows its chromium-bidi dependency
// (not installed) and fails. This env var is inherited by the next build child process.
process.env["CF_OPENNEXT_BUILD"] = "1";

// Minimal Cloudflare Workers configuration.
// Browser rendering (playwright-core / @sparticuz/chromium) is not available inside Workers;
// those code paths are guarded with try/catch and fail gracefully with UNAVAILABLE.
export default defineCloudflareConfig();
