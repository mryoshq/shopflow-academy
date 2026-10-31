import { useCallback, useEffect, useState } from "react"

/** Minimal hash router: "#/", "#/mission/<id>", "#/projet" (ADR-0034), "#/voyage[/<scene>]" (ADR-0033) and "#/campusequip[/<step>]" (ADR-0044). Survives reloads and re-login. */
export function parseRoute(hash: string): { name: "home" } | { name: "mission"; id: number } | { name: "projet" } | { name: "voyage"; scene: number } | { name: "campusequip"; step: number } {
  if (hash === "#/projet") return { name: "projet" }
  const campusequip = /^#\/campusequip(?:\/([1-7]))?$/.exec(hash)  // ADR-0044
  if (campusequip) return { name: "campusequip", step: campusequip[1] ? Number(campusequip[1]) : 1 }
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

/** ADR-0044: the interactive experiences take the whole width of the page. */
export function isExperience(hash: string): boolean {
  return /^#\/(?:voyage|campusequip)(?:\/[1-7])?$/.test(hash)
}

export function useExperienceRoute(): boolean {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const update = () => setHash(window.location.hash)
    window.addEventListener("hashchange", update)
    return () => window.removeEventListener("hashchange", update)
  }, [])
  return isExperience(hash)
}
