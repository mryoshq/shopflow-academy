import { defineConfig, devices } from "@playwright/test"

// E2E tests run on the test stack only (python3 scripts/test_stack.py up), never on production.
const baseURL = process.env.SHOPFLOW_E2E_BASE_URL ?? "http://127.0.0.1:3180"
const productionHosts = ["shopflow.rapidfox.io", "127.0.0.1:3080", "localhost:3080"]
if (productionHosts.includes(new URL(baseURL).host)) {
  throw new Error(`${baseURL} is the production stack: run E2E tests on the test stack (http://127.0.0.1:3180)`)
}

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "evolutions-locales.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  // Tests share one database (class pause, unlocks): run them one at a time.
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1366, height: 768 },
    baseURL,
    // ADR-0040: the interface follows the browser language; the suites are written in French (the reference).
    // `locale` covers the default context, `--lang` the contexts a test opens itself. english.spec.ts picks English.
    locale: "fr-FR",
    launchOptions: { args: ["--lang=fr-FR"], ...(process.env.SHOPFLOW_CHROME_PATH ? { executablePath: process.env.SHOPFLOW_CHROME_PATH } : {}) },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
})
