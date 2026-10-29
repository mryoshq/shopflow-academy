// Derived logos and icons from the owner's logos (docs/design/shopflow-logo-source.png and its green
// variant docs/design/shopflow-logo-vert.png, rules in docs/design/README.md). The fox drawing is never
// changed: only resized, cropped, made transparent around it (light logo) or, for 16/32 px, traced head
// (public/icons/favicon.svg). The green variant serves the dark theme and the full-bleed icons.
//   SHOPFLOW_CHROME_PATH=/path/to/chrome node scripts/make-icons.mjs
import { readFileSync } from "node:fs"
import { chromium } from "@playwright/test"

const dir = new URL("../public/icons/", import.meta.url)
const source = "data:image/png;base64," + readFileSync(new URL("../../docs/design/shopflow-logo-source.png", import.meta.url)).toString("base64")
const faviconSvg = readFileSync(new URL("favicon.svg", dir), "utf8")
// ADR-0035: the dark theme and the full-bleed icons use the clay variant (scripts/recolor-logo.py, same drawing).
const green = "data:image/png;base64," + readFileSync(new URL("../../docs/design/shopflow-logo-terre-cuite.png", import.meta.url)).toString("base64")
const favicon = "data:image/svg+xml;base64," + Buffer.from(faviconSvg).toString("base64")
// 16 px: even thicker strokes, and the inner ear line (the finest detail) left out.
const favicon16 = "data:image/svg+xml;base64," + Buffer.from(faviconSvg.replace("stroke-width: 84", "stroke-width: 98")
  .replace("M883 350L830 864", "")).toString("base64")
const SAND = [246, 241, 235], GREEN = [22, 99, 89], SAFFRON = [136, 84, 26]

const browser = await chromium.launch(process.env.SHOPFLOW_CHROME_PATH ? { executablePath: process.env.SHOPFLOW_CHROME_PATH } : {})
const page = await browser.newPage()
await page.setContent("<body style='margin:0;background:transparent'></body>")

/** Draws the source, the green variant or the favicon into a size×size canvas; returns a PNG data URL. */
async function render(options) {
  return page.evaluate(async ({ source, green, favicon, favicon16, SAND, GREEN, SAFFRON, o }) => {
    const img = new Image(); img.src = o.favicon ? (o.size <= 16 ? favicon16 : favicon) : o.green ? green : source; await img.decode()
    // Downscale in halves for a clean result.
    // The traced favicon is drawn straight at its size (crisp vector rasterisation).
    let canvas = document.createElement("canvas"), width = o.favicon ? o.size : img.width
    canvas.width = canvas.height = width
    let g = canvas.getContext("2d"); g.drawImage(img, 0, 0, width, width)
    const target = Math.round(o.size * (o.scale ?? 1))
    while (width / 2 >= target) {
      const next = document.createElement("canvas"); next.width = next.height = width / 2
      const ng = next.getContext("2d"); ng.imageSmoothingQuality = "high"; ng.drawImage(canvas, 0, 0, width / 2, width / 2)
      canvas = next; width /= 2
    }
    const out = document.createElement("canvas"); out.width = out.height = o.size
    const og = out.getContext("2d")
    if (o.background) { og.fillStyle = o.background; og.fillRect(0, 0, o.size, o.size) }
    og.imageSmoothingQuality = "high"
    const offset = (o.size - target) / 2
    if (o.circle) { og.beginPath(); og.arc(o.size / 2, o.size / 2, o.size / 2, 0, 2 * Math.PI); og.clip() }
    og.drawImage(canvas, offset, offset, target, target)
    if (o.recolor) {
      // Each pixel = mix of sand, green and saffron (least squares in RGB): sand becomes transparent,
      // green and saffron stay. Shapes are untouched.
      const data = og.getImageData(0, 0, o.size, o.size); const d = data.data
      const u = GREEN.map((v, i) => v - SAND[i]), v = SAFFRON.map((x, i) => x - SAND[i])
      const uu = u.reduce((s, x, i) => s + x * u[i], 0), vv = v.reduce((s, x, i) => s + x * v[i], 0), uv = u.reduce((s, x, i) => s + x * v[i], 0)
      const det = uu * vv - uv * uv
      const outline = GREEN
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue
        const c = [d[i] - SAND[0], d[i + 1] - SAND[1], d[i + 2] - SAND[2]]
        const cu = c.reduce((s, x, k) => s + x * u[k], 0), cv = c.reduce((s, x, k) => s + x * v[k], 0)
        let a = (cu * vv - cv * uv) / det, b = (cv * uu - cu * uv) / det
        a = Math.max(0, a); b = Math.max(0, b); const sum = a + b
        if (sum > 1) { a /= sum; b /= sum }
        const alpha = Math.min(1, a + b)
        // The source background carries a faint paper texture: anything below 12 % coverage is background.
        if (alpha < 0.12) { d[i + 3] = 0; continue }
        for (let k = 0; k < 3; k++) d[i + k] = Math.round((a * outline[k] + b * SAFFRON[k]) / (a + b))
        d[i + 3] = Math.round(alpha * d[i + 3])
      }
      og.putImageData(data, 0, 0)
    }
    return out.toDataURL("image/png")
  }, { source, green, favicon, favicon16, SAND, GREEN, SAFFRON, o: options })
}

async function save(name, dataUrl) {
  const { writeFileSync } = await import("node:fs")
  writeFileSync(new URL(name, dir), Buffer.from(dataUrl.split(",")[1], "base64"))
  console.log(name)
}

const sand = "#F6F1EB"
await save("favicon-16.png", await render({ favicon: true, size: 16 }))
await save("icon-32.png", await render({ favicon: true, size: 32 }))
// Full-bleed icons (PWA, Apple, maskable): the green variant as drawn by the owner. Its rings and dots
// reach 75 % of the half-width, so the maskable icon keeps it at full size inside the 80 % safe circle.
await save("icon-192.png", await render({ size: 192, green: true }))
await save("icon-512.png", await render({ size: 512, green: true }))
await save("apple-touch-icon.png", await render({ size: 180, green: true }))
await save("icon-maskable-512.png", await render({ size: 512, green: true }))
// Header and login: transparent full logo in the light theme, green variant as a round badge in the dark
// theme (cropped to a disc whose radius is 82 % of the source half-width, around the dots).
await save("logo-light.png", await render({ size: 256, recolor: "light" }))
await save("logo-dark.png", await render({ size: 256, green: true, scale: 1 / 0.82, circle: true }))

// Share image 1200×630: full logo and the name in text.
const logo = await render({ size: 512, recolor: "light" })
await page.setViewportSize({ width: 1200, height: 630 })
await page.setContent(`<html><body style="margin:0;width:1200px;height:630px;background:#FAF9F5;display:flex;align-items:center;gap:56px;padding:0 80px;box-sizing:border-box;font-family:'Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif;color:#141413">
  <img src="${logo}" width="420" height="420" alt="">
  <div><div style="font-size:72px;font-weight:700;letter-spacing:-0.01em;line-height:1.05">ShopFlow<br><span style="color:#9C4426">Academy</span></div>
  <div style="margin-top:24px;font-size:30px;color:#5E5D59">Python Data Engineering &amp; SQL avancé</div>
  <div style="margin-top:28px;height:10px;width:160px;border-radius:5px;background:#B5532F"></div></div></body></html>`)
await page.screenshot({ path: new URL("share-1200x630.png", dir).pathname })
console.log("share-1200x630.png")
await browser.close()
