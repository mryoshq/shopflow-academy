// ADR-0044: turns the owner's stylesheet of the CampusEquip experience (src/campusequip/source/style.css, kept as
// delivered) into src/campusequip/campusequip.css for the Academy, like the former scripts/voyage-css.mjs (ADR-0033):
//   - one theme with the Academy: the experience's accent (teal, deep, mint) becomes the Academy accent
//     (green in light, terracotta in dark), through the brand tokens;
//   - every rule is scoped under .campusequip-root (no class of the experience leaks into the rest of the site);
//   - each colour becomes a variable with a light value (the owner's) and a dark value (html.dark);
//   - text colours get their own variables, adjusted until they reach 4.6:1 (WCAG AA) on the experience's
//     tinted backgrounds in both themes (the delivered palette was below AA for small labels);
//   - the web fonts are dropped (no network call): the Academy fonts are used;
//   - keyframes are prefixed; the player bar is sticky inside the page instead of fixed to the window.
// Run: node scripts/campusequip-css.mjs   (then commit src/campusequip/campusequip.css)
import { readFileSync, writeFileSync } from "node:fs"
import postcss from "postcss"

const SOURCE = new URL("../src/campusequip/source/style.css", import.meta.url)
const TARGET = new URL("../src/campusequip/campusequip.css", import.meta.url)
const ROOT = ".campusequip-root"
// Owner's accent → Academy accent (semantic tokens: they already change with the theme). [background, text]
const ACCENT = {
  "#176e64": ["var(--chakra-colors-brand-solid)", "var(--chakra-colors-brand-fg)"],
  "#124e49": ["var(--chakra-colors-brand-solid)", "var(--chakra-colors-brand-fg)"],
  "#e6eee5": ["var(--chakra-colors-brand-subtle)", "var(--chakra-colors-brand-fg)"],
  "#d1e5cf": ["var(--chakra-colors-brand-muted)", "var(--chakra-colors-brand-fg)"],
}

function parseHex(hex) {
  let h = hex.slice(1)
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("")
  const n = (i) => parseInt(h.slice(i, i + 2), 16)
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 }
}

function toHsl({ r, g, b }) {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return { h: h * 60, s, l }
}

function luminance({ r, g, b }) {
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }

function fromHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) }
}
const hex2 = (n) => n.toString(16).padStart(2, "0")
const toHex = ({ r, g, b }) => `#${hex2(r)}${hex2(g)}${hex2(b)}`

/** Moves the lightness of a text colour away from the reference background until the contrast is reached. */
function readable(color, background, darker, target = 4.6) {
  const { h, s, l } = toHsl(color)
  let L = l, out = color
  while (contrast(out, background) < target && L > 0 && L < 1) { L = darker ? L - 0.01 : L + 0.01; out = fromHsl(h, s, Math.min(1, Math.max(0, L))) }
  return out
}

/** Dark value: lightness mirrored (paper becomes night, ink becomes light), hue kept, saturation softened. */
function darkOf(hex) {
  const color = parseHex(hex)
  const { h, s, l } = toHsl(color)
  const L = Math.min(0.94, Math.max(0.07, 1 - l))
  const S = s * (l > 0.85 ? 0.35 : 0.8)
  const alpha = color.a < 1 ? ` / ${Math.round(color.a * 100) / 100}` : ""
  return `hsl(${Math.round(h)} ${Math.round(S * 100)}% ${Math.round(L * 100)}%${alpha})`
}

const colours = new Map()
const texts = new Map()
const backgrounds = new Set()
function variable(hex, prop) {
  const key = hex.toLowerCase()
  if (prop === "color") {
    if (!texts.has(key)) texts.set(key, `--vt-${key.slice(1)}`)
    return `var(${texts.get(key)})`
  }
  // Owner's custom properties (--paper, --soft…) also paint backgrounds.
  if (/^background/.test(prop) || prop.startsWith("--")) backgrounds.add(key)
  if (!colours.has(key)) colours.set(key, `--vc-${key.slice(1)}`)
  return `var(${colours.get(key)})`
}

const FONTS = [
  [/Georgia,\s*'Times New Roman',\s*serif|Georgia,\s*serif/g, "var(--chakra-fonts-heading)"],
  [/'Avenir Next',\s*Arial,\s*sans-serif/g, "var(--chakra-fonts-body)"],
  [/ui-monospace,\s*monospace/g, "var(--chakra-fonts-mono)"],
]

function scope(selector) {
  if (selector === ":root") return ROOT
  if (selector === "*") return `${ROOT} *`
  if (selector === "body") return ROOT
  return `${ROOT} ${selector}`
}

const root = postcss.parse(readFileSync(SOURCE, "utf8"))
const keyframes = new Set()
root.walkAtRules("import", (rule) => rule.remove())
root.walkAtRules("keyframes", (rule) => { keyframes.add(rule.params); rule.params = `campusequip-${rule.params}` })
root.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && rule.parent.name === "keyframes") return
  rule.selectors = rule.selectors.map(scope)
})
// Owner's colour custom properties (--muted: #7b827b…): text uses them through a readable twin (--muted-text).
const customColours = new Map()
root.walkDecls((decl) => { if (decl.prop.startsWith("--") && /^#[0-9a-f]{3,8}$/i.test(decl.value.trim())) customColours.set(decl.prop, decl.value.trim()) })
// White text on the accent stays white (brand.contrast) in both themes: the accent is solid in both.
const WHITE = /^(#fff|#ffffff|white)$/i
root.walkRules((rule) => {
  const background = rule.nodes.find((d) => d.type === "decl" && /^background(-color)?$/.test(d.prop))
  const accent = background && Object.keys(ACCENT).slice(0, 2).some((hex) => background.value.toLowerCase().includes(hex)) ||
    background && /var\(--(teal|deep)\)/.test(background.value)
  if (!accent) return
  rule.walkDecls("color", (decl) => { if (WHITE.test(decl.value.trim())) decl.value = "var(--chakra-colors-brand-contrast)" })
})
// Decorative watermark (the big step number, hidden from assistive technologies): kept pale on purpose.
const DECORATIVE = new Set([`${ROOT} .chapter-stamp`])
root.walkDecls((decl) => {
  let value = decl.value
  if (decl.prop === "color" && decl.parent?.selectors?.some((sel) => DECORATIVE.has(sel))) {
    decl.value = value.replace(/#[0-9a-f]{3,8}\b/gi, (hex) => variable(hex, "border-color"))
    return
  }
  if (decl.prop === "color") value = value.replace(/var\((--[a-z-]+)\)/gi, (whole, name) => customColours.has(name) ? `var(${name}-text)` : whole)
  for (const [pattern, replacement] of FONTS) value = value.replace(pattern, replacement)
  if (/^animation(-name)?$/.test(decl.prop)) value = value.replace(/[a-z-]+/gi, (word) => keyframes.has(word) ? `campusequip-${word}` : word)
  value = value.replace(/#[0-9a-f]{3,8}\b/gi, (hex) => [4, 5, 7, 9].includes(hex.length) ? variable(hex, decl.prop) : hex)
  decl.value = value
})
// The player follows the page (inside the Academy shell) instead of covering the window.
root.walkRules(`${ROOT} .player`, (rule) => rule.walkDecls("position", (decl) => { if (decl.value === "fixed") { decl.value = "sticky" } }))
// With a sticky player, the room the owner kept for a fixed bar is no longer needed.
root.walkRules(`${ROOT} .app`, (rule) => rule.walkDecls("padding-bottom", (decl) => { decl.value = "0" }))

// Reference backgrounds: the darkest of the light backgrounds (light theme) and the lightest of their dark
// counterparts (dark theme). Light text (white on a green button) is checked against the darkest backgrounds.
const opaque = [...backgrounds].map(parseHex).filter((c) => c.a === 1)
const lightBgs = opaque.filter((c) => luminance(c) > 0.5)
const darkBgs = opaque.filter((c) => luminance(c) <= 0.5)
const byLum = (list) => [...list].sort((a, b) => luminance(a) - luminance(b))
const cssToRgb = (value) => { const [h, s, l] = value.match(/[\d.]+/g).map(Number); return fromHsl(h, s / 100, l / 100) }
const lightRef = byLum(lightBgs)[0], darkRef = byLum(darkBgs).at(-1)
const darkLightRef = byLum(lightBgs.map((c) => cssToRgb(darkOf(toHex(c))))).at(-1)
const darkDarkRef = byLum(darkBgs.map((c) => cssToRgb(darkOf(toHex(c)))))[0]
function textLight(hex) {
  const c = parseHex(hex)
  return toHex(luminance(c) > 0.5 ? readable(c, darkRef, false) : readable(c, lightRef, true))
}
function textDark(hex) {
  // The role comes from the owner's theme: text dark on light there is light on dark here, and vice versa.
  const c = cssToRgb(darkOf(hex))
  return toHex(luminance(parseHex(hex)) > 0.5 ? readable(c, darkDarkRef, true) : readable(c, darkLightRef, false))
}
for (const [name, hex] of customColours) variable(hex, "color")
const twins = [...customColours].map(([name, hex]) => `${name}-text:var(${texts.get(hex.toLowerCase())})`).join(";")
// Solid backgrounds under white text that keep their colour in both themes (white on it stays AA).
const FIXED = { "#906542": "#906542" }
const bg = (hex, value) => ACCENT[hex] ? ACCENT[hex][0] : FIXED[hex] ?? value
const fg = (hex, value) => ACCENT[hex] ? ACCENT[hex][1] : value
const light = [twins, ...[...colours].map(([hex, name]) => `${name}:${bg(hex, hex)}`), ...[...texts].map(([hex, name]) => `${name}:${fg(hex, textLight(hex))}`)].join(";")
const dark = [...[...colours].map(([hex, name]) => `${name}:${bg(hex, darkOf(hex))}`), ...[...texts].map(([hex, name]) => `${name}:${fg(hex, textDark(hex))}`)].join(";")
const header = "/* Generated by scripts/campusequip-css.mjs from src/campusequip/source/style.css (owner's file). Do not edit by hand. */\n"
const palette = `${ROOT}{${light}}\nhtml.dark ${ROOT}{${dark};color-scheme:dark}\n`
// The big step number is decorative (aria-hidden): drawn as generated content, out of the text checks.
const extra = `${ROOT} .chapter-stamp>span::before{content:attr(data-step)}`
writeFileSync(TARGET, header + palette + root.toString() + "\n" + extra + "\n")
console.log(`campusequip.css: ${colours.size} colours, ${texts.size} text colours, ${keyframes.size} keyframes`)
