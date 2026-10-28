import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { LeaderboardNavigation, LeaderboardPage, type Board } from "./LeaderboardPage"

const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const row = (display_name: string, rank: number, is_self = false) => ({ display_name, rank, is_self, core_points: 15, bonus_points: 2, completed_blocks: 2, today_blocks: 1 })
const data = (patch: Partial<Board> = {}): Board => ({ settings: { enabled: true, top_three: false, hide_open_block: false }, hidden: false,
  display_name: "Atlas", day: "2026-10-28", timezone: "Africa/Casablanca", rows: [row("Atlas", 1, true), row("Rif", 1)], daily_rows: [row("Atlas", 1, true), row("Rif", 1)], ...patch })
const wrap = (role: "student" | "teacher" = "student") => render(<ChakraProvider value={system}><LeaderboardPage role={role} assignmentId={4} /></ChakraProvider>)

beforeEach(() => { document.cookie = `academy_csrf=${"C".repeat(43)}; Path=/`; window.location.hash = "" })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it("renders tied ranks, separate points and the caller's text marker; switches to daily progress", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(data())))
  wrap()
  const table = await screen.findByRole("table", { name: "Classement de la classe" })
  expect(within(table).getAllByText("Rang 1")).toHaveLength(2)
  expect(within(table).getByText("· Vous")).toBeInTheDocument()
  expect(within(table).getByRole("columnheader", { name: "Points bonus" })).toBeInTheDocument()
  expect(within(table).queryByRole("columnheader", { name: "Blocs terminés" })).toBeNull()
  fireEvent.click(screen.getByRole("tab", { name: "Progression du jour" }))
  expect(await screen.findByRole("table", { name: "Blocs terminés aujourd’hui" })).toBeVisible()
  expect(screen.getByText(/heure du Maroc/)).toBeVisible()
})

it("refreshes within 10 seconds and removes stale names when access becomes unavailable", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const fetcher = vi.fn().mockResolvedValueOnce(json(data())).mockResolvedValue(json({ detail: "off" }, 404))
  vi.stubGlobal("fetch", fetcher)
  wrap()
  expect(within(await screen.findByRole("table", { name: "Classement de la classe" })).getByText("Rif")).toBeVisible()
  await act(async () => { await vi.advanceTimersByTimeAsync(5_100) })
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(screen.queryByText("Rif")).not.toBeInTheDocument()
  expect(screen.getByRole("alert")).toHaveTextContent("n’est pas disponible")
})

it("shows the automatic name without any name field for students", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(data())))
  wrap()
  expect(within(await screen.findByRole("table", { name: "Classement de la classe" })).getByText("Atlas")).toBeVisible()
  expect(screen.queryByRole("textbox")).toBeNull()
  expect(screen.queryByRole("button", { name: "Enregistrer le nom" })).toBeNull()
})

it("lets the teacher enable a board that starts disabled", async () => {
  let enabled = false
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/settings")) { enabled = JSON.parse(String(init?.body)).enabled; return json({ enabled, top_three: false, hide_open_block: false }) }
    return json(data({ settings: { enabled, top_three: false, hide_open_block: false }, hidden: !enabled }))
  }))
  wrap("teacher")
  const toggle = await screen.findByRole("checkbox", { name: "Activer le classement" })
  expect(toggle).not.toBeChecked()
  expect(screen.queryByRole("table")).not.toBeInTheDocument()
  fireEvent.click(toggle)
  expect(await screen.findByRole("table", { name: "Classement de la classe" })).toBeVisible()
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
})

it("shows the open-block explanation and no rows in either tab", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(data({ hidden: true, rows: [], daily_rows: [] }))))
  wrap()
  expect(await screen.findByText(/masqué pendant un bloc ouvert/)).toBeVisible()
  expect(screen.queryByRole("table")).not.toBeInTheDocument()
  expect(screen.queryByRole("tab")).not.toBeInTheDocument()
})

it("does not offer the navigation entry to students when disabled", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])))
  render(<ChakraProvider value={system}><LeaderboardNavigation role="student"><p>Mon cours</p></LeaderboardNavigation></ChakraProvider>)
  expect(await screen.findByText("Mon cours")).toBeVisible()
  await act(async () => {})
  expect(screen.queryByRole("button", { name: "Classement" })).not.toBeInTheDocument()
})
