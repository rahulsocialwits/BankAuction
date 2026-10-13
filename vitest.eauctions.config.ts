import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    include: ["tests/eauctionsSliceCrawl.test.ts", "tests/eauctionsVitestAlias.test.ts"],
    environment: "node",
    clearMocks: true,
  },
});
