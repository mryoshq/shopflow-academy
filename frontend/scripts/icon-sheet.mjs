// Review sheet of the derived icons (16/32 px readability, light and dark): node scripts/icon-sheet.mjs <out-dir>
import { readFileSync } from "node:fs"
import { chromium } from "@playwright/test"
const out = process.argv[2]
const u = (f) => "data:" + (f.endsWith(".svg") ? "image/svg+xml" : "image/png") + ";base64," + readFileSync(new URL("../public/icons/" + f, import.meta.url)).toString("base64")
const b = await chromium.launch({ executablePath: process.env.SHOPFLOW_CHROME_PATH })
for (const scheme of ["light", "dark"]) {
  const p = await b.newPage({ viewport: { width: 1100, height: 760 } })
  await p.emulateMedia({ colorScheme: scheme })
  const bg = scheme === "dark" ? "#0D1513" : "#F7F4EE", header = scheme === "dark" ? "#151F1D" : "#FFFFFF", fg = scheme === "dark" ? "#E8EEEC" : "#14211F"
  const cell = (label, html) => `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;font-size:12px">${html}<span>${label}</span></div>`
  await p.setContent(`<body style="margin:0;padding:24px;background:${bg};color:${fg};font-family:system-ui,sans-serif">
  <h3 style="margin:0 0 12px">Thème ${scheme === "dark" ? "sombre" : "clair"} — favicon (SVG suit le thème), PNG 16/32 (taille réelle et x8 pixelisé)</h3>
  <div style="display:flex;gap:28px;align-items:end;margin-bottom:20px">
   ${cell("SVG 16", `<img src="${u("favicon.svg")}" width=16 height=16>`)}${cell("SVG 32", `<img src="${u("favicon.svg")}" width=32 height=32>`)}
   ${cell("SVG 16 x8", `<img src="${u("favicon.svg")}" width=16 height=16 style="transform:scale(8);transform-origin:bottom center;image-rendering:pixelated;margin:0 56px">`)}
   ${cell("PNG 16 x8", `<img src="${u("favicon-16.png")}" width=128 height=128 style="image-rendering:pixelated">`)}
   ${cell("PNG 32 x4", `<img src="${u("icon-32.png")}" width=128 height=128 style="image-rendering:pixelated">`)}
   ${cell("onglet", `<div style="display:flex;gap:6px;align-items:center;background:${header};padding:6px 10px;border-radius:8px 8px 0 0"><img src="${u("favicon.svg")}" width=16 height=16><span>Rapidfox Academy</span></div>`)}
  </div>
  <div style="display:flex;gap:28px;align-items:end;margin-bottom:20px">
   ${cell("icon-192", `<img src="${u("icon-192.png")}" width=120>`)}${cell("icon-512", `<img src="${u("icon-512.png")}" width=120>`)}
   ${cell("apple-touch 180 (coins iOS)", `<img src="${u("apple-touch-icon.png")}" width=120 style="border-radius:27px">`)}
   ${cell("masquable (cercle 80 %)", `<div style="position:relative;width:120px;height:120px"><img src="${u("icon-maskable-512.png")}" width=120 style="border-radius:50%"><div style="position:absolute;inset:12px;border:1px dashed #F2B84B;border-radius:50%"></div></div>`)}
   ${cell("logo en-tête", `<div style="display:flex;gap:10px;align-items:center;background:${header};padding:10px 14px;border-radius:8px"><img src="${u(scheme === "dark" ? "logo-dark.png" : "logo-light.png")}" width=32><b>ShopFlow <span style="color:${scheme === "dark" ? "#6FB8A8" : "#146457"}">Academy</span></b></div>`)}
   ${cell("logo connexion", `<img src="${u(scheme === "dark" ? "logo-dark.png" : "logo-light.png")}" width=56>`)}
  </div>
  <img src="${u("share-1200x630.png")}" width=600 style="border:1px solid #888">
  </body>`)
  await p.waitForTimeout(300)
  await p.screenshot({ path: `${out}/sheet-${scheme}.png`, fullPage: true })
}
await b.close()
