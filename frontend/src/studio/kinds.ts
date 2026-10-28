import type { IconName } from "../student/ui"
import type { MissionKind } from "../studioTypes"

/** French label and icon of each activity type (studio, preview, outline). */
export const KIND_META: Record<MissionKind, { label: string; icon: IconName }> = {
  lesson: { label: "Leçon", icon: "book" },
  review: { label: "Révision", icon: "layers" },
  single_choice: { label: "Choix unique", icon: "list" },
  multiple_choice: { label: "Choix multiples", icon: "list" },
  true_false: { label: "Vrai ou faux", icon: "check" },
  reorder: { label: "Remettre en ordre", icon: "sort" },
  matching: { label: "Associer", icon: "link" },
  data_interpretation: { label: "Lire des données", icon: "chart" },
  scenario_choice: { label: "Scénario", icon: "target" },
  guided_simulation: { label: "Simulation guidée", icon: "play" },
  sql_challenge: { label: "Défi SQL", icon: "code" },
}

export const BLOCK_CATEGORY = "Objectifs de bloc"
const PREFIXES: [string, string][] = [["SQL-", "SQL"], ["PY-", "Python"], ["BLOC-", BLOCK_CATEGORY]]

/** Same rule as the server (app.curriculum.objective_category). */
export function objectiveCategory(code: string, category?: string | null): string {
  if (category && category.trim()) return category.trim()
  return PREFIXES.find(([prefix]) => code.toUpperCase().startsWith(prefix))?.[1] ?? "Autres objectifs"
}

/** Lower case without accents, for search. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}
