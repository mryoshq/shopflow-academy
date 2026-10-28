import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { useState } from "react"
import { afterEach, expect, it } from "vitest"
import { system } from "../theme"
import type { CourseModule, Mission, MissionDefinition, Objective } from "../studioTypes"
import { CourseOutline } from "./CourseOutline"
import { ObjectivesPanel } from "./ObjectivesPanel"
import { objectiveCategory } from "./kinds"

const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
afterEach(cleanup)

function definition(overrides: Partial<MissionDefinition>): MissionDefinition {
  return { schema_version: 1, kind: "single_choice", scenario: "s", instructions: "i", objective_ids: [1], prerequisite_mission_ids: [], choices: [],
    correct_ids: [], match_targets: [], correct_pairs: {}, action_id: null, display_data: null, resources: [], hints: [], feedback: {},
    max_points: 10, estimated_duration_minutes: 10, bonus: false, ...overrides }
}
const objectives: Objective[] = [
  { id: 1, code: "SQL-JOIN", statement: "Joindre deux tables." },
  { id: 2, code: "BLOC-UN", statement: "Comprendre le bloc 1." },
  { id: 3, code: "OBJ-X", statement: "Objectif non couvert.", category: "Qualité" },
]
const modules: CourseModule<Mission>[] = [{ id: 1, title: "Module SQL", sort_order: 0, chapters: [
  { id: 10, title: "Le grain", sort_order: 0, missions: [
    { id: 100, slug: "a", title: "Qu'est-ce que le grain ?", sort_order: 0, definition: definition({ kind: "lesson", max_points: 0, estimated_duration_minutes: 3, objective_ids: [1, 2] }) },
    { id: 101, slug: "b", title: "Frais après jointure", sort_order: 1, definition: definition({ run: [{ id: "r", label: "x", sql: "SELECT 1" }] }) },
    { id: 102, slug: "c", title: "Défi des villes", sort_order: 2, definition: definition({ kind: "sql_challenge", bonus: true, max_points: 5 }) },
  ] },
  { id: 11, title: "Qualité", sort_order: 1, missions: [
    { id: 103, slug: "d", title: "Mission à écrire", sort_order: 0, definition: null },
    { id: 104, slug: "e", title: "Objectif supprimé", sort_order: 1, definition: definition({ objective_ids: [99] }) },
  ] },
] }]

it("shows counters, block headers and one line per item with type, badges, points and state", () => {
  wrap(<CourseOutline label="Plan" modules={modules} objectives={objectives} selectedId={101} />)
  const counters = screen.getAllByRole("definition").map((node) => node.textContent)
  expect(counters).toEqual(["2", "2", "1", "1", "20 + 5 bonus"])
  const first = screen.getByRole("button", { name: /^1\s*Le grain/ })
  expect(first).toHaveAttribute("aria-expanded", "true")
  expect(first).toHaveTextContent("3 éléments · 13 min · 10 pts + 5 bonus")
  // The block of the selected item is open, the other one is folded.
  expect(screen.getByRole("button", { name: /^2\s*Qualité/ })).toHaveAttribute("aria-expanded", "false")
  const row = screen.getByRole("button", { name: "Frais après jointure" }).closest("li")!
  expect(row).toHaveTextContent("Choix unique")
  expect(row).toHaveTextContent("Exécution")
  expect(row).toHaveTextContent("10 pts · 10 min")
  expect(row).toHaveTextContent("Valide")
  expect(row).toHaveAttribute("aria-current", "true")
  const bonus = screen.getByRole("button", { name: "Défi des villes" }).closest("li")!
  expect(within(bonus).getByText("Bonus")).toBeInTheDocument()
  expect(bonus).toHaveTextContent("Défi SQL")
  fireEvent.click(screen.getByRole("button", { name: /^2\s*Qualité/ }))
  expect(screen.getByRole("button", { name: "Mission à écrire" }).closest("li")).toHaveTextContent("À compléter")
  expect(screen.getByRole("button", { name: "Objectif supprimé" }).closest("li")).toHaveTextContent("Erreur : objectif inconnu")
})

it("filters by type, by search (accents ignored) and by objective", () => {
  function Host() {
    const [objective, setObjective] = useState<number | null>(null)
    return <>
      <ObjectivesPanel objectives={objectives} modules={modules} onFilter={setObjective} />
      <CourseOutline label="Plan" modules={modules} objectives={objectives} objectiveFilter={objective} onClearObjectiveFilter={() => setObjective(null)} />
    </>
  }
  wrap(<Host />)
  const select = screen.getByLabelText("Filtrer par type")
  fireEvent.change(select, { target: { value: "lesson" } })
  expect(screen.getByRole("status")).toHaveTextContent("1 élément affiché")
  fireEvent.change(select, { target: { value: "todo" } })
  expect(screen.getByRole("button", { name: "Mission à écrire" })).toBeVisible()
  expect(screen.getByRole("button", { name: "Objectif supprimé" })).toBeVisible()
  expect(screen.queryByRole("button", { name: "Frais après jointure" })).toBeNull()
  fireEvent.change(select, { target: { value: "all" } })
  fireEvent.change(screen.getByLabelText("Rechercher un élément"), { target: { value: "defi" } })
  expect(screen.getByRole("button", { name: "Défi des villes" })).toBeVisible()
  expect(screen.queryByRole("button", { name: "Frais après jointure" })).toBeNull()
  fireEvent.change(screen.getByLabelText("Rechercher un élément"), { target: { value: "" } })
  // Objectives: the count is clickable and filters the outline; an uncovered objective is flagged.
  fireEvent.click(screen.getByRole("button", { name: "Afficher les 3 éléments qui couvrent SQL-JOIN" }))
  expect(screen.getAllByRole("status")[0]).toHaveTextContent("Éléments qui couvrent SQL-JOIN")
  expect(screen.getByText("3 éléments affichés")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Retirer le filtre" }))
  expect(screen.getByText("Aucune mission ne le couvre")).toBeInTheDocument()
})

it("groups objectives by category, block objectives folded at the end", () => {
  wrap(<ObjectivesPanel objectives={objectives} modules={modules} onFilter={() => undefined} />)
  const groups = screen.getAllByRole("button", { expanded: true }).concat(screen.getAllByRole("button", { expanded: false }))
    .map((node) => node.textContent ?? "").filter((text) => /objectif/.test(text))
  expect(groups[0]).toMatch(/^SQL/)
  const block = screen.getByRole("button", { name: /^Objectifs de bloc/ })
  expect(block).toHaveAttribute("aria-expanded", "false")
  expect(screen.getByRole("button", { name: /^Qualité/ })).toHaveAttribute("aria-expanded", "true")
  expect(objectiveCategory("PY-CSV")).toBe("Python")
  expect(objectiveCategory("X", "Autre")).toBe("Autre")
})
