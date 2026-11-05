import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { parseRoute } from "../useHashRoute"
import { parseRoute as teacherRoute } from "../teacher/routes"
import { StudentProject, daysLeft, splitMilestones } from "../project/StudentProject"
import { StudentDashboard, moduleDone } from "./StudentDashboard"
import type { Milestone, StudentProjectData } from "../project/types"
import type { Dashboard, DashboardModule } from "./types"

/** ADR-0051: the student's home page during the project (Projet first, Cours, Ressources), milestone cards. */
const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
beforeEach(() => { document.cookie = `academy_csrf=${"E".repeat(43)}; Path=/` })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

const DAY = 86_400_000
const milestone = (id: number, title: string, dueInDays: number | null, extra: Partial<Milestone> = {}): Milestone => ({
  id, title, instructions: "Consigne détaillée du jalon.", due_at: dueInDays === null ? null : new Date(Date.now() + dueInDays * DAY).toISOString(),
  deliverables: ["Dépôt GitHub", "Rapport PDF"], sort_order: id, submissions: [], comments: [], ...extra,
})
const project = (milestones: Milestone[], members = 2): StudentProjectData => ({
  cohort_id: 3, cohort: "Cohorte démonstration (comptes fictifs)", cohorts: [{ id: 3, label: "Cohorte démonstration (comptes fictifs)" }],
  team: { id: 2, members: [{ id: 11, name: "demo.etudiant01" }, { id: 12, name: "demo.etudiant02" }].slice(0, members), invitations: [], full: members >= 2 },
  invitations: [], classmates: [], milestones, slots: [],
})

it("old and new addresses: #/ and #/projet open the Projet tab, #/cours and #/ressources the others, missions unchanged", () => {
  expect(parseRoute("#/")).toEqual({ name: "home" })
  expect(parseRoute("#/projet")).toEqual({ name: "projet" })
  expect(parseRoute("#/cours")).toEqual({ name: "cours" })
  expect(parseRoute("#/ressources")).toEqual({ name: "ressources" })
  expect(parseRoute("#/mission/12")).toEqual({ name: "mission", id: 12 })
  expect(parseRoute("#/campusequip/3")).toEqual({ name: "campusequip", step: 3 })
  expect(teacherRoute("#/etudiant/cours")).toEqual({ view: "etudiant", sub: "cours", params: {} })
  expect(teacherRoute("#/etudiant/ressources")).toEqual({ view: "etudiant", sub: "ressources", params: {} })
})

it("days left and the split between current and past milestones", () => {
  const now = Date.parse("2026-11-18T10:00:00")
  expect(daysLeft("2026-11-23T23:59:00", now)).toBe(5)
  expect(daysLeft("2026-11-18T23:00:00", now)).toBe(0)
  expect(daysLeft("2026-11-17T09:00:00", now)).toBe(-1)
  const { current, past } = splitMilestones([milestone(1, "Ancien", -3), milestone(2, "Rendu final", 5), milestone(3, "Sans date", null), milestone(4, "Conception", 2)])
  expect(current.map((item) => item.title)).toEqual(["Conception", "Rendu final", "Sans date"])
  expect(past.map((item) => item.title)).toEqual(["Ancien"])
})

it("a card per milestone: what to hand in, date, days left, status, action; past ones folded; the animation comes after", async () => {
  const submitted = milestone(4, "Conception", 2, { submissions: [{ id: 7, milestone_id: 4, version: 2, text: "v2", link: null, files: [], late: false, submitted_by: "demo.etudiant01", created_at: new Date().toISOString() }] })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(project([milestone(1, "Binôme formé", -3), milestone(2, "Rendu final", 5), submitted]))))
  const navigate = vi.fn()
  wrap(<StudentProject navigate={navigate} />)
  const cards = await screen.findAllByTestId("milestone-card")
  // Current milestones, the nearest first; the past one is folded.
  expect(cards.map((card) => within(card).getByRole("heading").textContent)).toEqual(["Conception", "Rendu final", "Binôme formé"])
  const final = cards[1]
  expect(within(final).getByText("Ce qu’il faut rendre")).toBeInTheDocument()
  expect(within(final).getByText("Rapport PDF")).toBeInTheDocument()
  expect(within(final).getByText(/^À rendre le /)).toBeInTheDocument()
  expect(within(final).getByText("Plus que 5 jours")).toBeInTheDocument()
  expect(within(final).getByText("À rendre", { selector: "span" })).toBeInTheDocument()
  expect(within(cards[0]).getByText("Déposé (version 2)")).toBeInTheDocument()
  expect(within(cards[0]).getByRole("button", { name: "Déposer une nouvelle version" })).toBeInTheDocument()
  const past = screen.getByTestId("past-milestones")
  expect(past.tagName).toBe("DETAILS")
  expect(past).not.toHaveAttribute("open")
  expect(within(past).getByText("1 jalon passé")).toBeInTheDocument()
  expect(within(cards[2]).getByText("Non déposé")).toBeInTheDocument()
  expect(within(cards[2]).getByText("Échéance passée")).toBeInTheDocument()
  // The form stays closed until « Déposer ».
  expect(within(final).queryByRole("textbox")).toBeNull()
  fireEvent.click(within(final).getByRole("button", { name: "Déposer" }))
  expect(within(final).getByRole("button", { name: "Envoyer le dépôt" })).toBeInTheDocument()
  // The animation: one button, after the milestones, never before the action.
  const animation = screen.getByRole("button", { name: /Voir l’animation/ })
  expect(cards[0].compareDocumentPosition(animation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(animation)
  expect(navigate).toHaveBeenCalledWith("/campusequip/1")
  // Nothing meant for the teacher (cohort label, « publié », version of the course).
  expect(screen.queryByText(/Cohorte démonstration|publi[ée]|comptes fictifs/)).toBeNull()
})

it("without a complete team, the team comes first and nothing can be handed in", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(project([milestone(2, "Rendu final", 5)], 1))))
  wrap(<StudentProject navigate={vi.fn()} />)
  const team = await screen.findByRole("heading", { name: "Mon binôme" })
  const milestones = screen.getByRole("heading", { name: "Jalons" })
  expect(team.compareDocumentPosition(milestones) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Déposer" })).toBeNull()
})

const block = (id: number, open: boolean, done: boolean) => ({ id, title: `Bloc ${id}`, open, mission_count: 1, bonus_count: 0, completed_count: done ? 1 : 0,
  done, mission_ids: [], points: done ? 10 : 0, possible: 10 })

it("a finished module is folded under « à revoir »; tabs Projet, Cours, Ressources; no text meant for the teacher", async () => {
  const finished: DashboardModule = { title: "Module 1 : SQL", blocks: [block(1, true, true), block(2, true, true)] }
  const ongoing: DashboardModule = { title: "Module 2 : Python", blocks: [block(3, true, false), block(4, false, false)] }
  expect(moduleDone(finished)).toBe(true)
  expect(moduleDone(ongoing)).toBe(false)
  expect(moduleDone({ title: "Vide", blocks: [] })).toBe(false)
  const dashboard: Dashboard = { display_name: "demo.etudiant01", ai_enabled: false, next_deadline: null, rafi: { sounds: true },
    courses: [{ release_id: 1, title: "Python Data Engineering", description: "", version: 9, is_demo: false, resources: ["/api/v1/student/resources/1/sources.csv"],
      score: { core_points: 10, core_possible: 40, bonus_points: 0, bonus_possible: 0, completed: 1, total: 4 },
      paused: false, modules: [finished, ongoing], missions: [] }] } as Dashboard
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(dashboard)))
  const navigate = vi.fn()
  const view = wrap(<StudentDashboard navigate={navigate} tab="cours" />)
  expect((await screen.findAllByRole("tab")).map((tab) => tab.textContent)).toEqual(["Projet", "Cours", "Ressources"])
  const folded = screen.getByTestId("module-done")
  expect(folded.tagName).toBe("DETAILS")
  expect(within(folded).getByText("Terminé · à revoir")).toBeInTheDocument()
  expect(screen.getByRole("region", { name: "Module : Module 2 : Python" })).toBeInTheDocument()
  // The version of the course and the AI setting are the teacher's business.
  expect(screen.queryByText(/^Version/)).toBeNull()
  expect(screen.queryByText(/assistant IA/)).toBeNull()
  expect(screen.queryByText(/pendant la séance/)).toBeNull()
  fireEvent.click(screen.getByRole("tab", { name: "Ressources" }))
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/ressources"))
  view.rerender(<ChakraProvider value={system}><StudentDashboard navigate={navigate} tab="ressources" /></ChakraProvider>)
  expect(await screen.findByRole("link", { name: "/api/v1/student/resources/1/sources.csv" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("tab", { name: "Projet" }))
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/"))
})
