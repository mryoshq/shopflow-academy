import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1366, height: 768 },
    baseURL: process.env.SHOPFLOW_E2E_BASE_URL ?? "http://127.0.0.1:3080",
    launchOptions: process.env.SHOPFLOW_CHROME_PATH ? { executablePath: process.env.SHOPFLOW_CHROME_PATH } : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
})
