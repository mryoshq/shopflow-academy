import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { claimIntro, resetIntro } from "./LoginIntro"

beforeEach(() => {
  resetIntro()
  sessionStorage.clear()
  document.documentElement.classList.remove("reduce-motion")
  // jsdom has no Web Animations: pretend it exists, as in every supported browser.
  Element.prototype.animate = vi.fn() as unknown as typeof Element.prototype.animate
  vi.stubGlobal("matchMedia", () => ({ matches: false }))
})
afterEach(() => { vi.unstubAllGlobals(); delete (Element.prototype as { animate?: unknown }).animate })

it("plays once per browser session", () => {
  expect(claimIntro()).toBe(true)
  expect(sessionStorage.getItem("rapidfox:intro-shown")).toBe("1")
  resetIntro()  // a new page load in the same session
  expect(claimIntro()).toBe(false)
})

it("is skipped with reduced motion (system or « Réduire les animations ») and when storage is blocked", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }))
  expect(claimIntro()).toBe(false)
  resetIntro()
  vi.stubGlobal("matchMedia", () => ({ matches: false }))
  document.documentElement.classList.add("reduce-motion")
  expect(claimIntro()).toBe(false)
  resetIntro()
  document.documentElement.classList.remove("reduce-motion")
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
  expect(claimIntro()).toBe(false)
  vi.restoreAllMocks()
})
