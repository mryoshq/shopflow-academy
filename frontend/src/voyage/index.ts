import { lazy } from "react"

/** ADR-0033: the owner's application (ShopFlow-voyage.zip) is integrated in src/voyage/: menu entries
 *  (student and teacher) and the lesson links are shown. */
export const VOYAGE_READY = true

/** Loaded on demand: the experience (code and styles) never weighs on the rest of the application. */
export const VoyagePage = lazy(() => import("./VoyagePage"))
