import { defineConfig } from "@playwright/test"
import base from "./playwright.evolutions.config"

export default defineConfig({
  ...base,
  testMatch: "import-guard.local.ts",
  webServer: {
    command: "npm run build:e2e:components && npm exec vite -- preview --config vite.evolutions.config.ts --port 3204",
    url: "http://127.0.0.1:3204/e2e/fixtures/evolutions.html",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: { ...base.use, baseURL: "http://127.0.0.1:3204" },
})
