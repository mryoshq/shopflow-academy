import { useCallback, useEffect, useState } from "react"

export type ThemeChoice = "system" | "light" | "dark"
const KEY = "shopflow:theme"
/** Every control (header switch, account menu, settings dialog) follows the same choice. */
const EVENT = "shopflow:theme-change"

function systemDark(): boolean {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches } catch { return false }
}

export function readChoice(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(KEY)
    return value === "light" || value === "dark" ? value : "system"
  } catch { return "system" }
}

/** Same logic as public/theme-init.js (which runs before the first paint). */
export function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && systemDark())
  const root = document.documentElement
  root.classList.toggle("dark", dark)
  root.classList.toggle("light", !dark)
  root.style.colorScheme = dark ? "dark" : "light"
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
    try { window.localStorage.setItem(KEY, next) } catch { /* not remembered, still applied */ }
    setChoice(next)
    window.dispatchEvent(new CustomEvent<ThemeChoice>(EVENT, { detail: next }))
  }, [])
  return { choice, choose }
}
