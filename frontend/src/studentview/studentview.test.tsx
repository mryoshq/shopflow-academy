import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { NotificationProvider } from "../live/notifications"
import { TeacherApp } from "../teacher/TeacherApp"
import { ClassTimeline, type Timeline } from "../teacher/ClassTimeline"
import { OnlineStatus, onlineFor } from "../teacher/OnlineStatus"
import { matches, viewItems } from "../teacher/CommandPalette"
import { parseRoute } from "../teacher/routes"
import { api } from "../api"
import { enterStudentView, leaveStudentView, routeStudentView } from "./adapter"
import type { LiveStudent } from "../teacher/LivePanel"

const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
beforeEach(() => { localStorage.clear(); document.cookie = `academy_csrf=${"V".repeat(43)}; Path=/`; window.history.replaceState(null, "", "/") })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); leaveStudentView() })

it("student view: reads go to the teacher's read-only routes, an answer is checked, every other write is refused", async () => {
  expect(routeStudentView("/student/dashboard", "GET")).toBeNull()  // off: requests go out unchanged
  enterStudentView(7, false)
  expect(routeStudentView("/student/dashboard", "GET")).toMatchObject({ kind: "fetch", path: "/teacher/classes/7/student-view/dashboard" })
  expect(routeStudentView("/student/missions/12", "GET")).toMatchObject({ path: "/teacher/classes/7/student-view/missions/12" })
  expect(routeStudentView("/student/missions/12/attempts", "GET")).toEqual({ kind: "local", data: [] })
  expect(routeStudentView("/student/missions/12/attempts", "POST", { idempotency_key: "k".repeat(10), answer: { choice_ids: ["c1"] } }))
    .toMatchObject({ path: "/teacher/classes/7/student-view/missions/12/check", body: { answer: { choice_ids: ["c1"] } } })
  expect(routeStudentView("/student/missions/12/understood", "POST")).toMatchObject({ path: "/teacher/classes/7/student-view/missions/12/check" })
  expect(routeStudentView("/student/project", "GET")).toMatchObject({ path: "/teacher/classes/7/student-view/project" })
  for (const [path, method] of [["/student/missions/12/help", "POST"], ["/student/project/team", "POST"], ["/student/project/draw/join", "POST"],
    ["/student/missions/12/sql", "POST"], ["/student/project/surprise/seen", "POST"]]) {
    expect(routeStudentView(path, method)).toEqual({ kind: "refused", message: "Vue étudiant : rien n’est enregistré." })
  }
  enterStudentView(7, true)
  expect(routeStudentView("/student/dashboard", "GET")).toMatchObject({ path: "/teacher/classes/7/student-view/dashboard?all=true" })
  // Hints: the browser keeps the count, the server records nothing.
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ hints: ["Un"], hint_count: 2 })).mockResolvedValueOnce(json({ hints: ["Un", "Deux"], hint_count: 2 }))
  vi.stubGlobal("fetch", fetchMock)
  await api("/student/missions/12/hints", "POST")
  await api("/student/missions/12/hints", "POST")
  expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)))).toEqual([{ shown: 0 }, { shown: 1 }])
  await expect(api("/student/missions/12/help", "POST", { message: "x" })).rejects.toMatchObject({ status: 403 })
  expect(fetchMock).toHaveBeenCalledTimes(2)  // the refused write never left the browser
})

const main = { course: { id: 5, slug: "c", title: "Cours", status: "published" }, cohort: { id: 3, label: "Classe B3", student_count: 10 }, assignment_id: 7, assigned_version: 2, latest_version: 2 }
const dashboard = { display_name: "demo.enseignant", ai_enabled: false, student_view: true, courses: [{
  release_id: 4, title: "Données ShopFlow", description: "", version: 2, is_demo: false, resources: [], score: { best: 0, possible: 10, completed: 0, total: 1 },
  paused: false, rules_notice: null, rewards: null,
  modules: [{ title: "SQL", description: "", blocks: [{ id: 1, title: "Le grain", open: true, for_you: false, mission_count: 1, bonus_count: 0, completed_count: 0, lesson_count: 0, lessons_read: 0, done: false, mission_ids: [12], objective: "" }] }],
  missions: [{ mission_version_id: 12, title: "Pourquoi 70 DH", module: "SQL", chapter: "Le grain", block_id: 1, kind: "single_choice", estimated_duration_minutes: 5, best_points: 0, possible: 10, bonus: false, status: "not_started", locked_by: [], unlocked_by_teacher: false }],
}] }

it("« Vue étudiant » in the sidebar and Ctrl+K: banner, the student's dashboard from the teacher's route, back to my interface", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith("/teacher/main/setup")) return json(main)
    if (url.endsWith("/live")) return json({ online_count: 0, student_count: 10, blocks: [], students: [] })
    if (url.includes("/student-view/dashboard")) return json(dashboard)
    if (url.endsWith("/overview")) return json({ students: [] })
    if (url.includes("/notifications")) return json({ unread: 0, items: [] })
    if (url.endsWith("/timeline")) return json({ generated_at: "", assignment_id: 7, student_count: 10, block_minutes: 15, next_block_id: null, blocks: [], help: [], missions: [] })
    return json([])
  })
  vi.stubGlobal("fetch", fetchMock)
  expect(viewItems().some((item) => item.label === "Vue étudiant" && matches(item, "vue etudiant"))).toBe(true)
  expect(parseRoute("#/etudiant/mission/12")).toEqual({ view: "etudiant", sub: "mission/12", params: {} })
  wrap(<NotificationProvider><TeacherApp username="demo.enseignant" onLogout={vi.fn()} busy={false} resumed={false} /></NotificationProvider>)
  const entry = await screen.findByRole("link", { name: "Vue étudiant" })
  expect(entry).toHaveAttribute("href", "#/etudiant")
  window.location.hash = "#/etudiant/cours"  // ADR-0051: the course is in the Cours tab
  window.dispatchEvent(new HashChangeEvent("hashchange"))
  expect(await screen.findByTestId("student-view-banner")).toHaveTextContent("Vue étudiant, rien n’est enregistré")
  expect(await screen.findByText("Pourquoi 70 DH")).toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/v1/student/"))).toBe(false)
  expect(screen.queryByRole("navigation", { name: "Navigation enseignant" })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Revenir à mon interface" }))
  await vi.waitFor(() => expect(window.location.hash).toBe("#/aujourdhui"))
  expect(await screen.findByRole("navigation", { name: "Navigation enseignant" })).toBeInTheDocument()
})

const students: LiveStudent[] = [
  { id: 1, name: "salma", online: true, seen_at: null, online_since: new Date(Date.now() - 12 * 60000).toISOString(), mission: "Pourquoi 70 DH", help: false, fast_attempts: 0, cells: [] },
  { id: 2, name: "youssef", online: false, seen_at: null, online_since: null, mission: null, help: false, fast_attempts: 0, cells: [] },
  { id: 3, name: "nadia", online: true, seen_at: null, online_since: new Date().toISOString(), mission: null, help: false, fast_attempts: 0, cells: [] },
]

it("« n en ligne »: hover or focus shows who is online, with the mission and since when; Escape closes; the click still opens the class", async () => {
  expect(onlineFor(new Date(Date.now() - 75 * 60000).toISOString(), Date.now())).toBe("depuis 1 h 15")
  wrap(<OnlineStatus online={2} total={10} students={students} />)
  const link = screen.getByRole("link", { name: "2 étudiants en ligne sur 10" })
  expect(link).toHaveAttribute("href", "#/classe/etudiants")
  expect(screen.queryByTestId("online-panel")).toBeNull()
  fireEvent.focus(link)
  const panel = await screen.findByRole("group", { name: "Étudiants en ligne" })
  expect(within(panel).getByText("salma")).toBeInTheDocument()
  expect(within(panel).getByText("Pourquoi 70 DH · depuis 12 min")).toBeInTheDocument()
  expect(within(panel).getByText("Tableau de bord · depuis moins d’une minute")).toBeInTheDocument()
  expect(within(panel).queryByText("youssef")).toBeNull()
  expect(link).toHaveAttribute("aria-describedby", panel.id)
  fireEvent.keyDown(window, { key: "Escape" })
  expect(screen.queryByTestId("online-panel")).toBeNull()
  // A first touch shows the list instead of leaving the page.
  fireEvent.pointerDown(link, { pointerType: "touch" })
  const click = new MouseEvent("click", { bubbles: true, cancelable: true })
  act(() => { link.dispatchEvent(click) })
  expect(click.defaultPrevented).toBe(true)
  expect(screen.getByTestId("online-panel")).toBeInTheDocument()
})

it("« Clics rapides » left the mission table: a discreet indicator in the mission's panel only", async () => {
  const data: Timeline = { generated_at: "", assignment_id: 7, student_count: 10, block_minutes: 15, next_block_id: null, blocks: [], help: [],
    missions: [{ mission_version_id: 3, title: "Pourquoi 70 DH", block: "Le grain", bonus: false, completed: 4, attempts: 17, hints: 6, stuck: [],
      fast_attempts: 3, fast: [{ student: "salma", count: 2 }, { student: "youssef", count: 1 }] }] }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(data)))
  wrap(<ClassTimeline assignmentId={7} />)
  const table = await screen.findByRole("table", { name: "Statistiques par mission" })
  expect(within(table).queryByText("Clics rapides")).toBeNull()
  expect(within(table).queryByText(/salma/)).toBeNull()
  fireEvent.click(within(table).getByRole("button", { name: "Détail de la mission Pourquoi 70 DH" }))
  const indicator = await screen.findByTestId("fast-indicator")
  expect(indicator).toHaveTextContent("3 clics rapides")
  expect(indicator).toHaveTextContent("salma (2), youssef (1)")
})
