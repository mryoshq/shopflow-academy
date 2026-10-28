import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { ApiError, retryAfter } from "../api"
import { parseList } from "../studio/AttemptRulesPanel"
import { MissionPlayer } from "./MissionPlayer"
import { StudentDashboard } from "./StudentDashboard"
import type { Dashboard, PlayerDefinition, PlayerMission } from "./types"

const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const base: PlayerDefinition = {
  kind: "single_choice", scenario: "Une commande fictive à Tanzar.", instructions: "Que faites-vous ?",
  choices: [{ id: "c1", label: "Agréger avant la jointure" }, { id: "c2", label: "SUM(DISTINCT)" }],
  match_targets: [], display_data: null, resources: [], hint_count: 2, estimated_duration_minutes: 10,
}
const rules = { next_attempt: 2, next_percent: 70, pause_remaining: 0, reading_seconds: null, reading_remaining: 0 }
function mission(overrides: Partial<PlayerMission> = {}): PlayerMission {
  return {
    mission_version_id: 11, release_id: 3, course_title: "Démonstration", is_demo: true, module: "Module", chapter: "Bloc", title: "Frais",
    position: 1, total: 3, previous_id: null, next_id: 12, ai_enabled: false, paused: false, status: "in_progress", locked_by: [],
    definition: base, hints: [], hint_count: 2, attempts_count: 1, last_attempt: null, explanation: null,
    score: { best: 0, possible: 10, bonus: false }, rules, ...overrides,
  }
}

beforeEach(() => { sessionStorage.clear(); localStorage.clear() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it("reads the waiting time sent with a 429", () => {
  expect(retryAfter(new ApiError(429, "pause", { code: "pause", retry_after: 12 }), "pause")).toBe(12)
  expect(retryAfter(new ApiError(429, "pause", { code: "reading", retry_after: 5 }), "pause")).toBeNull()
  expect(retryAfter(new ApiError(429, "too many attempts"))).toBeNull()
  expect(retryAfter(new ApiError(409, "x", { retry_after: 3 }))).toBeNull()
  expect(parseList("100, 70; 50")).toEqual([100, 70, 50])
  expect(parseList("100, soixante")).toBeNull()
})

it("announces the percentage of the next attempt, then counts the pause down after an error", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/attempts") && init?.method === "POST") return json({
      attempt_id: 5, correct: false, replayed: false, attempts_count: 2, points: 0, percent: 70, attempt_number: 2,
      score: { best: 0, possible: 10, bonus: false }, feedback: [], explanation: null,
      rules: { ...rules, next_attempt: 3, next_percent: 50, pause_remaining: 10 },
    }, 201)
    return json(mission())
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<MissionPlayer missionId={11} navigate={vi.fn()} />)
  expect(await screen.findByText("Essai 2 : jusqu’à 70 % des points")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("radio", { name: /SUM\(DISTINCT\)/ }))
  fireEvent.click(screen.getByRole("button", { name: "Tester ma décision" }))
  expect(await screen.findByText("Presque ! Réessayez")).toBeInTheDocument()
  expect(screen.getByText("Pause de 10 s : relisez la situation.")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Voir un indice" })).toBeInTheDocument()
  const again = screen.getByRole("button", { name: "Réessayer dans 10 s" })
  expect(again).toBeDisabled()
  await act(async () => { await vi.advanceTimersByTimeAsync(10_500) })
  expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled()
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
  expect(screen.getByText("Essai 3 : jusqu’à 50 % des points")).toBeInTheDocument()
})

it("a refused attempt during the pause starts the countdown from the server's time", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/attempts") && init?.method === "POST") return json({ detail: { code: "pause", retry_after: 7, message: "Pause" } }, 429)
    return json(mission())
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<MissionPlayer missionId={11} navigate={vi.fn()} />)
  fireEvent.click(await screen.findByRole("radio", { name: /SUM\(DISTINCT\)/ }))
  fireEvent.click(screen.getByRole("button", { name: "Tester ma décision" }))
  expect(await screen.findByText("Pause de 7 s : relisez la situation.")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Tester ma décision" })).toBeDisabled()
})

it("a lesson waits for the reading time before « J'ai compris »", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const lesson = mission({ status: "not_started", definition: { ...base, kind: "lesson", scenario: "", instructions: "", choices: [], body: "Le grain d'une table." },
    rules: { next_attempt: null, next_percent: null, pause_remaining: 0, reading_seconds: 20, reading_remaining: 20 } })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(lesson)))
  wrap(<MissionPlayer missionId={11} navigate={vi.fn()} />)
  const button = await screen.findByRole("button", { name: "J’ai compris" })
  expect(button).toBeDisabled()
  expect(screen.getByRole("progressbar", { name: "Temps de lecture" })).toHaveAttribute("aria-valuenow", "0")
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(Number(screen.getByRole("progressbar", { name: "Temps de lecture" }).getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(45)
  await act(async () => { await vi.advanceTimersByTimeAsync(10_500) })
  expect(screen.getByRole("button", { name: "J’ai compris" })).toBeEnabled()
  expect(screen.queryByRole("progressbar")).toBeNull()
})

it("the dashboard shows the teacher's announcement until the student acknowledges it", async () => {
  const dashboard: Dashboard = { display_name: "demo.etudiant01", ai_enabled: false, courses: [{
    release_id: 3, title: "Démonstration", description: "", version: 1, is_demo: true, resources: [], paused: false,
    score: { core_points: 0, core_possible: 30, bonus_points: 0, bonus_possible: 0, completed: 0, total: 3 }, missions: [],
    rules_notice: { text: "Nouvelle règle : chaque essai compte.", since: "2026-10-28T12:00:00+00:00" },
  }] }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(dashboard)))
  wrap(<StudentDashboard navigate={vi.fn()} />)
  expect(await screen.findByText("Nouvelle règle : chaque essai compte.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "J’ai compris" }))
  expect(screen.queryByText("Nouvelle règle : chaque essai compte.")).toBeNull()
  cleanup()
  wrap(<StudentDashboard navigate={vi.fn()} />)
  await screen.findByRole("heading", { name: "Démonstration" })
  expect(screen.queryByText("Nouvelle règle : chaque essai compte.")).toBeNull()
})
