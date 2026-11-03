import { readFileSync } from "node:fs"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { applyTheme, readChoice, readPalette, useColorMode, useColorPalette } from "../useColorMode"
import { CATPPUCCIN } from "../catppuccin"
const bootstrap = readFileSync("public/theme-init.js", "utf8")
function Controls() { const theme = useColorMode(), palette = useColorPalette(); return <><button onClick={() => palette.choosePalette("catppuccin")}>Palette</button><button onClick={() => theme.choose("dark")}>Mode</button><output>{palette.palette}/{theme.choice}</output></> }
beforeEach(() => { localStorage.clear(); document.documentElement.className = ""; for (const key of Object.keys(document.documentElement.dataset)) delete document.documentElement.dataset[key] })
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it("preserves the default and changes palette independently of mode across controls", () => {
  expect(readPalette()).toBe("classic"); expect(readChoice()).toBe("system")
  render(<><Controls /><Controls /></>)
  fireEvent.click(screen.getAllByText("Palette")[0]); expect(screen.getAllByText("catppuccin/system")).toHaveLength(2)
  fireEvent.click(screen.getAllByText("Mode")[0]); expect(screen.getAllByText("catppuccin/dark")).toHaveLength(2)
  expect(localStorage.getItem("shopflow:palette")).toBe("catppuccin")
  expect(document.documentElement.dataset.palette).toBe("catppuccin")
  expect(document.documentElement.style.backgroundColor).toBe("rgb(30, 30, 46)")
})
it("keeps the session preference when storage writes fail and a new control mounts", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
  const view = render(<Controls />)
  fireEvent.click(screen.getByText("Palette")); fireEvent.click(screen.getByText("Mode"))
  view.rerender(<><Controls /><Controls /></>)
  expect(screen.getAllByText("catppuccin/dark")).toHaveLength(2)
  applyTheme("light"); expect(document.documentElement.dataset.palette).toBe("catppuccin")
})
it("bootstrap applies saved palette and mode before React, even with unavailable storage", () => {
  localStorage.setItem("shopflow:theme", "dark"); localStorage.setItem("shopflow:palette", "catppuccin")
  new Function(bootstrap)()
  expect(document.documentElement.dataset.palette).toBe("catppuccin")
  expect(document.documentElement.style.backgroundColor).toBe("rgb(30, 30, 46)")
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
  vi.stubGlobal("matchMedia", () => ({ matches: true }))
  new Function(bootstrap)()
  expect(document.documentElement).toHaveClass("dark")
  expect(document.documentElement.dataset.palette).toBe("classic")
  vi.unstubAllGlobals()
})
const lum = (hex: string) => hex.slice(1).match(/../g)!.map((n) => parseInt(n, 16) / 255).map((n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0)
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
it("keeps official text colours AA on every palette surface and field boundaries visible", () => {
  for (const p of Object.values(CATPPUCCIN)) for (const bg of [p.base, p.mantle, p.crust, ...(p === CATPPUCCIN.mocha ? [p.surface] : [])]) {
    expect(contrast(p.text, bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(p.subtext, bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(p.field, bg)).toBeGreaterThanOrEqual(3)
  }
  expect(contrast("#FFFFFF", CATPPUCCIN.latte.mauve)).toBeGreaterThanOrEqual(4.5)
  expect(contrast(CATPPUCCIN.mocha.base, CATPPUCCIN.mocha.mauve)).toBeGreaterThanOrEqual(4.5)
})
