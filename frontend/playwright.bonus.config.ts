import { defineConfig } from "@playwright/test"
import base from "./playwright.evolutions.config"

// API fixtures only, isolated from both shared test and production ports.
export default defineConfig({
  ...base,
  testMatch: "bonus-blocks.spec.ts",
  webServer: {
    command: "npm run build:e2e:components && npm exec vite -- preview --config vite.evolutions.config.ts --port 3201",
    url: "http://127.0.0.1:3201/e2e/fixtures/evolutions.html",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: { ...base.use, baseURL: "http://127.0.0.1:3201" },
})
