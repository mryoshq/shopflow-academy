import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { AutoPlanPanel, LivePanel, visibleBlocks, type Live } from "../teacher/LivePanel"
import { NotificationBell, NotificationProvider, groupNotes, type Note } from "./notifications"

const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const note = (id: number, kind: string, text: string, minutesAgo = 0, read = false): Note => ({
  id, kind, text, data: {}, sender: kind === "message" ? "demo.enseignant" : null,
  created_at: new Date(Date.now() - minutesAgo * 60000).toISOString(), read_at: read ? new Date().toISOString() : null,
})

beforeEach(() => { sessionStorage.clear(); localStorage.clear() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it("groups notifications of the same type within 5 minutes, never teacher messages", () => {
  const groups = groupNotes([note(5, "help", "A", 0), note(4, "help", "B", 2), note(3, "help", "C", 9), note(2, "message", "M1"), note(1, "message", "M2")])
  expect(groups.map((g) => [g.kind, g.items.length])).toEqual([["help", 2], ["help", 1], ["message", 1], ["message", 1]])
})

const live: Live = {
  generated_at: "", assignment_id: 7, online_count: 1, student_count: 2,
  blocks: [1, 2, 3, 4, 5].map((n) => ({ chapter_id: n, position: n, title: `Bloc ${n}`, module: "M", open: n <= 2, mission_count: 2 })),
  students: [
    { id: 11, name: "demo.etudiant01", online: true, seen_at: new Date().toISOString(), mission: "Frais", help: true, fast_attempts: 2,
      cells: [{ chapter_id: 1, state: "done", done: 2, total: 2, for_student: false }, { chapter_id: 2, state: "in_progress", done: 1, total: 2, for_student: false },
        { chapter_id: 3, state: "not_started", done: 0, total: 2, for_student: true }, { chapter_id: 4, state: "closed", done: 0, total: 2, for_student: false },
        { chapter_id: 5, state: "closed", done: 0, total: 2, for_student: false }] },
    { id: 12, name: "demo.etudiant02", online: false, seen_at: null, mission: null, help: false, fast_attempts: 0,
      cells: [1, 2, 3, 4, 5].map((n) => ({ chapter_id: n, state: n <= 2 ? "not_started" as const : "closed" as const, done: 0, total: 2, for_student: false })) },
  ],
}

it("shows open blocks, blocks opened for one student and the next two closed ones", () => {
  expect(visibleBlocks(live, false).map((b) => b.chapter_id)).toEqual([1, 2, 3, 4, 5])
  const more = { ...live, blocks: [...live.blocks, { chapter_id: 6, position: 6, title: "Bloc 6", module: "M", open: false, mission_count: 1 }] }
  expect(visibleBlocks(more, false).map((b) => b.chapter_id)).toEqual([1, 2, 3, 4, 5])
  expect(visibleBlocks(more, true)).toHaveLength(6)
})

it("live grid: presence, help, states with text, and a closed cell opens the block for one student", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/unlock") && init?.method === "POST") return json({ unlocked: true, changed: true })
    if (url.endsWith("/messages")) return json([])
    return json(live)
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<LivePanel assignmentId={7} />)
  expect(await screen.findByText("1 en ligne sur 2 · mis à jour toutes les 5 s")).toBeInTheDocument()
  const row = screen.getByRole("row", { name: /demo\.etudiant01/ })
  expect(within(row).getByText("en ligne")).toBeInTheDocument()
  expect(within(row).getByText("Aide")).toBeInTheDocument()
  expect(within(row).getByText("Clics rapides : 2")).toBeInTheDocument()
  expect(within(row).getByRole("img", { name: "demo.etudiant01, Bloc 1 : terminé" })).toBeInTheDocument()
  expect(within(row).getByRole("img", { name: "demo.etudiant01, Bloc 2 : en cours (1 sur 2)" })).toBeInTheDocument()
  expect(within(row).getByRole("button", { name: /Bloc 3 : pas commencé, ouvert pour lui\. Retirer/ })).toBeInTheDocument()
  fireEvent.click(within(row).getByRole("button", { name: /Bloc 4 : fermé\. Ouvrir ce bloc pour demo\.etudiant01/ }))
  expect(await screen.findByText("« Bloc 4 » ouvert pour demo.etudiant01.")).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/teacher/classes/7/blocks/4/students/11/unlock", expect.objectContaining({ method: "POST" }))
  // Message: 280 characters at most, counter shown, sent to the class.
  const box = screen.getByRole("textbox", { name: "Texte du message" })
  expect(box).toHaveAttribute("maxLength", "280")
  fireEvent.change(box, { target: { value: "Pause de 5 minutes." } })
  expect(screen.getByText("19 / 280")).toBeInTheDocument()
})

it("a new notification raises a toast for 10 s, « J’ai lu » sends the read receipt, a block opening refreshes the page", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  let feed: Note[] = [note(1, "message", "Ancien message", 30, true)]
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/read") && init?.method === "POST") return json({ id: 2, read_at: "now" })
    if (url.includes("/presence")) return json({ interval_seconds: 30, unread: 0 })
    const after = Number(/after=(\d+)/.exec(url)?.[1] ?? 0)
    const items = feed.filter((item) => item.id > after)
    return json({ unread: items.filter((i) => !i.read_at).length, items })
  })
  vi.stubGlobal("fetch", fetchMock)
  const refreshed = vi.fn()
  window.addEventListener("academy:refresh", refreshed)
  wrap(<NotificationProvider heartbeat><NotificationBell /></NotificationProvider>)
  await act(async () => { await vi.advanceTimersByTimeAsync(100) })
  expect(screen.queryByText("Ancien message")).not.toBeInTheDocument() // history only, no toast
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/presence", expect.objectContaining({ method: "POST" }))
  feed = [note(3, "block_open", "Le bloc « Jointures » est ouvert."), note(2, "message", "Pause de 5 minutes."), ...feed]
  await act(async () => { await vi.advanceTimersByTimeAsync(8_100) })
  expect(screen.getByText("Pause de 5 minutes.")).toBeInTheDocument()
  expect(refreshed).toHaveBeenCalled()
  const toasts = screen.getByRole("region", { name: "Notifications récentes" })
  fireEvent.click(within(toasts).getAllByRole("button", { name: "J’ai lu" })[0])
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/notifications/2/read", expect.objectContaining({ method: "POST" }))
  await act(async () => { await vi.advanceTimersByTimeAsync(10_500) })
  expect(within(screen.getByRole("region", { name: "Notifications récentes" })).queryByText("Le bloc « Jointures » est ouvert.")).not.toBeInTheDocument()
  // The bell keeps the history.
  fireEvent.click(screen.getByRole("button", { name: /Notifications/ }))
  const history = screen.getByRole("dialog", { name: "Historique des notifications" })
  expect(within(history).getByText("Ancien message", { exact: false })).toBeInTheDocument()
  window.removeEventListener("academy:refresh", refreshed)
})

it("automatic opening: the weighted plan is shown before activation", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/auto/preview")) return json({ items: [{ chapter_id: 1, title: "Jointures", minutes: 20, at: "2026-10-28T14:00:00Z" }], end_at: "" })
    if (url.endsWith("/auto/activate")) return json({ enabled: true, paused: false, end_at: "2026-10-28T16:00:00Z", proposal: [], server_time: "",
      items: [{ chapter_id: 1, title: "Jointures", minutes: 20, at: "2026-10-28T14:00:00Z", opened: false }] })
    void init
    return json({ enabled: false, paused: false, end_at: null, items: [], proposal: [], server_time: "" })
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<AutoPlanPanel assignmentId={7} />)
  expect(await screen.findByText("Désactivée")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Voir le planning" }))
  expect(await screen.findByText("Jointures")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Activer ce planning" }))
  expect(await screen.findByText("Ouverture automatique activée.")).toBeInTheDocument()
  expect(screen.getByText("Active")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Mettre en pause" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Ouvrir le suivant maintenant" })).toBeInTheDocument()
})

it("a block opened before the first load (first batch) still refreshes the dashboard", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => json({ unread: 1, items: [note(9, "block_open", "Le bloc « Jointures » est ouvert.")] })))
  const refreshed = vi.fn()
  window.addEventListener("academy:refresh", refreshed)
  wrap(<NotificationProvider><NotificationBell /></NotificationProvider>)
  await vi.waitFor(() => expect(refreshed).toHaveBeenCalled())
  window.removeEventListener("academy:refresh", refreshed)
})

it("permission already granted without a Web Push subscription: the activation can still be finished", async () => {
  vi.stubGlobal("Notification", Object.assign(vi.fn(), { permission: "granted", requestPermission: vi.fn(async () => "granted") }))
  vi.stubGlobal("PushManager", function PushManager() {})
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: vi.fn(async () => undefined), addEventListener: vi.fn(), removeEventListener: vi.fn() } })
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => url.includes("/push/key")
    ? json({ enabled: true, public_key: "BA" }) : json({ unread: 0, items: [] })))
  wrap(<NotificationProvider><NotificationBell /></NotificationProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "Notifications" }))
  expect(await screen.findByRole("button", { name: "Activer les notifications hors de l’onglet" })).toBeInTheDocument()
  Reflect.deleteProperty(navigator, "serviceWorker")
})

it("shows bonus progress without labelling optional work as required completion", async () => {
  const data: Live = { ...live, blocks: [{ ...live.blocks[0], bonus_only: true }], students: live.students.map((student, i) => ({ ...student, cells: [{ ...student.cells[0], state: "not_started", done: 0, total: 0, bonus_done: i ? 1 : 2, bonus_total: 2 }] })) }
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => json(url.endsWith("/messages") ? [] : data)))
  wrap(<LivePanel assignmentId={7} />)
  expect(await screen.findByText("Bonus facultatifs")).toBeInTheDocument()
  expect(screen.getByRole("img", { name: /demo.etudiant01, Bloc 1 : 2 \/ 2 bonus réussis/ })).toHaveTextContent("2 / 2 bonus réussis")
  expect(screen.getByRole("img", { name: /demo.etudiant02, Bloc 1 : 1 \/ 2 bonus réussis/ })).not.toHaveTextContent("fait")
})
