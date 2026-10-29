import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Box } from "@chakra-ui/react"
import { nextZoom, percent, readZoom, setZoom } from "./display"
import { SettingsDialog, type SettingsTab } from "./SettingsDialog"

export type Account = { username: string; role: "teacher" | "student" | "observer" }

type Preferences = { openSettings: (tab?: SettingsTab) => void; account: Account | null }
const Context = createContext<Preferences>({ openSettings: () => undefined, account: null })

export function usePreferences() {
  return useContext(Context)
}

/** The key of an in-app zoom shortcut, or null (Ctrl/⌘ with +, -, 0, on the main keys or the keypad). */
export function zoomShortcut(event: KeyboardEvent): 1 | -1 | 0 | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null
  if (event.key === "+" || event.key === "=" || event.code === "NumpadAdd") return 1
  if (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract") return -1
  if (event.key === "0" || event.code === "Numpad0" || event.code === "Digit0") return 0
  return null
}

/**
 * Display preferences for the whole application (ADR-0036): settings dialog (Ctrl/⌘ + ,), text size with
 * Ctrl/⌘ + plus, minus and 0 (remembered in this browser, also in the installed app where the browser zoom
 * is missing), and a short indicator of the new size.
 */
export function PreferencesProvider({ account, children }: { account: Account | null; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<SettingsTab>("general")
  const [toast, setToast] = useState<{ zoom: number; key: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const openSettings = useCallback((next: SettingsTab = "general") => { setTab(next); setOpen(true) }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const step = zoomShortcut(event)
      if (step !== null) {
        event.preventDefault()
        const zoom = step === 0 ? 1 : nextZoom(readZoom(), step)
        setZoom(zoom)
        setToast({ zoom, key: Date.now() })
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setToast(null), 1400)
        return
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === ",") {
        event.preventDefault()
        openSettings("general")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => { window.removeEventListener("keydown", onKey); window.clearTimeout(timer.current) }
  }, [openSettings])

  const value = useMemo(() => ({ openSettings, account }), [openSettings, account])
  return <Context.Provider value={value}>
    {children}
    <SettingsDialog open={open} onClose={() => setOpen(false)} tab={tab} onTab={setTab} account={account} />
    <Box role="status" aria-live="polite" position="fixed" bottom="6" left="50%" transform="translateX(-50%)" zIndex="toast" pointerEvents="none">
      {toast && <Box key={toast.key} className="zoom-toast" px="4" py="2" rounded="full" bg="app.ink" color="app.canvas" fontSize="sm" fontWeight="medium"
        boxShadow="lg" css={{ fontVariantNumeric: "tabular-nums" }}>Taille du texte : {percent(toast.zoom)}</Box>}
    </Box>
  </Context.Provider>
}
