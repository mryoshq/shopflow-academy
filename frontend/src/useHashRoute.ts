import { useCallback, useEffect, useState } from "react"

/** Minimal hash router: "#/" and "#/mission/<id>". Survives reloads and re-login. */
export function parseRoute(hash: string): { name: "home" } | { name: "mission"; id: number } | { name: "projet" } {
  if (hash === "#/projet") return { name: "projet" }
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
