import { msg } from "../i18n"
/**
 * Teacher single-page routes (ADR-0031): one address per view and sub-view, in the hash so that
 * the browser back button and direct links work without any server change.
 *
 *   #/aujourdhui
 *   #/classe/frise | etudiants | aide | difficultes      (?eleve=<id> opens a student panel)
 *   #/cours/plan | missions | apercu | import | regles | publication
 *   #/resultats
 *   #/projet                (ADR-0034)
 *   #/voyage[/<scène>]      (ADR-0033, in the menu once the application is integrated)
 *   #/classement            #/classement/<assignment id>
 *   #/reglages/notifications | observateurs | classes
 */

export type ViewKey = "aujourdhui" | "classe" | "cours" | "resultats" | "projet" | "classement" | "voyage" | "reglages"
export type TeacherRoute = { view: ViewKey; sub: string; params: Record<string, string> }
export type SubView = { key: string; label: string }
export type ViewInfo = { key: ViewKey; label: string; title: string; icon: string; subs: SubView[] }

export const VIEWS: ViewInfo[] = [
  { key: "aujourdhui", label: msg("Aujourd’hui"), title: msg("Aujourd’hui"), icon: "sun", subs: [] },
  { key: "classe", label: msg("Ma classe"), title: msg("Ma classe"), icon: "users", subs: [
    { key: "frise", label: msg("Frise") }, { key: "etudiants", label: msg("Étudiants") },
    { key: "aide", label: msg("Demandes d’aide") }, { key: "difficultes", label: msg("Difficultés") }] },
  { key: "cours", label: msg("Mon cours"), title: msg("Mon cours"), icon: "book", subs: [
    { key: "plan", label: "Plan" }, { key: "missions", label: "Missions" }, { key: "apercu", label: msg("Aperçu") },
    { key: "import", label: "Import" }, { key: "regles", label: msg("Règles") }, { key: "publication", label: "Publication" }] },
  { key: "resultats", label: msg("Résultats"), title: msg("Résultats"), icon: "chart", subs: [] },
  { key: "projet", label: msg("Projet"), title: msg("Projet CampusEquip"), icon: "folder", subs: [] },
  { key: "classement", label: "Leaderboard", title: "Leaderboard", icon: "trophy", subs: [] },
  { key: "voyage", label: msg("Le voyage d’une donnée"), title: msg("Le voyage d’une donnée"), icon: "route", subs: [] },
  { key: "reglages", label: msg("Réglages"), title: msg("Réglages"), icon: "settings", subs: [
    { key: "notifications", label: "Notifications" }, { key: "observateurs", label: msg("Observateurs") }, { key: "classes", label: msg("Autres classes") }] },
]

export const DEFAULT_ROUTE: TeacherRoute = { view: "aujourdhui", sub: "", params: {} }
export const LAST_ROUTE_KEY = "shopflow:teacher:route"

export function viewInfo(view: ViewKey): ViewInfo {
  return VIEWS.find((item) => item.key === view)!
}

/** Parses a hash such as "#/cours/apercu" or "#/classe/etudiants?eleve=12"; null when it is not a teacher route. */
export function parseRoute(hash: string): TeacherRoute | null {
  const match = /^#\/([a-z]+)(?:\/([a-z0-9]+))?(?:\?(.*))?$/.exec(hash)
  if (!match) return null
  const info = VIEWS.find((item) => item.key === match[1])
  if (!info) return null
  const params = Object.fromEntries(new URLSearchParams(match[3] ?? ""))
  if (info.key === "classement") return { view: "classement", sub: match[2] && /^\d+$/.test(match[2]) ? match[2] : "", params }
  if (info.key === "voyage") return { view: "voyage", sub: match[2] && /^[1-7]$/.test(match[2]) ? match[2] : "", params }
  const sub = match[2] ?? ""
  if (info.subs.length === 0) return sub ? null : { view: info.key, sub: "", params }
  if (!sub) return { view: info.key, sub: info.subs[0].key, params }
  return info.subs.some((item) => item.key === sub) ? { view: info.key, sub, params } : null
}

export function formatRoute(route: TeacherRoute): string {
  const query = new URLSearchParams(route.params).toString()
  return `#/${route.view}${route.sub ? `/${route.sub}` : ""}${query ? `?${query}` : ""}`
}

export function rememberRoute(route: TeacherRoute): void {
  try { window.localStorage.setItem(LAST_ROUTE_KEY, formatRoute({ ...route, params: {} })) } catch { /* not remembered */ }
}

export function rememberedRoute(): TeacherRoute | null {
  try { return parseRoute(window.localStorage.getItem(LAST_ROUTE_KEY) ?? "") } catch { return null }
}

/** Where the teacher lands: the address first, then (for a resumed session) the last view, else « Aujourd’hui ». */
export function initialRoute(hash: string, resumed: boolean): TeacherRoute {
  return parseRoute(hash) ?? (resumed ? rememberedRoute() : null) ?? DEFAULT_ROUTE
}
