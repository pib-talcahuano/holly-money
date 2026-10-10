import { defineConfig } from "@playwright/test"

// Local-only. Never run in CI: there's no seeded Supabase instance or running
// dev server there, and the purpose of this suite is functional coverage +
// design-reference screenshots (docs/screenshots/), not a CI regression gate.
// Run with: pnpm test:e2e (see package.json). Requires `pnpm supabase db reset`
// (loads supabase/seed.sql — see e2e/fixtures/users.ts for credentials) and
// `pnpm dev` running separately.
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  }
})
