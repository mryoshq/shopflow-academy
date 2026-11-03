import { useCallback, useEffect, useState } from "react"

export type ThemeChoice = "system" | "light" | "dark"
const KEY = "shopflow:theme"
/** Every control (header switch, account menu, settings dialog) follows the same choice. */
const EVENT = "shopflow:theme-change"

function systemDark(): boolean {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches } catch { return false }
}

export function readChoice(): ThemeChoice {
  if (document.documentElement.dataset.themeVolatile === "true") return document.documentElement.dataset.themeChoice === "dark" ? "dark" : document.documentElement.dataset.themeChoice === "light" ? "light" : "system"
  try {
    const value = window.localStorage.getItem(KEY)
    return value === "light" || value === "dark" ? value : "system"
  } catch { return document.documentElement.dataset.themeChoice === "light" || document.documentElement.dataset.themeChoice === "dark" ? document.documentElement.dataset.themeChoice : "system" }
}

/** ADR-0036: the tab icon follows the theme chosen in the application (same rule as public/theme-init.js). */
export function setFavicon(dark: boolean) {
  let icon = document.getElementById("theme-icon") as HTMLLinkElement | null
  if (!icon) {
    document.querySelectorAll("link[rel~='icon']").forEach((link) => link.remove())
    icon = document.createElement("link")
    icon.id = "theme-icon"
    icon.rel = "icon"
    icon.type = "image/png"
    icon.setAttribute("sizes", "64x64")
    document.head.appendChild(icon)
  }
  const href = dark ? "/icons/favicon-dark.png" : "/icons/favicon-light.png"
  if (icon.getAttribute("href") !== href) icon.setAttribute("href", href)
}

/** Same logic as public/theme-init.js (which runs before the first paint). */
export function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && systemDark())
  const root = document.documentElement
  root.dataset.themeChoice = choice
  root.classList.toggle("dark", dark)
  root.classList.toggle("light", !dark)
  root.style.colorScheme = dark ? "dark" : "light"
  applyPalette(readPalette())
  setFavicon(dark)
}

export function useColorMode() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice)
  useEffect(() => {
    applyTheme(choice)
    if (choice !== "system") return
    let query: MediaQueryList | null = null
    try { query = window.matchMedia("(prefers-color-scheme: dark)") } catch { return }
    const update = () => applyTheme("system")
    query.addEventListener?.("change", update)
    return () => query?.removeEventListener?.("change", update)
  }, [choice])
  useEffect(() => {
    const sync = (event: Event) => setChoice((event as CustomEvent<ThemeChoice>).detail)
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])
  const choose = useCallback((next: ThemeChoice) => {
    try { window.localStorage.setItem(KEY, next); delete document.documentElement.dataset.themeVolatile } catch { document.documentElement.dataset.themeVolatile = "true" }
    applyTheme(next)
    setChoice(next)
    window.dispatchEvent(new CustomEvent<ThemeChoice>(EVENT, { detail: next }))
  }, [])
  return { choice, choose }
}

export type PaletteChoice = "classic" | "catppuccin"
const PALETTE_KEY = "shopflow:palette"
const PALETTE_EVENT = "shopflow:palette-change"
export function readPalette(): PaletteChoice {
  if (document.documentElement.dataset.paletteVolatile === "true") return document.documentElement.dataset.palette === "catppuccin" ? "catppuccin" : "classic"
  try { return window.localStorage.getItem(PALETTE_KEY) === "catppuccin" ? "catppuccin" : "classic" }
  catch { return document.documentElement.dataset.palette === "catppuccin" ? "catppuccin" : "classic" }
}
export function applyPalette(palette: PaletteChoice) {
  const root = document.documentElement
  root.dataset.palette = palette
  const dark = root.classList.contains("dark")
  // Same four canvas values as the pre-paint bootstrap; no palette-specific component CSS.
  root.style.backgroundColor = palette === "catppuccin" ? dark ? "#1E1E2E" : "#EFF1F5" : dark ? "#262624" : "#FAF9F5"
}
export function useColorPalette() {
  const [palette, setPalette] = useState<PaletteChoice>(readPalette)
  useEffect(() => { applyPalette(palette) }, [palette])
  useEffect(() => {
    const sync = (event: Event) => setPalette((event as CustomEvent<PaletteChoice>).detail)
    window.addEventListener(PALETTE_EVENT, sync)
    return () => window.removeEventListener(PALETTE_EVENT, sync)
  }, [])
  const choosePalette = useCallback((next: PaletteChoice) => {
    try { window.localStorage.setItem(PALETTE_KEY, next); delete document.documentElement.dataset.paletteVolatile } catch { document.documentElement.dataset.paletteVolatile = "true" }
    applyPalette(next); setPalette(next)
    window.dispatchEvent(new CustomEvent<PaletteChoice>(PALETTE_EVENT, { detail: next }))
  }, [])
  return { palette, choosePalette }
}
