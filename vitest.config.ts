import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "supabase/functions/**/*.test.ts",
      "supabase/tests/**/*.test.ts",
      "apps/web/src/**/*.test.ts",
    ],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
