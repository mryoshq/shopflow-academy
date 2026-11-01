import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { App } from "../App"
import { ObserversPanel, mailtoOf } from "../teacher/ObserversPanel"
import { InvitationPage, invitationToken } from "./InvitationPage"

const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
const course = { title: "Démonstration", description: "", show_answers: false, corrections: {}, modules: [{ id: 1, title: "Module", sort_order: 0, chapters: [{ id: 2, title: "Bloc 1", sort_order: 0,
  missions: [{ id: 5, title: "Frais gonflés", sort_order: 0, mission_version_id: 11, definition: { kind: "single_choice", scenario: "Situation.", instructions: "Que faites-vous ?",
    choices: [{ id: "c1", label: "Agréger avant" }, { id: "c2", label: "SUM(DISTINCT)" }], match_targets: [], display_data: null, resources: [], hints: [], estimated_duration_minutes: 5 } }] }] }] }
const dashboard = { students: 10, mean_progress: 42.5, success_rate: 61, bonus_points: 12, bonus_students: 3, work_minutes_total: 600, work_minutes_mean: 75,
  blocks_open: 2, blocks_total: 5, missions: 12, course_title: "Démonstration", version: 1, cohort: "Classe B3", generated_at: new Date().toISOString(), named: false,
  progress: [{ name: "Étudiant 1", completed: 4, total: 12 }, { name: "Étudiant 2", completed: 2, total: 12 }] }
const charts = { progression: [{ day: "2026-10-28", percent: 10 }, { day: "2026-10-29", percent: 25 }], modules: [{ label: "SQL", percent: 40 }],
  objectives: [{ label: "OBJ-1 · Lire une jointure", percent: 55 }], grades: [{ label: "0–10 %", count: 1 }, { label: "10–20 %", count: 9 }],
  activity: [{ day: "2026-10-28", attempts: 30, hints: 4, help: 2 }] }
const guest = { owner: "demo.enseignant", full_name: "M. Inspecteur", kind: "guest", rights: { named: false, grades: false, export: false, project: false, student_file: false, answers: false } }
const admin = { ...guest, full_name: "Mme Direction", kind: "admin", rights: { named: true, grades: true, export: true, project: true, student_file: true, answers: false } }

beforeEach(() => { document.cookie = `academy_csrf=${"D".repeat(43)}; Path=/`; window.history.replaceState(null, "", "/") })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const GRADING = { weights: { course: 30, workshops: 20, project: 50 }, cap: 20, project_bonus_max: 1, course_bonus_max: 1, workshop_modules: null, visible_to_students: false }
const FINAL = { parts: { course: { points: 30, possible: 40, on20: 15, pending: false, weight: 30 }, workshops: { points: 0, possible: 0, on20: null, pending: true, weight: 20 },
  project: { points: 15, possible: 20, on20: 15, pending: false, weight: 50 } }, base: 15, project_bonus: 0.2, course_bonus: 0, course_bonus_points: 0, course_bonus_possible: 0,
  raw: 15.2, final: 15.25, capped: false, provisional: true, pending: ["workshops"] }

function observerFetch(me: object) {
  return vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith("/auth/me")) return json({ id: 9, username: "inspection@example.org", role: "observer" })
    if (url.endsWith("/observer/me")) return json(me)
    if (url.endsWith("/observer/classes")) return json([{ id: 7, cohort: "Classe B3", course_title: "Démonstration", version: 1, paused: false, student_count: 10 }])
    if (url.endsWith("/observer/classes/7/dashboard")) return json(dashboard)
    if (url.endsWith("/observer/classes/7/charts")) return json(charts)
    if (url.endsWith("/observer/classes/7/course")) return json(course)
    if (url.endsWith("/observer/classes/7/grades")) return json({ generated_at: new Date().toISOString(), grading: GRADING, students: [
      { id: 21, name: "salma", core_points: 20, core_possible: 40, percent: 50, completed: 4, total: 12, bonus_points: 3, lessons_read: 1, lessons_total: 2, project_total: 15 },
      { id: 22, name: "youssef", core_points: 30, core_possible: 40, percent: 75, completed: 6, total: 12, bonus_points: 0, lessons_read: 2, lessons_total: 2, project_total: null, final_grade: FINAL }] })
    if (url.endsWith("/observer/classes/7/students/22")) return json({ id: 22, name: "youssef", percent: 75, summary: { completed: 6, total: 12, core_points: 30, core_possible: 40, bonus_points: 0 },
      modules: [{ title: "SQL", completed: 6, total: 12, points: 30, possible: 40 }], level: { number: 3, name: "Analyste Data", xp: 90 }, badges: [{ key: "a", label: "Série de 5" }], badge_count: 1,
      project: { partners: ["salma"], base: 15, bonus: 2, individual: 1, total: 15 } })
    throw new Error(`Unexpected ${url}`)
  })
}

it("guest: anonymised dashboard, aggregated charts and course; no grades tab, no export, only GET requests", async () => {
  const fetchMock = observerFetch(guest)
  vi.stubGlobal("fetch", fetchMock)
  wrap(<App />)
  expect(await screen.findByRole("heading", { name: "Espace observateur" })).toBeInTheDocument()
  expect(screen.getByText("Invité")).toBeInTheDocument()
  expect(screen.getByRole("note")).toHaveTextContent("Données anonymisées")
  expect(screen.queryByRole("button", { name: /Notifications/ })).not.toBeInTheDocument()
  expect(await screen.findByRole("region", { name: "Progression moyenne" })).toHaveTextContent("42,5 %")
  expect(screen.getByRole("region", { name: "Temps de travail" })).toHaveTextContent("1 h 15")
  expect(screen.getByText("Étudiant 1")).toBeInTheDocument()
  expect(screen.queryByRole("tab", { name: "Notes" })).not.toBeInTheDocument()
  expect(screen.queryByRole("tab", { name: "Projet" })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("tab", { name: "Graphiques" }))
  expect(await screen.findByRole("table", { name: "Activité par séance (nombres seulement)" })).toHaveTextContent("30")
  fireEvent.click(screen.getByRole("tab", { name: "Cours" }))
  expect(await screen.findByText("Vue étudiante : les corrigés ne sont pas affichés.", { exact: false })).toBeInTheDocument()
  expect(screen.queryByRole("link", { name: /CSV|PDF/ })).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true)
})

it("administration: sortable, filterable grades, a student's file, CSV export and PDF report", async () => {
  vi.stubGlobal("fetch", observerFetch(admin))
  wrap(<App />)
  fireEvent.click(await screen.findByRole("tab", { name: "Notes" }))
  const table = await screen.findByRole("table", { name: "Notes de la classe" })
  expect(within(table).getByRole("button", { name: /Note finale/ })).toBeInTheDocument()
  expect(within(table).getAllByRole("row")[2]).toHaveTextContent("15,25 / 20")
  expect(within(table).getAllByRole("row").slice(1).map((row) => row.textContent?.split(/\d/)[0])).toEqual(["salma", "youssef"])
  fireEvent.click(within(table).getByRole("button", { name: /Cours/ }))  // by course grade, highest first
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("youssef")
  fireEvent.change(screen.getByLabelText("Filtrer par nom"), { target: { value: "sal" } })
  expect(within(table).getAllByRole("row")).toHaveLength(2)
  expect(screen.getByRole("link", { name: "Exporter (CSV)" })).toHaveAttribute("href", "/api/v1/observer/classes/7/grades.csv")
  expect(screen.getByRole("link", { name: "Rapport de classe (PDF)" })).toHaveAttribute("href", "/api/v1/observer/classes/7/report.pdf")
  fireEvent.change(screen.getByLabelText("Filtrer par nom"), { target: { value: "" } })
  fireEvent.click(screen.getByRole("button", { name: "Fiche de youssef" }))
  expect(await screen.findByText("Niveau 3 : Analyste Data (90 XP)")).toBeInTheDocument()
  expect(screen.getByText("Binôme : salma. Socle : 15 / 20, bonus : 2 / 10.")).toBeInTheDocument()
  expect(screen.getByText("30 / 40 pts")).toBeInTheDocument()  // ADR-0046: points by module
  // ADR-0046: the final grade and each of its components, for « Administration ».
  const detail = screen.getByTestId("final-breakdown")
  expect(within(detail).getAllByText("15 / 20")).toHaveLength(3)  // course, CampusEquip, base
  expect(within(detail).getByText("15,25 / 20")).toBeInTheDocument()
  expect(within(detail).getByText("en attente")).toBeInTheDocument()
  expect(within(detail).getByText("provisoire")).toBeInTheDocument()
})

it("teacher: invite (type, answer keys), copy the link or prepare the e-mail, resend, revoke, test e-mail, the log", async () => {
  let observers: object[] = []
  const invitation = { link: "http://127.0.0.1:3080/#/invitation/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG", expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    delivery: "manual", error: null, mail: { to: "direction@example.org", subject: "Invitation à l'espace observateur — Rapidfox Academy", body: "Bonjour Mme Direction,\n\nLien : …" } }
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/teacher/observers") && init?.method === "POST") {
      const body = JSON.parse(String(init.body))
      observers = [{ id: 9, full_name: body.full_name, email: body.email, username: body.email, kind: body.kind, show_answers: body.show_answers, enabled: true,
        status: "pending", invitation_expires_at: invitation.expires_at, created_at: null }]
      return json({ observer: observers[0], invitation }, 201)
    }
    if (url.endsWith("/teacher/observers/9/invitation") && init?.method === "POST") return json({ observer: observers[0], invitation })
    if (url.endsWith("/teacher/observers/9/invitation") && init?.method === "DELETE") return json({ ...observers[0], status: "expired" })
    if (url.endsWith("/teacher/observers/mail-test")) return json({ detail: "L'envoi d'e-mails n'est pas configuré sur le serveur." }, 409)
    if (url.endsWith("/teacher/observers/mail")) return json({ configured: false })
    if (url.endsWith("/teacher/observers")) return json(observers)
    if (url.endsWith("/teacher/observers/views")) return json([{ id: 1, observer: "Mme Direction", email: "direction@example.org", kind: "admin", view: "report.pdf", assignment_id: 7, details: {}, created_at: new Date().toISOString() }])
    throw new Error(`Unexpected ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<ObserversPanel />)
  expect(await screen.findByText("Rapport PDF")).toBeInTheDocument()
  expect(screen.getByText(/L’envoi d’e-mails n’est pas configuré/)).toBeInTheDocument()
  fireEvent.change(screen.getByRole("textbox", { name: "Nom" }), { target: { value: "Mme Direction" } })
  fireEvent.change(screen.getByRole("textbox", { name: "E-mail" }), { target: { value: "direction@example.org" } })
  fireEvent.change(screen.getByRole("combobox", { name: "Type de compte" }), { target: { value: "admin" } })
  fireEvent.click(screen.getByRole("checkbox", { name: "Afficher les corrigés dans le cours publié" }))
  fireEvent.click(screen.getByRole("button", { name: "Créer et inviter" }))
  const box = await screen.findByTestId("invitation-box")
  expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/teacher/observers") && init?.method === "POST")![1].body)))
    .toEqual({ full_name: "Mme Direction", email: "direction@example.org", kind: "admin", show_answers: true })
  expect(within(box).getByRole("textbox", { name: "Lien d’invitation" })).toHaveValue(invitation.link)
  expect(within(box).getByRole("link", { name: "Préparer l’e-mail" })).toHaveAttribute("href", mailtoOf(invitation.mail))
  expect(mailtoOf(invitation.mail)).toMatch(/^mailto:direction%40example\.org\?subject=Invitation/)
  expect(await screen.findByText("Invitation en attente")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Renvoyer l’invitation" }))
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/teacher/observers/9/invitation", expect.objectContaining({ method: "POST" })))
  fireEvent.click(screen.getByRole("button", { name: "Révoquer l’invitation" }))
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/teacher/observers/9/invitation", expect.objectContaining({ method: "DELETE" })))
  fireEvent.change(screen.getByRole("textbox", { name: "Adresse de test" }), { target: { value: "moi@example.org" } })
  fireEvent.click(screen.getByRole("button", { name: "Envoyer un e-mail de test" }))
  expect(await screen.findByText("L'envoi d'e-mails n'est pas configuré sur le serveur.")).toBeInTheDocument()
})

it("the invitation page: the observer chooses a password, then signs in", async () => {
  expect(invitationToken("#/invitation/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG")).toBe("abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG")
  expect(invitationToken("#/invitation/court")).toBeNull()
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return json({ activated: true, username: "direction@example.org" })
    return json({ full_name: "Mme Direction", email: "direction@example.org", kind: "admin", kind_label: "Administration", expires_at: new Date().toISOString(), password_min: 12 })
  })
  vi.stubGlobal("fetch", fetchMock)
  const onDone = vi.fn()
  wrap(<InvitationPage token={"t".repeat(43)} onDone={onDone} />)
  expect(await screen.findByText(/Bonjour Mme Direction/)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText(/^Mot de passe/), { target: { value: "Observation-2026!" } })
  fireEvent.change(screen.getByLabelText(/^Confirmer le mot de passe/), { target: { value: "Autre-2026!" } })
  fireEvent.click(screen.getByRole("button", { name: "Activer mon compte" }))
  expect(await screen.findByText("Les deux mots de passe ne sont pas identiques.")).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText(/^Confirmer le mot de passe/), { target: { value: "Observation-2026!" } })
  fireEvent.click(screen.getByRole("button", { name: "Activer mon compte" }))
  await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith("direction@example.org"))
  expect(JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "POST")![1].body))).toEqual({ password: "Observation-2026!" })
})
