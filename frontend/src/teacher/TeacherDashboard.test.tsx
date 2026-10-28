import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { REFRESH_MS, TeacherDashboard, type Overview } from "./TeacherDashboard"

const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const wrap = () => render(<ChakraProvider value={system}><TeacherDashboard /></ChakraProvider>)

function overview(patch: Partial<Overview> = {}): Overview {
  return {
    generated_at: new Date().toISOString(), assignment_id: 4, cohort: "Cohorte démo", course_title: "Démonstration", version: 1, paused: false,
    missions: [{ mission_version_id: 11, title: "Frais" }],
    students: [
      { id: 1, display_name: "demo.etudiant01", completed: 1, total: 3, core_points: 10, core_possible: 30, bonus_points: 0, attempts: 4, hints: 1,
        current_mission: "Frais", last_activity: new Date().toISOString(), active: true, needs_help: [] },
      { id: 2, display_name: "demo.etudiant02", completed: 0, total: 3, core_points: 0, core_possible: 30, bonus_points: 0, attempts: 3, hints: 2,
        current_mission: "Frais", last_activity: new Date().toISOString(), active: true, needs_help: ["Frais"] },
    ], ...patch,
  }
}

beforeEach(() => { document.cookie = `academy_csrf=${"C".repeat(43)}; Path=/` })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it("shows the class, flags students who need help and polls every few seconds", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  let polls = 0
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith("/teacher/classes")) return json([{ id: 4, cohort: "Cohorte démo", course_title: "Démonstration", version: 1, paused: false, student_count: 2 }])
    if (url.endsWith("/overview")) { polls += 1; return json(overview()) }
    if (url.endsWith("/interventions")) return json([{ id: 9, action: "mission.unlock", actor: "demo.enseignant", created_at: new Date().toISOString(), details: { student: "demo.etudiant02", mission: "Frais" } }])
    throw new Error(url)
  }))
  wrap()
  expect(await screen.findByText("demo.etudiant02")).toBeInTheDocument()
  expect(screen.getByText("Besoin d’aide", { selector: "span" })).toBeInTheDocument()
  expect(screen.getByText("Mission débloquée : « Frais » pour demo.etudiant02")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Exporter les notes (CSV)" })).toHaveAttribute("href", "/api/v1/teacher/classes/4/export.csv")
  const before = polls
  await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_MS + 50) })
  expect(polls).toBeGreaterThan(before)
  expect(REFRESH_MS).toBeLessThanOrEqual(10_000)
})

it("pauses the sequence with CSRF and unlocks a mission from the student detail", async () => {
  const calls: { url: string; method?: string; headers?: Record<string, string>; body?: string }[] = []
  let paused = false
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method, headers: init?.headers as Record<string, string>, body: init?.body as string })
    if (url.endsWith("/teacher/classes")) return json([{ id: 4, cohort: "Cohorte démo", course_title: "Démonstration", version: 1, paused, student_count: 2 }])
    if (url.endsWith("/overview")) return json(overview({ paused }))
    if (url.endsWith("/interventions")) return json([])
    if (url.endsWith("/pause")) { paused = true; return json({ paused: true }) }
    if (url.endsWith("/students/2")) return json({ id: 2, display_name: "demo.etudiant02", attempts: [], missions: [
      { mission_version_id: 13, title: "Ordre", status: "locked", locked_by: ["CSV"], unlocked_by_teacher: false, best_points: 0, possible: 10, bonus: false, attempts: 0, hints: 0 }] })
    if (url.endsWith("/unlocks")) return json({ id: 1, created: true }, 201)
    throw new Error(url)
  }))
  wrap()
  const pause = await screen.findByRole("button", { name: "Mettre en pause" })
  await act(async () => { fireEvent.click(pause) })
  expect(await screen.findByRole("button", { name: "Reprendre la séquence" })).toBeInTheDocument()
  const pauseCall = calls.find((call) => call.url.endsWith("/pause"))
  expect(pauseCall?.method).toBe("POST")
  expect(pauseCall?.headers?.["X-CSRF-Token"]).toBe("C".repeat(43))
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Détail de demo.etudiant02" })) })
  const unlock = await screen.findByRole("button", { name: "Débloquer pour cet étudiant" })
  await act(async () => { fireEvent.click(unlock) })
  const unlockCall = calls.find((call) => call.url.endsWith("/unlocks"))
  expect(JSON.parse(unlockCall!.body!)).toEqual({ user_id: 2, mission_version_id: 13 })
  expect(await screen.findByText("« Ordre » débloquée pour demo.etudiant02.")).toBeInTheDocument()
})

it("explains the empty state", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])))
  wrap()
  expect(await screen.findByText("Aucune classe à suivre")).toBeInTheDocument()
})
