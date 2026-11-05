import { createContext, useCallback, useContext, useEffect, useState } from "react"

/**
 * Minimal hash router: "#/" (the Projet tab), "#/projet", "#/cours", "#/ressources" (the three tabs of the home page, ADR-0051),
 * "#/mission/<id>", "#/voyage[/<scene>]" (ADR-0033) and "#/campusequip[/<step>]" (ADR-0044). Survives reloads and re-login.
 */
export type HomeTab = "projet" | "cours" | "ressources"
export function parseRoute(hash: string): { name: "home" } | { name: "mission"; id: number } | { name: HomeTab } | { name: "voyage"; scene: number } | { name: "campusequip"; step: number } {
  if (hash === "#/projet" || hash === "#/cours" || hash === "#/ressources") return { name: hash.slice(2) as HomeTab }
  const campusequip = /^#\/campusequip(?:\/([1-7]))?$/.exec(hash)  // ADR-0044
  if (campusequip) return { name: "campusequip", step: campusequip[1] ? Number(campusequip[1]) : 1 }
  const voyage = /^#\/voyage(?:\/([1-7]))?$/.exec(hash)
  if (voyage) return { name: "voyage", scene: voyage[1] ? Number(voyage[1]) : 1 }
  const match = /^#\/mission\/(\d{1,9})$/.exec(hash)
  return match ? { name: "mission", id: Number(match[1]) } : { name: "home" }
}

type Router = { route: ReturnType<typeof parseRoute>; navigate: (path: string) => void; href: (path: string) => string }

/** ADR-0043: « Vue étudiant » runs the student pages under the teacher's own address (#/etudiant/...). */
export const StudentRouterContext = createContext<Router | null>(null)

/** The address of a student page, for links (« #/projet », or « #/etudiant/projet » in « Vue étudiant »). */
export function useStudentHref(): (path: string) => string {
  const router = useContext(StudentRouterContext)
  return router ? router.href : (path: string) => `#${path}`
}

export function useHashRoute(): Router {
  const router = useContext(StudentRouterContext)
  const own = useOwnHashRoute()
  return router ?? own
}

function useOwnHashRoute(): Router {
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
  return { route: parseRoute(hash), navigate, href: (path: string) => `#${path}` }
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
