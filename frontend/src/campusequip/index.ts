import { lazy } from "react"

/** ADR-0044: the owner's application (CampusEquip-experience.zip) is integrated in src/campusequip/. */
export const CAMPUSEQUIP_READY = true

/** Loaded on demand: the experience (code, data and styles) never weighs on the rest of the application. */
export const CampusEquipPage = lazy(() => import("./CampusEquipPage"))

/** #/campusequip and #/campusequip/<step> (1 to 7). */
export function stepFrom(hash: string): number | null {
  const match = /^#\/campusequip(?:\/([1-7]))?$/.exec(hash)
  return match ? Number(match[1] ?? 1) : null
}
