import { useCallback, useEffect, useState } from "react"

/** Minimal hash router: "#/", "#/mission/<id>" and "#/voyage[/<scene>]" (ADR-0033). Survives reloads and re-login. */
export function parseRoute(hash: string): { name: "home" } | { name: "mission"; id: number } | { name: "voyage"; scene: number } {
  const voyage = /^#\/voyage(?:\/([1-7]))?$/.exec(hash)
  if (voyage) return { name: "voyage", scene: voyage[1] ? Number(voyage[1]) : 1 }
  const match = /^#\/mission\/(\d{1,9})$/.exec(hash)
  return match ? { name: "mission", id: Number(match[1]) } : { name: "home" }
}

export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const update = () => setHash(window.location.hash)
    window.addEventListener("hashchange", update)
    return () => window.removeEventListener("hashchange", update)
  }, [])
  const navigate = useCallback((path: string) => {
    const next = `#${path}`
    if (window.location.hash !== next) window.location.hash = next
    setHash(next)
    window.scrollTo?.({ top: 0 })
  }, [])
  return { route: parseRoute(hash), navigate }
}
