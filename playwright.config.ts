import { defineConfig, devices } from "@playwright/test";

// E2E runs against a real deployment (Supabase + Edge Functions + Claude):
//   E2E_BASE_URL=https://bookflow-ai.vercel.app E2E_PASSWORD=... npm run e2e
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    locale: "es-CO",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
