import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e", testMatch: "rafi-recap.local.ts", workers: 1,
  webServer: {
    command: "npm run build && npm exec vite -- preview --host 127.0.0.1 --port 3203 --strictPort",
    url: "http://127.0.0.1:3203/", reuseExistingServer: false, timeout: 120_000,
  },
  use: {
    ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3203", locale: "fr-FR", reducedMotion: "reduce",
    launchOptions: { ...(process.env.SHOPFLOW_CHROME_PATH ? { executablePath: process.env.SHOPFLOW_CHROME_PATH } : {}) },
  },
})
