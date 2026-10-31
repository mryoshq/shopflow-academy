import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { ProjectText, splitBlocks } from "./ProjectText"
import { StudentProject } from "./StudentProject"
import { TeacherProject } from "./TeacherProject"
import { setLanguage } from "../i18n"
import type { StudentProjectData, TeacherProjectData } from "./types"

const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
beforeEach(() => { document.cookie = `academy_csrf=${"E".repeat(43)}; Path=/` })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it("renders paragraphs and Markdown tables, never HTML", () => {
  expect(splitBlocks("Intro\n\n| a | b |\n|---|---|\n| 1 | 2 |\nFin").map((b) => b.kind)).toEqual(["text", "table", "text"])
  wrap(<ProjectText text={"Sources :\n\n| Source | Format |\n|---|---|\n| ventes | CSV |\n\n<script>x</script>"} />)
  const table = screen.getByRole("table")
  expect(within(table).getByRole("columnheader", { name: "Format" })).toBeInTheDocument()
  expect(within(table).getByRole("cell", { name: "CSV" })).toBeInTheDocument()
  expect(document.querySelector("script")).toBeNull()
})

const studentData = (team: StudentProjectData["team"]): StudentProjectData => ({
  cohort_id: 3, cohort: "Classe B3", cohorts: [{ id: 3, label: "Classe B3" }], team,
  invitations: [{ id: 9, team_id: 4, from: "demo.etudiant02", members: ["demo.etudiant02"] }],
  classmates: [{ id: 12, name: "demo.etudiant03", available: true }],
  milestones: [{ id: 1, title: "Conception du 29 octobre", instructions: "Tableau des sources.", due_at: null, deliverables: ["Schéma"], sort_order: 0, submissions: [], comments: [] }],
  slots: [{ id: 5, starts_at: "2026-11-23T08:00:00Z", ends_at: "2026-11-23T08:20:00Z", label: "Salle B3", team_id: 2, team: ["demo.etudiant01"], mine: true }],
})

it("student: create a team, accept an invitation, submit a version with a table", async () => {
  let team: StudentProjectData["team"] = null
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/student/project/team")) { team = { id: 2, members: [{ id: 11, name: "demo.etudiant01" }], invitations: [], full: false }; return json({ team_id: 2 }, 201) }
    if (url.endsWith("/invitations")) { team = { id: 2, members: [{ id: 11, name: "demo.etudiant01" }, { id: 12, name: "demo.etudiant03" }], invitations: [], full: true }; return json({ id: 3 }, 201) }
    if (url.endsWith("/accept")) return json({ team_id: 4 })
    if (url.includes("/submissions")) return json({ id: 1, version: 1, late: false }, 201)
    void init
    return json(studentData(team))
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<StudentProject />)
  expect(await screen.findByRole("heading", { name: "Projet CampusEquip" })).toBeInTheDocument()
  expect(screen.getByText("Votre créneau")).toBeInTheDocument()
  expect(screen.getByText("Il faut être au moins deux pour déposer : formez votre binôme ou tentez le binôme surprise.")).toBeInTheDocument()
  expect(screen.queryByText(/travailler seul|travaillez seul/)).toBeNull()  // ADR-0041: working alone is not offered
  fireEvent.click(screen.getByRole("button", { name: "Accepter" }))
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/student/project/invitations/9/accept", expect.objectContaining({ method: "POST" })))
  fireEvent.click(screen.getByRole("button", { name: "Former mon binôme" }))
  expect(await screen.findByRole("button", { name: "Inviter" })).toBeInTheDocument()
  // A team of one cannot submit yet; once the classmate is in, it can.
  expect(screen.getByText("En attente d’un camarade : invitez-le ci-dessous. Seul, vous ne pouvez pas déposer.")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Déposer" })).toBeNull()
  fireEvent.change(screen.getByRole("combobox", { name: "Inviter un camarade" }), { target: { value: "12" } })
  fireEvent.click(screen.getByRole("button", { name: "Inviter" }))
  expect(await screen.findByRole("button", { name: "Déposer" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Insérer un tableau" }))
  fireEvent.click(screen.getByRole("button", { name: "Déposer" }))
  await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/milestones/1/submissions"))).toBe(true))
  const body = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url).includes("/submissions"))![1].body))
  expect(body.text).toContain("| Colonne 1 | Colonne 2 | Colonne 3 |")
  expect(await screen.findByText("Version 1 déposée.")).toBeInTheDocument()
})

const teacherData: TeacherProjectData = {
  assignment_id: 7, cohort: "Classe B3", cohort_id: 3, grid: { sql: 4, python: 4, nosql: 3, airflow: 3, reproducibility: 2 }, individual_max: 4,
  teams: [{ id: 2, members: [{ id: 11, name: "demo.etudiant01" }, { id: 12, name: "demo.etudiant02" }],
    grade: { sql: null, python: null, nosql: null, airflow: null, reproducibility: null, comment: "", students: [
      { id: 11, name: "demo.etudiant01", common: null, individual: null, total: null }, { id: 12, name: "demo.etudiant02", common: null, individual: null, total: null }] } }],
  alone: [{ id: 13, name: "demo.etudiant03" }],
  milestones: [{ id: 1, title: "Rendu final", instructions: "", due_at: null, deliverables: [], sort_order: 0,
    submissions: [{ team_id: 2, version: 2, versions: 2, late: true, created_at: "2026-11-20T10:00:00Z" }] }],
  slots: [],
}

const EMPTY_DRAW = { free: [], solo_teams: [], draws: [] }

it("teacher: reads every version of a submission in a side panel and comments", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/teams/2/milestones/1")) return json({ submissions: [{ id: 5, milestone_id: 1, version: 2, text: "| a | b |\n|---|---|\n| 1 | 2 |", link: "https://github.com/x/y",
      files: [{ id: 8, name: "rapport.pdf", size: 2048 }], late: true, submitted_by: "demo.etudiant01", created_at: "2026-11-20T10:00:00Z" }], comments: [] })
    if (url.endsWith("/comments") || url.endsWith("/grade")) return json({ ok: true })
    void init
    if (url.endsWith("/project/draw")) return json(EMPTY_DRAW)
    return json(teacherData)
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<TeacherProject assignmentId={7} />)
  expect(await screen.findByText("demo.etudiant01 + demo.etudiant02")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("tab", { name: "Dépôts" }))
  expect(await screen.findByText("En retard")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Consulter le dépôt de demo.etudiant01 et demo.etudiant02" }))
  expect(await screen.findByRole("link", { name: "rapport.pdf (2 Ko)" })).toHaveAttribute("href", "/api/v1/teacher/project/files/8")
  fireEvent.change(screen.getByLabelText("Nouveau commentaire"), { target: { value: "Ajoutez le journal IA." } })
  fireEvent.click(screen.getByRole("button", { name: "Envoyer le commentaire" }))
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/teacher/project/teams/2/comments", expect.objectContaining({ body: JSON.stringify({ milestone_id: 1, text: "Ajoutez le journal IA." }) })))
})

it("teacher: grades a team on 20 (common criteria and individual understanding)", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => url.endsWith("/grade") ? json({ ok: true }) : url.endsWith("/project/draw") ? json(EMPTY_DRAW) : json(teacherData))
  vi.stubGlobal("fetch", fetchMock)
  wrap(<TeacherProject assignmentId={7} />)
  fireEvent.click(await screen.findByRole("tab", { name: "Notes" }))
  fireEvent.change(await screen.findByLabelText("SQL /4"), { target: { value: "3,5" } })
  fireEvent.change(screen.getByLabelText("Compréhension individuelle de demo.etudiant01 /4"), { target: { value: "4" } })
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer la note" }))
  await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/teams/2/grade"))).toBe(true))
  const grade = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url).endsWith("/grade"))![1].body))
  expect(grade).toMatchObject({ sql: 3.5, python: null, individual: { "11": 4 } })
})

// ADR-0041 ------------------------------------------------------------------------------------------

it("student without a team: form a team or try the surprise team; signed up, they see their status and can leave", async () => {
  let registered = false
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith("/draw/join")) { registered = true; return json({ registered: true }) }
    if (url.endsWith("/draw/leave")) { registered = false; return json({ registered: false }) }
    return json({ ...studentData(null), invitations: [], draw: { registered, registered_count: registered ? 3 : 2, done: false }, surprise: null })
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<StudentProject />)
  expect(await screen.findByRole("button", { name: "Former mon binôme" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Je tente le binôme surprise" }))
  expect(await screen.findByText("Vous êtes inscrit au binôme surprise.")).toBeInTheDocument()
  expect(screen.getByText("3 étudiants inscrits pour l’instant. Vous serez prévenu après le tirage.")).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/student/project/draw/join", expect.objectContaining({ body: JSON.stringify({ cohort_id: 3 }) }))
  fireEvent.click(screen.getByRole("button", { name: "Me retirer du tirage" }))
  expect(await screen.findByRole("button", { name: "Je tente le binôme surprise" })).toBeInTheDocument()
})

const drawnData = (): StudentProjectData => ({ ...studentData({ id: 2, members: [{ id: 11, name: "demo.etudiant01" }, { id: 14, name: "demo.etudiant04" }], invitations: [], full: true }),
  invitations: [], draw: { registered: false, registered_count: 0, done: true }, surprise: { draw_id: 6, partners: ["demo.etudiant04"] } })

it("after the draw: cards turn over once, the reveal is marked as seen", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => url.endsWith("/surprise/seen") ? json({ seen: true }) : json(drawnData()))
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  wrap(<StudentProject />)
  expect(await screen.findByRole("heading", { name: "Votre binôme surprise : demo.etudiant04" })).toBeInTheDocument()
  expect(document.querySelectorAll(".surprise-card")).toHaveLength(1)
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/student/project/surprise/seen", expect.objectContaining({ method: "POST" })))
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/surprise/seen"))).toHaveLength(1)
})

it("the reveal has no animation with « Réduire les animations », and reads in English", async () => {
  document.documentElement.classList.add("reduce-motion")
  setLanguage("en")
  try {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => url.endsWith("/surprise/seen") ? json({ seen: true }) : json(drawnData())))
    wrap(<StudentProject />)
    expect(await screen.findByRole("heading", { name: "Your surprise team: demo.etudiant04" })).toBeInTheDocument()
    expect(document.querySelectorAll(".surprise-card")).toHaveLength(0)
    expect(screen.getByText("demo.etudiant04", { selector: "div" })).toBeInTheDocument()
  } finally {
    document.documentElement.classList.remove("reduce-motion")
    setLanguage("fr")
  }
})

it("teacher: preview the draw (one-person teams only with agreement), confirm, and a second draw asks again", async () => {
  const overview = { free: [{ id: 13, name: "demo.etudiant03", registered: true }, { id: 14, name: "demo.etudiant04", registered: false },
    { id: 15, name: "demo.etudiant05", registered: false }], solo_teams: [{ team_id: 9, name: "demo.etudiant06", has_work: true }],
  draws: [{ id: 1, created_at: "2026-11-02T09:00:00Z", by: "demo.enseignant", groups: [["demo.etudiant07", "demo.etudiant08"]], left_out: [] }] }
  const preview = { seed: "00c0ffee", fingerprint: "abcdabcdabcdabcd", pool_size: 3, left_out: [],
    groups: [{ members: ["demo.etudiant03", "demo.etudiant04", "demo.etudiant05"], existing_team: false }], previous: overview.draws[0] }
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith("/draw/preview")) return json(preview)
    if (url.endsWith("/project/draw")) return json(overview)
    return json(teacherData)
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<TeacherProject assignmentId={7} />)
  expect(await screen.findByText("3 étudiants sans équipe · 1 inscrit au tirage")).toBeInTheDocument()
  const solo = screen.getByRole("checkbox", { name: "demo.etudiant06 (a déjà du travail : garde son équipe)" })
  expect(solo).not.toBeChecked()
  fireEvent.click(screen.getByRole("button", { name: "Lancer le tirage" }))
  expect(await screen.findByText("demo.etudiant03 + demo.etudiant04 + demo.etudiant05")).toBeInTheDocument()
  expect(screen.getByText("Trinôme")).toBeInTheDocument()
  expect(JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url).endsWith("/preview"))![1].body))).toEqual({ include_team_ids: [] })
  // A draw already took place: confirming asks once more, then sends the previewed seed.
  fireEvent.click(screen.getByRole("button", { name: "Valider ce tirage" }))
  expect(await screen.findByText(/Un tirage a déjà eu lieu le/)).toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/project/draw") && (init as RequestInit | undefined)?.method === "POST")).toBe(false)
  fireEvent.click(screen.getByRole("button", { name: "Confirmer le nouveau tirage" }))
  await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/project/draw") && (init as RequestInit | undefined)?.method === "POST")).toBe(true))
  const sent = JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/project/draw") && (init as RequestInit | undefined)?.method === "POST")![1].body))
  expect(sent).toEqual({ seed: "00c0ffee", fingerprint: "abcdabcdabcdabcd", include_team_ids: [], confirm_again: true })
  expect(await screen.findByText("Tirage enregistré : les étudiants tirés au sort sont prévenus.")).toBeInTheDocument()
})
