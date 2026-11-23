import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { StudentProject } from "./StudentProject"
import { TeacherProject } from "./TeacherProject"
import type { DepositWindow, StudentProjectData, TeacherProjectData } from "./types"

/** Issue #107: no milestone dates; deposits stay open until the team's defence starts. */
const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
beforeEach(() => { document.cookie = `academy_csrf=${"E".repeat(43)}; Path=/` })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const student = (deposits: DepositWindow): StudentProjectData => ({
  cohort_id: 3, cohort: "Classe B3", cohorts: [{ id: 3, label: "Classe B3" }],
  team: { id: 2, members: [{ id: 11, name: "demo.etudiant01" }, { id: 12, name: "demo.etudiant02" }], invitations: [], full: false, deposits },
  invitations: [], classmates: [], slots: [],
  milestones: [{ id: 1, title: "Rendu final", instructions: "", due_at: null, deliverables: ["Dépôt GitHub"], sort_order: 0, submissions: [], comments: [] }],
})

it("student: open until the defence, no date; closed once it has started", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(student({ open: true, closes_at: null, reason: "slot" }))))
  const view = wrap(<StudentProject />)
  expect(await screen.findByText("Dépôts ouverts jusqu’au début de votre soutenance.")).toBeInTheDocument()
  const card = screen.getByTestId("milestone-card")
  expect(within(card).getByText("Jusqu’à votre soutenance")).toBeInTheDocument()
  expect(within(card).queryByText(/^À rendre le /)).toBeNull()
  expect(within(card).getByRole("button", { name: "Déposer" })).toBeInTheDocument()
  view.unmount()

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(student({ open: false, closes_at: "2026-11-23T08:00:00Z", reason: "slot" }))))
  wrap(<StudentProject />)
  expect(await screen.findByText("Les dépôts sont fermés : votre soutenance a commencé.")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Déposer" })).toBeNull()
  expect(screen.getByText("Les dépôts sont fermés.")).toBeInTheDocument()
})

const teacher: TeacherProjectData = {
  assignment_id: 7, cohort: "Classe B3", cohort_id: 3, deposits_close_at: null, slots: [],
  grid: { parts: [], base_max: 20, bonus_max: 10 }, alone: [],
  teams: [{ id: 2, members: [{ id: 11, name: "demo.etudiant01" }, { id: 12, name: "demo.etudiant02" }],
    deposits: { open: false, closes_at: "2026-11-23T08:00:00Z", reason: "slot", until: null },
    grade: { criteria: {}, comment: "", legacy: null, students: [] } }],
  milestones: [{ id: 1, title: "Rendu final", instructions: "", due_at: "2026-11-19T23:00:00Z", deliverables: [], sort_order: 0,
    submissions: [{ team_id: 2, version: 1, versions: 1, late: false, created_at: "2026-11-20T10:00:00Z" }] }],
}

it("teacher: removes a milestone's date, sets the class time and reopens a team for an hour", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => url.endsWith("/project/draw") ? json({ free: [], solo_teams: [], draws: [] }) : json(teacher))
  vi.stubGlobal("fetch", fetchMock)
  wrap(<TeacherProject assignmentId={7} />)
  await screen.findByText("demo.etudiant01 + demo.etudiant02")
  fireEvent.click(screen.getByRole("tab", { name: "Jalons" }))
  fireEvent.click(await screen.findByRole("button", { name: "Retirer la date" }))
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/teacher/project/milestones/1",
    expect.objectContaining({ method: "PATCH", body: JSON.stringify({ clear_due: true }) })))
  fireEvent.change(screen.getByLabelText("Fermeture pour les équipes sans créneau"), { target: { value: "2026-11-23T18:00" } })
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/teacher/classes/7/project/deposits", expect.objectContaining({ method: "PUT" })))

  fireEvent.click(screen.getByRole("tab", { name: "Dépôts" }))
  const table = await screen.findByRole("region", { name: "Ouverture des dépôts par équipe" })
  expect(within(table).getByText("Fermés")).toBeInTheDocument()
  fireEvent.click(within(table).getByRole("button", { name: "Rouvrir les dépôts de demo.etudiant01 + demo.etudiant02 pendant 1 h" }))
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/teacher/project/teams/2/deposits", expect.objectContaining({ method: "PUT" })))
})
