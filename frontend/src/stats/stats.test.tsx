import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { ClassStats, type ClassStatsData } from "./ClassStats"
import { parseRoute } from "../teacher/routes"

/** Issue #110: statistics for the teacher, the direction and the projector; aggregates only. */
const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
beforeEach(() => { document.cookie = `academy_csrf=${"E".repeat(43)}; Path=/` })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

const data = (mean?: number | null): ClassStatsData => ({
  course: { students: 10, mean_progress: 72.5, success_rate: 64, work_minutes_mean: 185, blocks_open: 40, blocks_total: 85, missions: 60, bonus_students: 4,
    course_title: "Python Data Engineering", cohort: "B3", modules: [{ label: "Module 1 : SQL", percent: 81 }] },
  project: { teams: 3, teams_of_2: 2, teams_of_3: 1, teams_other: 0, students_in_team: 7, students_without_team: 3, teams_with_deposit: 2, teams_without_deposit: 1, versions: 5,
    milestones: [{ title: "Rendu final", teams: 2, versions: 5 }],
    defences: { slots: 3, assigned: 3, done: 1, current: 1, upcoming: 1, graded_teams: 1, ...(mean === undefined ? {} : { mean_base: mean }) } },
  generated_at: "2026-11-23T10:00:00Z",
})

it("teacher route and figures; the average only when the server sends it", async () => {
  expect(parseRoute("#/statistiques")).toEqual({ view: "statistiques", sub: "", params: {} })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(data(15.25))))
  const view = wrap(<ClassStats path="/teacher/classes/7/stats" />)
  expect(await screen.findByRole("region", { name: "Équipes ayant déposé" })).toHaveTextContent("2 / 3")
  expect(screen.getByRole("region", { name: "Passées" })).toHaveTextContent("1 / 3")
  expect(screen.getByRole("region", { name: "Moyenne du projet" })).toHaveTextContent("15,25 / 20")
  expect(screen.getByText("2 / 3 équipes · 5 versions")).toBeInTheDocument()
  expect(screen.getByRole("region", { name: "Temps de travail" })).toHaveTextContent("3 h 05")
  view.unmount()
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(data())))
  wrap(<ClassStats path="/observer/classes/7/stats" />)
  await screen.findByRole("region", { name: "Équipes" })
  expect(screen.queryByRole("region", { name: "Moyenne du projet" })).toBeNull()
})

it("projection mode: large screen, refreshed every 30 s, Escape leaves", async () => {
  const fetchMock = vi.fn().mockResolvedValue(json(data(14)))
  vi.stubGlobal("fetch", fetchMock)
  wrap(<ClassStats path="/teacher/classes/7/stats" />)
  const button = await screen.findByRole("button", { name: "Mode projection" })
  vi.useFakeTimers({ shouldAdvanceTime: true })
  fireEvent.click(button)
  const projection = screen.getByRole("dialog", { name: "Statistiques en mode projection" })
  expect(within(projection).getByRole("heading", { level: 1, name: "Rapidfox Academy · Soutenances" })).toBeInTheDocument()
  expect(within(projection).getByRole("button", { name: "Quitter la projection" })).toHaveFocus()
  expect(within(projection).queryByRole("region", { name: "Moyenne du projet" })).toBeNull()
  const before = fetchMock.mock.calls.length
  await vi.advanceTimersByTimeAsync(30_000)
  expect(fetchMock.mock.calls.length).toBe(before + 1)
  vi.useRealTimers()
  fireEvent.keyDown(window, { key: "Escape" })
  expect(screen.queryByRole("dialog", { name: "Statistiques en mode projection" })).toBeNull()
})
