import { defineConfig, devices } from "@playwright/test"

// Fully mocked component fixtures: no platform database or external origin is used.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "evolutions-locales.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  webServer: {
    command: "npm run build:e2e:components && npm exec vite -- preview --config vite.evolutions.config.ts",
    url: "http://127.0.0.1:3197/e2e/fixtures/evolutions.html",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3197",
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--lang=fr-FR"],
      ...(process.env.SHOPFLOW_CHROME_PATH ? { executablePath: process.env.SHOPFLOW_CHROME_PATH } : {}),
    },
  },
})
