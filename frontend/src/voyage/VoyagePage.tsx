import { useEffect, useState } from "react"
import { api } from "../api"
import { LoadingState } from "../student/ui"
import { DEFAULT_VOYAGE, applyVoyageData, mergeVoyageData } from "./data"
import VoyageApp from "./VoyageApp"

/**
 * Host page of « Le voyage d'une donnée » (#/voyage, #/voyage/<scene>): loads the course values
 * (experiences/voyage.json, merged over the defaults of the model), then mounts the owner's application.
 * Without course values, or if the request fails, the experience runs on its defaults.
 */
export default function VoyagePage({ scene = 1, onScene }: { scene?: number; onScene?: (scene: number) => void }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    api<{ data: unknown }>("/experiences/voyage/data")
      .then((result) => { applyVoyageData(mergeVoyageData(DEFAULT_VOYAGE, result.data)) })
      .catch(() => applyVoyageData(DEFAULT_VOYAGE))
      .finally(() => { if (live) setReady(true) })
    return () => { live = false }
  }, [])
  if (!ready) return <LoadingState label="Chargement de l’expérience…" />
  return <VoyageApp initialScene={scene} onScene={onScene} />
}
