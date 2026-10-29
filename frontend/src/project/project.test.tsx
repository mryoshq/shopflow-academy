import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { ProjectText, splitBlocks } from "./ProjectText"
import { StudentProject } from "./StudentProject"
import { TeacherProject } from "./TeacherProject"
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
    if (url.endsWith("/accept")) return json({ team_id: 4 })
    if (url.includes("/submissions")) return json({ id: 1, version: 1, late: false }, 201)
    void init
    return json(studentData(team))
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<StudentProject />)
  expect(await screen.findByRole("heading", { name: "Projet CampusEquip" })).toBeInTheDocument()
  expect(screen.getByText("Votre créneau")).toBeInTheDocument()
  expect(screen.getByText("Créez ou rejoignez un binôme pour déposer.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Accepter" }))
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/student/project/invitations/9/accept", expect.objectContaining({ method: "POST" })))
  fireEvent.click(screen.getByRole("button", { name: "Créer mon binôme" }))
  expect(await screen.findByRole("button", { name: "Inviter" })).toBeInTheDocument()
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

it("teacher: reads every version of a submission in a side panel and comments", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/teams/2/milestones/1")) return json({ submissions: [{ id: 5, milestone_id: 1, version: 2, text: "| a | b |\n|---|---|\n| 1 | 2 |", link: "https://github.com/x/y",
      files: [{ id: 8, name: "rapport.pdf", size: 2048 }], late: true, submitted_by: "demo.etudiant01", created_at: "2026-11-20T10:00:00Z" }], comments: [] })
    if (url.endsWith("/comments") || url.endsWith("/grade")) return json({ ok: true })
    void init
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
  const fetchMock = vi.fn().mockImplementation(async (url: string) => url.endsWith("/grade") ? json({ ok: true }) : json(teacherData))
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
