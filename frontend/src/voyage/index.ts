import { lazy } from "react"

/** ADR-0033: true once the owner's application (ShopFlow-voyage.zip) is integrated in src/voyage/. Until then
 *  no menu entry is shown and lessons announce the experience without a link. */
export const VOYAGE_READY = false

/** Loaded on demand: the experience never weighs on the rest of the application. */
export const VoyagePage = lazy(() => import("./VoyagePage"))
