import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { setLanguage } from "../i18n"
import { blockPoints } from "../student/StudentDashboard"
import type { DashboardBlock } from "../student/types"
import { Results, type ResultsData } from "../teacher/Results"
import { GradeSettings } from "./GradeSettings"
import type { FinalGrade, GradingConfig } from "./FinalGrade"

/** ADR-0046: block points, final grade in Résultats, Réglages > Notes. */
const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
beforeEach(() => { document.cookie = `academy_csrf=${"E".repeat(43)}; Path=/` })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const block = (patch: Partial<DashboardBlock>): DashboardBlock => ({ id: 1, title: "Bloc", open: true, mission_count: 0, bonus_count: 0, completed_count: 0,
  done: false, mission_ids: [], ...patch })

it("block counters show points: main, bonus, both, and « Leçons » for lessons only", () => {
  expect(blockPoints(block({ mission_count: 3, points: 4, possible: 10 }))).toBe("4 / 10 pts")
  expect(blockPoints(block({ bonus_count: 2, bonus_points: 0, bonus_possible: 6 }))).toBe("0 / 6 pts bonus")
  expect(blockPoints(block({ mission_count: 1, points: 7.5, possible: 10, bonus_count: 1, bonus_points: 2, bonus_possible: 4 }))).toBe("7,5 / 10 pts · 2 / 4 pts bonus")
  expect(blockPoints(block({ lesson_count: 3, lessons_read: 1 }))).toBe("Leçons")
  expect(blockPoints(block({ mission_count: 1, points: 0, possible: 5, lesson_count: 2, lessons_read: 1 }))).toBe("0 / 5 pts · leçons lues 1/2")
  setLanguage("en")
  try { expect(blockPoints(block({ bonus_count: 1, bonus_points: 1, bonus_possible: 6 }))).toBe("1 / 6 bonus pts") } finally { setLanguage("fr") }
})

const CONFIG: GradingConfig = { weights: { course: 30, workshops: 20, project: 50 }, cap: 20, project_bonus_max: 1, course_bonus_max: 1,
  workshop_modules: null, visible_to_students: false }
const final = (patch: Partial<FinalGrade> = {}): FinalGrade => ({
  parts: { course: { points: 7.5, possible: 10, on20: 15, pending: false, weight: 30 }, workshops: { points: 10, possible: 10, on20: 20, pending: false, weight: 20 },
    project: { points: 16, possible: 20, on20: 16, pending: false, weight: 50 } },
  base: 16.5, project_bonus: 0.5, course_bonus: 0.5, course_bonus_points: 3, course_bonus_possible: 6, raw: 17.5, final: 17.5, capped: false, provisional: false, pending: [], ...patch })

it("Résultats: final grade on 20 with each component, « en attente » and « provisoire », and its own export", async () => {
  const waiting = final({ parts: { ...final().parts, project: { points: null, possible: 20, on20: null, pending: true, weight: 50 } },
    base: 17, project_bonus: 0, raw: 17.5, final: 17.5, provisional: true, pending: ["project"] })
  const body: ResultsData = { assignment_id: 4, cohort: "Classe", course_title: "Cours", version: 2, threshold: 50, grading: CONFIG, weakest_missions: [],
    students: [{ id: 1, display_name: "Alice", core_points: 7.5, core_possible: 10, bonus_points: 3, percentage: 75, needs_support: false, completed: 1, total: 1,
      unsuccessful_count: 0, unsuccessful_missions: [], final_grade: final() },
    { id: 2, display_name: "Yasmine", core_points: 7.5, core_possible: 10, bonus_points: 3, percentage: 75, needs_support: false, completed: 1, total: 1,
      unsuccessful_count: 0, unsuccessful_missions: [], final_grade: waiting }] }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(body)))
  wrap(<Results assignmentId={4} />)
  const table = await screen.findByRole("region", { name: "Note finale de la classe" })
  const [, alice, yasmine] = within(table).getAllByRole("row")
  expect(alice).toHaveTextContent("17,5 / 20")
  expect(within(yasmine).getByText("en attente")).toBeInTheDocument()
  expect(within(yasmine).getByText("provisoire")).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Note finale sur 20" }).parentElement).toHaveTextContent("provisoire")
  expect(screen.getByText(/30 % cours \+ 20 % ateliers \+ 50 % CampusEquip/)).toBeInTheDocument()
  fireEvent.click(within(alice).getByRole("button", { name: "Détail de la note de Alice" }))
  expect(screen.getByText("Détail : Alice")).toBeInTheDocument()
  const detail = screen.getByTestId("final-breakdown")
  expect(within(detail).getByText("16,5 / 20")).toBeInTheDocument()  // base
  expect(within(detail).getAllByText("+0,5")).toHaveLength(2)  // project and course bonus
  expect(within(detail).getByText("Arrondie à 0,25 près.")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Exporter la note finale (CSV)" })).toHaveAttribute("href", "/api/v1/teacher/classes/4/results/final.csv")
})

it("Réglages > Notes: weights must make 100 %, workshop modules are chosen, visibility is saved", async () => {
  const settings = { config: CONFIG, defaults: CONFIG, modules: [{ title: "Axe 1", workshop: false, open: true }, { title: "Ateliers SQL", workshop: true, open: false }] }
  const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => init?.method === "PUT"
    ? json({ ...settings, config: JSON.parse(String(init.body)) }) : json(settings))
  vi.stubGlobal("fetch", fetchMock)
  wrap(<GradeSettings assignmentId={4} />)
  expect(await screen.findByRole("checkbox", { name: "Ateliers SQL (pas encore ouvert)" })).toBeChecked()
  fireEvent.change(screen.getByLabelText(/Cours, en %/), { target: { value: "40" } })
  expect(screen.getByText("Total : 110 %")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/Ateliers, en %/), { target: { value: "10" } })
  fireEvent.change(screen.getByLabelText(/Plafond/), { target: { value: "19,5" } })
  fireEvent.click(screen.getByText("Axe 1"))
  fireEvent.click(screen.getByText("Afficher la note finale aux étudiants"))
  // The state of the controlled components (not only the native input) must have followed.
  const root = (name: string) => screen.getByText(name).closest("[data-part='root']")!
  await vi.waitFor(() => expect(root("Axe 1")).toHaveAttribute("data-state", "checked"))
  await vi.waitFor(() => expect(root("Afficher la note finale aux étudiants")).toHaveAttribute("data-state", "checked"))
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
  await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true))
  const sent = JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")![1].body))
  expect(sent).toEqual({ weights: { course: 40, workshops: 10, project: 50 }, cap: 19.5, project_bonus_max: 1, course_bonus_max: 1,
    workshop_modules: ["Ateliers SQL", "Axe 1"], visible_to_students: true })
  expect(fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")![0]).toBe("/api/v1/teacher/classes/4/grading")
  expect(await screen.findByText("Réglages des notes enregistrés.")).toBeInTheDocument()
})
