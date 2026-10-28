import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { ClassTimeline, TIMELINE_REFRESH_MS, type Timeline } from "./ClassTimeline"

const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString()

function timeline(overrides: Partial<Timeline> = {}): Timeline {
  return {
    generated_at: new Date().toISOString(), assignment_id: 7, student_count: 10, block_minutes: 15, next_block_id: 2,
    blocks: [
      { chapter_id: 1, position: 1, module: "Module SQL", title: "Le grain", open: true, opened_at: minutesAgo(18), mission_count: 2, bonus_count: 1, duration_minutes: 15, completed_students: 4, help_pending: 1 },
      { chapter_id: 2, position: 2, module: "Module SQL", title: "Les fenêtres", open: false, opened_at: null, mission_count: 2, bonus_count: 0, duration_minutes: 15, completed_students: 0, help_pending: 0 },
    ],
    help: [{ id: 9, student: "salma", mission_version_id: 3, mission: "Pourquoi 70 DH", block: "Le grain", message: "Le total change", created_at: minutesAgo(3) }],
    missions: [{ mission_version_id: 3, title: "Pourquoi 70 DH", block: "Le grain", bonus: false, completed: 4, attempts: 17, hints: 6, stuck: ["youssef"] }],
    ...overrides,
  }
}

beforeEach(() => { document.cookie = `academy_csrf=${"C".repeat(43)}; Path=/` })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it("shows the blocks in order, the teacher-only 15-minute landmark, help requests and stuck students", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(timeline())))
  wrap(<ClassTimeline assignmentId={7} />)
  const list = await screen.findByRole("list", { name: "Blocs de la journée" })
  const items = within(list).getAllByRole("listitem")
  expect(items[0]).toHaveTextContent("Le grain")
  expect(items[0]).toHaveTextContent("4 / 10 terminé")
  expect(items[0]).toHaveTextContent("1 demande d’aide")
  expect(items[1]).toHaveTextContent("Fermé")
  expect(screen.getByText(/ouvert depuis 18 min/)).toBeInTheDocument()
  expect(screen.getByText(/dépassé, rien ne se ferme automatiquement/)).toBeInTheDocument()
  expect(screen.getByText("« Le total change »")).toBeInTheDocument()
  expect(screen.getByRole("table", { name: "Statistiques par mission" })).toHaveTextContent("youssef")
})

it("opens the next block and handles a help request with CSRF, then refreshes", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST" && url.endsWith("/blocks/open-next")) return json({ chapter_id: 2, title: "Les fenêtres", open: true })
    if (init?.method === "POST" && url.endsWith("/help/9/handle")) return json({ id: 9, status: "handled" })
    return json(timeline())
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<ClassTimeline assignmentId={7} />)
  fireEvent.click(await screen.findByRole("button", { name: "Ouvrir le bloc suivant : Les fenêtres" }))
  expect(await screen.findByText("Bloc « Les fenêtres » ouvert pour toute la classe.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Marquer comme traitée" }))
  expect(await screen.findByText("Demande de salma marquée comme traitée.")).toBeInTheDocument()
  const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")
  expect(posts.map(([url]) => String(url))).toEqual(["/api/v1/teacher/classes/7/blocks/open-next", "/api/v1/teacher/help/9/handle"])
  expect(posts.every(([, init]) => init.headers["X-CSRF-Token"] === "C".repeat(43))).toBe(true)
})

it("polls at most every 10 seconds", async () => {
  vi.useFakeTimers()
  const fetchMock = vi.fn().mockResolvedValue(json(timeline({ next_block_id: null })))
  vi.stubGlobal("fetch", fetchMock)
  wrap(<ClassTimeline assignmentId={7} />)
  await act(async () => { await Promise.resolve() })
  const before = fetchMock.mock.calls.length
  await act(async () => { vi.advanceTimersByTime(TIMELINE_REFRESH_MS) })
  expect(TIMELINE_REFRESH_MS).toBeLessThanOrEqual(10000)
  expect(fetchMock.mock.calls.length).toBeGreaterThan(before)
})
