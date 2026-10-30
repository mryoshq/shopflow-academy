import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { NotificationProvider } from "../live/notifications"
import { TeacherApp } from "./TeacherApp"
import { Today, meanProgress, stuckStudents } from "./Today"
import { ClassTimeline, type Timeline } from "./ClassTimeline"
import { matches, viewItems } from "./CommandPalette"
import { formatRoute, initialRoute, parseRoute } from "./routes"

const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
beforeEach(() => { localStorage.clear(); document.cookie = `academy_csrf=${"F".repeat(43)}; Path=/`; window.history.replaceState(null, "", "/") })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const timeline: Timeline = {
  generated_at: "", assignment_id: 7, student_count: 10, block_minutes: 15, next_block_id: 2,
  blocks: [{ chapter_id: 1, position: 1, module: "SQL", title: "Jointures", open: true, opened_at: new Date(Date.now() - 6 * 60000).toISOString(), mission_count: 3, bonus_count: 0, duration_minutes: 15, completed_students: 4, help_pending: 1 },
    { chapter_id: 2, position: 2, module: "SQL", title: "Fenêtres", open: false, opened_at: null, mission_count: 2, bonus_count: 1, duration_minutes: 15, completed_students: 0, help_pending: 0 }],
  help: [{ id: 31, student: "demo.etudiant04", mission_version_id: 11, mission: "Frais gonflés", block: "Jointures", message: "Je bloque sur le grain.", created_at: new Date().toISOString() }],
  missions: [{ mission_version_id: 11, title: "Frais gonflés", block: "Jointures", bonus: false, completed: 4, attempts: 12, hints: 3, stuck: ["demo.etudiant04", "demo.etudiant02"] },
    { mission_version_id: 12, title: "Doublons", block: "Jointures", bonus: false, completed: 6, attempts: 8, hints: 1, stuck: ["demo.etudiant02"] }],
}

it("routes: one address per view and sub-view; the last view only for a resumed session", () => {
  expect(parseRoute("#/classe")).toEqual({ view: "classe", sub: "frise", params: {} })
  expect(parseRoute("#/classe/etudiants?eleve=12")).toEqual({ view: "classe", sub: "etudiants", params: { eleve: "12" } })
  expect(parseRoute("#/cours/apercu")?.sub).toBe("apercu")
  expect(parseRoute("#/classement/4")).toEqual({ view: "classement", sub: "4", params: {} })
  expect(parseRoute("#/cours/inconnu")).toBeNull()
  expect(parseRoute("#/mission/12")).toBeNull()
  expect(formatRoute({ view: "classe", sub: "aide", params: {} })).toBe("#/classe/aide")
  localStorage.setItem("shopflow:teacher:route", "#/resultats")
  expect(initialRoute("", true).view).toBe("resultats")
  expect(initialRoute("", false).view).toBe("aujourdhui")
  expect(initialRoute("#/projet", true).view).toBe("projet")
})

it("quick search matches views, students and blocks without accents", () => {
  const items = viewItems()
  expect(items.some((item) => item.label === "Ma classe · Difficultés")).toBe(true)
  expect(items.some((item) => item.route.view === "voyage")).toBe(true)  // in the menu since the integration (ADR-0033)
  expect(matches(items.find((item) => item.label === "Ma classe · Difficultés")!, "difficultes classe")).toBe(true)
})

it("« Aujourd’hui » fits the day on one screen and opens the next block", async () => {
  expect(meanProgress([{ completed: 1, total: 4, core_points: 0, core_possible: 0 }, { completed: 3, total: 4, core_points: 0, core_possible: 0 }])).toBe(50)
  expect(stuckStudents(timeline)).toEqual(["demo.etudiant02", "demo.etudiant04"])
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/open-next") && init?.method === "POST") return json({ title: "Fenêtres" })
    if (url.endsWith("/timeline")) return json(timeline)
    if (url.endsWith("/live")) return json({ online_count: 7, student_count: 10, blocks: [], students: [] })
    if (url.endsWith("/overview")) return json({ students: [{ completed: 2, total: 4, core_points: 5, core_possible: 20 }] })
    throw new Error(url)
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<Today username="demo.enseignant" assignmentId={7} />)
  await screen.findByText("Jointures")
  expect(screen.getByRole("region", { name: "Bloc ouvert" })).toHaveTextContent("Jointures")
  expect(screen.getByRole("region", { name: "Étudiants en ligne" }).textContent).toMatch(/7\s*\/\s*10/)
  expect(screen.getByRole("region", { name: "Demandes d’aide en attente" })).toHaveTextContent("demo.etudiant04 · Frais gonflés")
  expect(screen.getByRole("region", { name: "Étudiants bloqués" })).toHaveTextContent("2")
  expect(screen.getByRole("link", { name: "Voir les difficultés →" })).toHaveAttribute("href", "#/classe/difficultes")
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir le bloc suivant : Fenêtres" }))
  expect(await screen.findByText("Bloc « Fenêtres » ouvert pour toute la classe.")).toBeInTheDocument()
})

it("a help request opens in a right-hand panel and is handled from there", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => url.includes("/handle") ? json({ ok: true }) : json(timeline))
  vi.stubGlobal("fetch", fetchMock)
  wrap(<ClassTimeline assignmentId={7} section="aide" />)
  expect(screen.queryByRole("heading", { name: "Déroulé de la journée" })).not.toBeInTheDocument()
  fireEvent.click(await screen.findByRole("button", { name: "Voir la demande de demo.etudiant04" }))
  const panel = await screen.findByRole("dialog", { name: "Demande d’aide : demo.etudiant04" })
  expect(within(panel).getByText("« Je bloque sur le grain. »")).toBeInTheDocument()
  fireEvent.click(within(panel).getByRole("button", { name: "Marquer comme traitée" }))
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/teacher/help/31/handle", expect.objectContaining({ method: "POST" })))
})

it("the shell: sidebar views, back button, Ctrl+K to a sub-view, students online in the top bar", async () => {
  const main = { course: { id: 5, slug: "c", title: "Cours", status: "published" }, cohort: { id: 3, label: "Classe B3", student_count: 10 }, assignment_id: 7, assigned_version: 1, latest_version: 1 }
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith("/teacher/main/setup")) return json(main)
    if (url.endsWith("/live")) return json({ online_count: 3, student_count: 10, blocks: [], students: [] })
    if (url.endsWith("/timeline")) return json(timeline)
    if (url.endsWith("/overview")) return json({ students: [] })
    if (url.includes("/notifications")) return json({ unread: 0, items: [] })
    return json([])
  }))
  wrap(<NotificationProvider><TeacherApp username="demo.enseignant" onLogout={vi.fn()} busy={false} resumed={false} /></NotificationProvider>)
  expect(await screen.findByRole("heading", { name: "Bonjour, demo.enseignant" })).toBeInTheDocument()
  expect(await screen.findByRole("link", { name: "3 étudiants en ligne sur 10" })).toHaveAttribute("href", "#/classe/etudiants")
  window.location.hash = "#/classe/aide"
  window.dispatchEvent(new HashChangeEvent("hashchange"))
  expect(await screen.findByRole("heading", { level: 1, name: "Ma classe" })).toBeInTheDocument()
  expect(screen.getByRole("tab", { name: "Demandes d’aide", selected: true })).toBeInTheDocument()
  fireEvent.keyDown(window, { key: "k", ctrlKey: true })
  const search = await screen.findByRole("combobox", { name: "Rechercher une vue, un étudiant ou un bloc" })
  fireEvent.change(search, { target: { value: "difficultés" } })
  fireEvent.keyDown(search, { key: "Enter" })
  await vi.waitFor(() => expect(window.location.hash).toBe("#/classe/difficultes"))
})

it("« Demandes d’aide » badge: on « Ma classe » and on its tab, accessible text, nothing at zero, refreshed when a request is handled", async () => {
  const main = { course: { id: 5, slug: "c", title: "Cours", status: "published" }, cohort: { id: 3, label: "Classe B3", student_count: 10 }, assignment_id: 7, assigned_version: 1, latest_version: 1 }
  let pending = 3
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith("/teacher/main/setup")) return json(main)
    if (url.endsWith("/live")) return json({ online_count: 3, student_count: 10, help_pending: pending, blocks: [], students: [] })
    if (url.endsWith("/timeline")) return json(timeline)
    if (url.includes("/notifications")) return json({ unread: 0, items: [] })
    return json([])
  })
  vi.stubGlobal("fetch", fetchMock)
  window.location.hash = "#/classe/aide"
  wrap(<NotificationProvider><TeacherApp username="demo.enseignant" onLogout={vi.fn()} busy={false} resumed /></NotificationProvider>)
  const nav = await screen.findByRole("navigation", { name: "Navigation enseignant" })
  const classe = within(nav).getByRole("link", { name: "Ma classe" })  // the name does not change
  await vi.waitFor(() => expect(classe).toHaveAccessibleDescription("3 demandes d’aide en attente"))
  expect(await screen.findByRole("tab", { name: "Demandes d’aide" })).toHaveAccessibleDescription("3 demandes d’aide en attente")
  // A handled request refreshes the badge at once (no faster polling).
  const lives = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/live")).length
  const before = lives()
  pending = 0
  window.dispatchEvent(new Event("academy:help-changed"))
  await vi.waitFor(() => expect(lives()).toBe(before + 1))
  await vi.waitFor(() => expect(classe).not.toHaveAttribute("aria-describedby"))
  expect(screen.queryByText(/demandes? d’aide en attente/)).not.toBeInTheDocument()
})
