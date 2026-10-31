import { t, msg } from "../i18n"
import type { IconName } from "../student/ui"
import type { MissionKind } from "../studioTypes"

/** French label and icon of each activity type (studio, preview, outline). */
export const KIND_META: Record<MissionKind, { label: string; icon: IconName }> = {
  lesson: { label: msg("Leçon"), icon: "book" },
  review: { label: msg("Révision"), icon: "layers" },
  single_choice: { label: msg("Choix unique"), icon: "list" },
  multiple_choice: { label: msg("Choix multiples"), icon: "list" },
  true_false: { label: msg("Vrai ou faux"), icon: "check" },
  reorder: { label: msg("Remettre en ordre"), icon: "sort" },
  matching: { label: msg("Associer"), icon: "link" },
  data_interpretation: { label: msg("Lire des données"), icon: "chart" },
  scenario_choice: { label: msg("Scénario"), icon: "target" },
  guided_simulation: { label: msg("Simulation guidée"), icon: "play" },
  sql_challenge: { label: msg("Défi SQL"), icon: "code" },
}

export const BLOCK_CATEGORY = msg("Objectifs de bloc")
const PREFIXES: [string, string][] = [["SQL-", "SQL"], ["PY-", "Python"], ["BLOC-", BLOCK_CATEGORY]]

/** Same rule as the server (app.curriculum.objective_category). */
export function objectiveCategory(code: string, category?: string | null): string {
  if (category && category.trim()) return category.trim()
  return PREFIXES.find(([prefix]) => code.toUpperCase().startsWith(prefix))?.[1] ?? t("Autres objectifs")
}

/** Lower case without accents, for search. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}
