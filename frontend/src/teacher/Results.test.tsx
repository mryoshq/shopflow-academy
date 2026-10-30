import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { Results, type ResultsData, type ResultStudent } from "./Results"

const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const student = (id: number, display_name: string, percentage: number | null, needs_support: boolean): ResultStudent => ({
  id, display_name, percentage, needs_support, core_points: percentage === null ? 0 : percentage * .3, core_possible: percentage === null ? 0 : 30,
  bonus_points: 2, completed: 1, total: 3, unsuccessful_count: 2,
  unsuccessful_missions: [{ mission_version_id: 11, title: "Dates du partenaire", best_points: 2.5, possible: 10, attempts: 2 },
    { mission_version_id: 12, title: "Contrôle du total", best_points: 0, possible: 10, attempts: 0 }],
})
const data = (patch: Partial<ResultsData> = {}): ResultsData => ({ assignment_id: 4, cohort: "Classe fictive", course_title: "Démonstration", version: 2, threshold: 50,
  students: [student(1, "Alice", 70, false), student(2, "Yasmine", 23.33, true)],
  weakest_missions: [{ mission_version_id: 12, title: "Contrôle du total", completed: 0, total: 2, unsuccessful_count: 2, success_percentage: 0 }], ...patch })
const wrap = () => render(<ChakraProvider value={system}><Results assignmentId={4} /></ChakraProvider>)
const names = () => within(screen.getByRole("table", { name: "Notes de la classe" })).getAllByRole("row").slice(1).map(row => within(row).getAllByRole("cell")[0].textContent)
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it("shows retained points, separate bonuses, support text and each student's unsuccessful missions", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(data())))
  wrap()
  const table = await screen.findByRole("table", { name: "Notes de la classe" })
  expect(names()).toEqual(["Yasmine", "Alice"])
  expect(within(table).getByRole("columnheader", { name: "Points bonus" })).toBeVisible()
  expect(within(table).getByText("23,33 %")).toBeVisible()
  const row = within(table).getAllByRole("row")[1]
  expect(within(row).getByText("À accompagner")).toBeVisible()
  const summary = within(row).getByText("2 missions à réussir")
  fireEvent.click(summary)
  expect(within(row).getByText("Dates du partenaire")).toBeInTheDocument()
  expect(within(row).getByText("2,5 / 10 points retenus")).toBeInTheDocument()
  expect(within(row).getByText("Non commencée")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Exporter les notes (CSV)" })).toHaveAttribute("href", "/api/v1/teacher/classes/4/results/export.csv?threshold=50")
})

it("sorts and filters without changing the class-wide weakest missions", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(data())))
  wrap()
  await screen.findByRole("table")
  fireEvent.change(screen.getByRole("combobox", { name: "Trier les étudiants" }), { target: { value: "name" } })
  expect(names()).toEqual(["Alice", "Yasmine"])
  fireEvent.change(screen.getByRole("combobox", { name: "Trier les étudiants" }), { target: { value: "percentage_asc" } })
  expect(names()).toEqual(["Yasmine", "Alice"])
  fireEvent.change(screen.getByRole("combobox", { name: "Afficher les étudiants" }), { target: { value: "support" } })
  expect(names()).toEqual(["Yasmine"])
  expect(screen.getByText("0 / 2 réussites · 0 % · 2 à réussir")).toBeVisible()
})

it("applies the threshold on the server and uses exactly that threshold for CSV", async () => {
  const fetcher = vi.fn().mockImplementation(async (url: string) => {
    const threshold = Number(new URL(`https://example.test${url}`).searchParams.get("threshold"))
    return json(data({ threshold, students: [student(1, "Alice", 70, threshold > 70)] }))
  })
  vi.stubGlobal("fetch", fetcher)
  wrap()
  await screen.findByRole("table")
  fireEvent.change(screen.getByRole("spinbutton", { name: "Seuil d’accompagnement (%)" }), { target: { value: "75" } })
  fireEvent.click(screen.getByRole("button", { name: "Appliquer le seuil" }))
  const table = await screen.findByRole("table")
  expect(within(table).getByText("À accompagner")).toBeVisible()
  expect(fetcher.mock.calls.at(-1)![0]).toBe("/api/v1/teacher/classes/4/results?threshold=75")
  expect(screen.getByRole("link", { name: "Exporter les notes (CSV)" })).toHaveAttribute("href", "/api/v1/teacher/classes/4/results/export.csv?threshold=75")
})

it("handles an empty class and a filter with no match", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(data({ students: [], weakest_missions: [] }))))
  wrap()
  expect(await screen.findByText("Aucun étudiant dans la classe.")).toBeVisible()
  cleanup()
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(data({ students: [student(1, "Alice", 70, false)] }))))
  wrap()
  await screen.findByRole("table")
  fireEvent.change(screen.getByRole("combobox", { name: "Afficher les étudiants" }), { target: { value: "support" } })
  expect(screen.getByText("Aucun étudiant ne correspond à ce filtre.")).toBeVisible()
})

it("does not label a student as weak when no principal points exist", async () => {
  const empty = { ...student(1, "Alice", null, false), total: 0, completed: 0, unsuccessful_count: 0, unsuccessful_missions: [] }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(data({ students: [empty], weakest_missions: [] }))))
  wrap()
  const table = await screen.findByRole("table")
  expect(within(table).getByText("Non calculable")).toBeVisible()
  expect(within(table).getByText("Sans mission notée")).toBeVisible()
  expect(within(table).queryByText("À accompagner")).not.toBeInTheDocument()
})

it("clears stale results on error and supports an explicit retry", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json(data())).mockResolvedValueOnce(json({ detail: "boom" }, 500)).mockResolvedValue(json(data()))
  vi.stubGlobal("fetch", fetcher)
  wrap()
  await screen.findByRole("table")
  fireEvent.click(screen.getByRole("button", { name: "Actualiser" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de charger les résultats.")
  expect(screen.queryByRole("table")).not.toBeInTheDocument()
  expect(screen.queryByRole("link", { name: "Exporter les notes (CSV)" })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
  expect(await screen.findByRole("table")).toBeVisible()
})

it("ignores a late response for the previous class", async () => {
  let resolveOld!: (value: unknown) => void
  const old = new Promise(resolve => { resolveOld = resolve })
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => url.includes("/4/") ? old : json(data({ assignment_id: 5, students: [student(5, "Autre classe", 80, false)] }))))
  const view = wrap()
  view.rerender(<ChakraProvider value={system}><Results assignmentId={5} /></ChakraProvider>)
  expect(await screen.findByText("Autre classe")).toBeVisible()
  await act(async () => { resolveOld(json(data())); await old })
  expect(screen.queryByText("Yasmine")).not.toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Exporter les notes (CSV)" })).toHaveAttribute("href", "/api/v1/teacher/classes/5/results/export.csv?threshold=50")
})
