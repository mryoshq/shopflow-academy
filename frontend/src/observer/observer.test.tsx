import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { App } from "../App"
import { ObserversPanel } from "../teacher/ObserversPanel"

const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
const course = { title: "Démonstration", description: "", show_answers: false, corrections: {}, modules: [{ id: 1, title: "Module", sort_order: 0, chapters: [{ id: 2, title: "Bloc 1", sort_order: 0,
  missions: [{ id: 5, title: "Frais gonflés", sort_order: 0, mission_version_id: 11, definition: { kind: "single_choice", scenario: "Situation.", instructions: "Que faites-vous ?",
    choices: [{ id: "c1", label: "Agréger avant" }, { id: "c2", label: "SUM(DISTINCT)" }], match_targets: [], display_data: null, resources: [], hints: [], estimated_duration_minutes: 5 } }] }] }] }
const progress = { generated_at: new Date().toISOString(), paused: false, named: false, students: [
  { position: 1, display_name: "Étudiant 1", completed: 1, total: 3, lessons_read: 0, lessons_total: 1, core_points: 10, core_possible: 25, bonus_points: 0, attempts: 2, current_mission: "Frais gonflés", active: true, needs_help: [] }] }

beforeEach(() => { document.cookie = `academy_csrf=${"D".repeat(43)}; Path=/` })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it("an observer signs in to a read-only space: banner, course preview without answers, anonymised progress, no bell", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith("/auth/me")) return json({ id: 9, username: "inspection.b3", role: "observer" })
    if (url.endsWith("/observer/me")) return json({ owner: "demo.enseignant", named: false, show_answers: false })
    if (url.endsWith("/observer/classes")) return json([{ id: 7, cohort: "Classe B3", course_title: "Démonstration", version: 1, paused: false, student_count: 10 }])
    if (url.endsWith("/observer/classes/7/course")) return json(course)
    if (url.endsWith("/observer/classes/7/progress")) return json(progress)
    throw new Error(`Unexpected ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<App />)
  expect(await screen.findByRole("heading", { name: "Espace observateur" })).toBeInTheDocument()
  expect(screen.getByRole("note")).toHaveTextContent("lecture seule")
  expect(screen.getByRole("note")).toHaveTextContent("visibles par l’enseignant")
  expect(screen.getByText("Observateur (lecture seule)")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /Notifications/ })).not.toBeInTheDocument()
  expect(await screen.findByText("Vue étudiante : les corrigés ne sont pas affichés.", { exact: false })).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Simuler cette réponse" })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("tab", { name: "Progression" }))
  const table = await screen.findByRole("table", { name: "Progression de la classe" })
  expect(within(table).getByText("Étudiant 1 · actif")).toBeInTheDocument()
  // Only GET requests: an observer never writes (presence, notifications, attempts).
  expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true)
})

it("the teacher creates an observer, sees the password once, changes options and reads the consultations", async () => {
  let observers: object[] = []
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/teacher/observers") && init?.method === "POST") {
      const body = JSON.parse(String(init.body))
      observers = [{ id: 9, username: body.username, enabled: true, show_answers: body.show_answers, named: body.named, created_at: null }]
      return json({ ...observers[0], password: "abcd-efgh-jkmn" }, 201)
    }
    if (url.endsWith("/teacher/observers/9") && init?.method === "PATCH") return json({ ...observers[0], ...JSON.parse(String(init.body)) })
    if (url.endsWith("/teacher/observers")) return json(observers)
    if (url.endsWith("/teacher/observers/views")) return json([{ id: 1, observer: "inspection.b3", view: "results.csv", assignment_id: 7, details: {}, created_at: new Date().toISOString() }])
    throw new Error(`Unexpected ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<ObserversPanel />)
  expect(await screen.findByText("Export CSV des résultats")).toBeInTheDocument()
  fireEvent.change(screen.getByRole("textbox", { name: /Identifiant de l’observateur/ }), { target: { value: "inspection.b3" } })
  fireEvent.click(screen.getByRole("checkbox", { name: /Afficher les noms/ }))
  fireEvent.click(screen.getByRole("button", { name: "Créer le compte" }))
  expect(await screen.findByText("abcd-efgh-jkmn")).toBeInTheDocument()
  expect(JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1].body))).toEqual({ username: "inspection.b3", show_answers: false, named: true })
  fireEvent.click(screen.getByRole("button", { name: "Masquer" }))
  expect(screen.queryByText("abcd-efgh-jkmn")).not.toBeInTheDocument()
  fireEvent.click(await screen.findByRole("button", { name: "Désactiver inspection.b3" }))
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/teacher/observers/9", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ enabled: false }) })))
})
