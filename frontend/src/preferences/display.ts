import { useCallback, useEffect, useState } from "react"

/**
 * Display preferences of this browser (ADR-0036): text size (in-app zoom) and reduced motion.
 * Same logic as public/theme-init.js, which applies them before the first paint.
 */
export const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.5] as const
const ZOOM_KEY = "shopflow:zoom"
const MOTION_KEY = "shopflow:motion"
const ZOOM_EVENT = "shopflow:zoom-change"
const MOTION_EVENT = "shopflow:motion-change"

export function readZoom(): number {
  try {
    const value = Number(window.localStorage.getItem(ZOOM_KEY))
    return (ZOOM_STEPS as readonly number[]).includes(value) ? value : 1
  } catch { return 1 }
}

/** Every size of the theme is in rem: the root font size scales the whole interface. */
export function applyZoom(zoom: number) {
  document.documentElement.style.fontSize = zoom === 1 ? "" : `${Math.round(zoom * 100)}%`
}

export function nextZoom(zoom: number, step: 1 | -1): number {
  const index = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number])
  const current = index === -1 ? ZOOM_STEPS.indexOf(1) : index
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, current + step))]
}

export function setZoom(zoom: number) {
  try { window.localStorage.setItem(ZOOM_KEY, String(zoom)) } catch { /* not remembered, still applied */ }
  applyZoom(zoom)
  window.dispatchEvent(new CustomEvent<number>(ZOOM_EVENT, { detail: zoom }))
}

export function useZoom() {
  const [zoom, set] = useState(readZoom)
  useEffect(() => {
    const sync = (event: Event) => set((event as CustomEvent<number>).detail)
    window.addEventListener(ZOOM_EVENT, sync)
    return () => window.removeEventListener(ZOOM_EVENT, sync)
  }, [])
  return { zoom, setZoom: useCallback((value: number) => setZoom(value), []) }
}

export function readReducedMotion(): boolean {
  try { return window.localStorage.getItem(MOTION_KEY) === "reduce" } catch { return false }
}

export function applyReducedMotion(reduce: boolean) {
  document.documentElement.classList.toggle("reduce-motion", reduce)
}

export function useReducedMotion() {
  const [reduce, set] = useState(readReducedMotion)
  useEffect(() => {
    const sync = (event: Event) => set((event as CustomEvent<boolean>).detail)
    window.addEventListener(MOTION_EVENT, sync)
    return () => window.removeEventListener(MOTION_EVENT, sync)
  }, [])
  const choose = useCallback((value: boolean) => {
    try { window.localStorage.setItem(MOTION_KEY, value ? "reduce" : "auto") } catch { /* not remembered */ }
    applyReducedMotion(value)
    window.dispatchEvent(new CustomEvent<boolean>(MOTION_EVENT, { detail: value }))
  }, [])
  return { reduce, choose }
}

export function isMac(): boolean {
  try { return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) } catch { return false }
}

/** « Ctrl » on Windows and Linux, « ⌘ » on a Mac. */
export function modKey(): string {
  return isMac() ? "⌘" : "Ctrl"
}

export function percent(zoom: number): string {
  return `${Math.round(zoom * 100)} %`
}
