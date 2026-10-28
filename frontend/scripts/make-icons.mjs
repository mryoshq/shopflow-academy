// Renders public/icons/*.png from public/icons/favicon.svg (run once when the logo changes):
//   SHOPFLOW_CHROME_PATH=/path/to/chrome node scripts/make-icons.mjs
// Square variants (apple-touch-icon, maskable) use a full-bleed background: the platform rounds them.
import { readFileSync, writeFileSync } from "node:fs"
import { chromium } from "@playwright/test"

const dir = new URL("../public/icons/", import.meta.url)
const rounded = readFileSync(new URL("favicon.svg", dir), "utf8")
const square = (scale) => rounded
  .replace('<rect width="64" height="64" rx="14" fill="#146457"/>',
    `<rect width="64" height="64" fill="#146457"/>\n  <g transform="translate(32 32) scale(${scale}) translate(-33.5 -34)">`)
  .replace("</svg>", "  </g>\n</svg>")
const outputs = [
  ["icon-32.png", rounded, 32], ["icon-192.png", rounded, 192], ["icon-512.png", rounded, 512],
  ["apple-touch-icon.png", square(0.85), 180], ["icon-maskable-512.png", square(0.62), 512],
]
const browser = await chromium.launch(process.env.SHOPFLOW_CHROME_PATH ? { executablePath: process.env.SHOPFLOW_CHROME_PATH } : {})
const page = await browser.newPage()
for (const [name, svg, size] of outputs) {
  if (name === "apple-touch-icon.png") writeFileSync(new URL("apple-touch-icon.svg", dir), svg)
  if (name === "icon-maskable-512.png") writeFileSync(new URL("icon-maskable.svg", dir), svg)
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent"><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body></html>`)
  await page.locator("img").screenshot({ path: new URL(name, dir).pathname, omitBackground: true })
  console.log(name, size)
}
await browser.close()
