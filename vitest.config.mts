import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": here("./src"),
      // `server-only` throws outside React Server Components; tests run in plain Node.
      "server-only": here("./tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: process.env.RUN_LIVE ? [] : ["tests/**/*.live.test.ts"],
  },
});
