import { readFileSync } from "node:fs"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// Build real components with the gateway CSP; this fixture never enters the application build.
const gateway = readFileSync(new URL("../gateway/nginx.conf", import.meta.url), "utf8")
const csp = /add_header Content-Security-Policy "([^"]+)" always;/.exec(gateway)![1]
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist-evolutions", emptyOutDir: true, rollupOptions: { input: {
    evolutions: "e2e/fixtures/evolutions.html",
    features: "e2e/fixtures/features.html",
  } } },
  preview: { host: "127.0.0.1", port: 3197, strictPort: true, headers: { "Content-Security-Policy": csp } },
})
