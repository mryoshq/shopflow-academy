import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { api } from "../api"
import { BlockStudents, BLOCK_STUDENTS_REFRESH_MS } from "./BlockStudents"
vi.mock("../api", () => ({ api: vi.fn() }))
const payload = { generated_at: "2026-11-01T23:30:00Z", students: [
  { id: 1, name: "Alice", online: false, seen_at: "2026-11-01T23:30:00Z", mission: "Frais", cells: [{ chapter_id: 7, state: "done", done: 2, total: 2 }] },
  { id: 2, name: "private@example.com", online: true, seen_at: null, mission: null, cells: [{ chapter_id: 7, state: "not_started", done: 0, total: 2 }] },
] }
function wrap(id = 4) { return <ChakraProvider value={system}><BlockStudents key={id} assignmentId={id} chapterId={7} title="SQL" completed={1} total={2} /></ChakraProvider> }
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })
it("loads on hover only, names states and historical pages, refreshes only while open", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true }); vi.mocked(api).mockResolvedValue(payload)
  const view = render(wrap()); expect(api).not.toHaveBeenCalled()
  fireEvent.mouseEnter(screen.getByRole("button")); expect(await screen.findByText("Alice · terminé (2/2)")).toBeInTheDocument()
  expect(screen.getByText("Dernière page observée : Frais")).toBeInTheDocument()
  expect(screen.queryByText(/private@example/)).not.toBeInTheDocument()
  expect(screen.getByText("Étudiant 2 · pas commencé (0/2)")).toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(BLOCK_STUDENTS_REFRESH_MS) }); expect(api).toHaveBeenCalledTimes(2)
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }); const before = vi.mocked(api).mock.calls.length
  await act(async () => { await vi.advanceTimersByTimeAsync(BLOCK_STUDENTS_REFRESH_MS * 2) }); expect(api).toHaveBeenCalledTimes(before)
  view.unmount()
})
it("opens on keyboard focus and touch/click, reports a failure and clears on class switch", async () => {
  vi.mocked(api).mockRejectedValue(new Error("offline"))
  const view = render(wrap()); fireEvent.focus(screen.getByRole("button"))
  expect(await screen.findByText("Impossible de charger le détail du bloc.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole("button", { name: /Progression du bloc SQL :/ })); await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument())
  view.rerender(wrap(8)); expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})
it("ignores a late response after switching class", async () => {
  let resolve!: (data: unknown) => void
  vi.mocked(api).mockImplementation(() => new Promise((done) => { resolve = done }))
  const view = render(wrap()); fireEvent.click(screen.getByRole("button")); view.rerender(wrap(8))
  await act(async () => resolve(payload)); expect(screen.queryByText(/Alice/)).not.toBeInTheDocument()
})

it("marks an old snapshot historical even when the next API read stays pending", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const iso = new Date().toISOString()
  vi.mocked(api).mockResolvedValueOnce({ ...payload, generated_at: iso, students: [{ ...payload.students[0], online: true, seen_at: iso }] }).mockImplementation(() => new Promise(() => {}))
  render(wrap()); fireEvent.focus(screen.getByRole("button"))
  expect(await screen.findByText("Page actuellement observée : Frais")).toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(76_000) })
  expect(screen.getByText("Dernière page observée : Frais")).toBeInTheDocument()
  expect(screen.getByText("Présence non confirmée")).toBeInTheDocument()
  expect(screen.queryByText("en ligne")).not.toBeInTheDocument()
})

it("labels optional bonus progress on keyboard focus without declaring the block completed", async () => {
  vi.mocked(api).mockResolvedValue({ ...payload, students: payload.students.map((student, i) => ({ ...student, cells: [{ chapter_id: 7, state: "not_started", done: 0, total: 0, bonus_done: i ? 1 : 2, bonus_total: 2 }] })) })
  render(<ChakraProvider value={system}><BlockStudents assignmentId={4} chapterId={7} title="Bonus A" completed={1} total={2} bonusOnly /></ChakraProvider>)
  const trigger = screen.getByRole("button", { name: /Bonus facultatifs du bloc Bonus A : 1 sur 2 ont réussi tous les bonus/ })
  expect(trigger).toHaveTextContent("1 / 2 ont réussi tous les bonus")
  fireEvent.focus(trigger)
  expect(await screen.findByText("Alice · 2 / 2 bonus réussis")).toBeInTheDocument()
  expect(screen.getByText("Étudiant 2 · 1 / 2 bonus réussis")).toBeInTheDocument()
  expect(screen.queryByText(/terminé/)).not.toBeInTheDocument()
})
