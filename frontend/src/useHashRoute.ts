import { useCallback, useEffect, useState } from "react"

/** Minimal hash router: "#/", "#/mission/<id>" and "#/classement/<class id>". Survives reloads and re-login. */
export function parseRoute(hash: string): { name: "home" } | { name: "mission"; id: number } | { name: "leaderboard"; id: number } {
  const match = /^#\/mission\/(\d{1,9})$/.exec(hash)
  if (match) return { name: "mission", id: Number(match[1]) }
  const board = /^#\/classement\/(\d{1,9})$/.exec(hash)
  return board ? { name: "leaderboard", id: Number(board[1]) } : { name: "home" }
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
