import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { CourseImport, ReleaseTools, slugify } from "./ContentAdmin"

const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
const file = (content: string) => new File([content], "cours.json", { type: "application/json" })

beforeEach(() => { document.cookie = `academy_csrf=${"D".repeat(43)}; Path=/` })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it("dry-runs a valid file, asks for a new title on slug conflict and imports", async () => {
  const bodies: { url: string; body: { slug?: string; title?: string } }[] = []
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    bodies.push({ url, body: JSON.parse(String(init?.body)) })
    if (url.includes("dry_run")) return json({ dry_run: true, valid: true, title: "Démo", slug: "demo", objectives: 3, modules: 1, chapters: 1, missions: 3, missions_without_definition: 0, slug_available: false })
    return json({ dry_run: false, id: 42, title: "Copie", slug: "copie", objectives: 3, modules: 1, chapters: 1, missions: 3, missions_without_definition: 0, slug_available: true }, 201)
  }))
  const onImported = vi.fn()
  wrap(<CourseImport onImported={onImported} />)
  await act(async () => { fireEvent.change(screen.getByLabelText("Fichier de cours JSON"), { target: { files: [file('{"format":"shopflow-course"}')] } }) })
  expect(await screen.findByText("Fichier valide : « Démo »")).toBeInTheDocument()
  expect(screen.getByText(/existe déjà/)).toBeInTheDocument()
  const confirm = screen.getByRole("button", { name: "Importer comme nouveau brouillon" })
  expect(confirm).toBeDisabled()
  fireEvent.change(screen.getByLabelText("Titre du nouveau cours"), { target: { value: "Copie été" } })
  await act(async () => { fireEvent.click(confirm) })
  expect(onImported).toHaveBeenCalledWith(42)
  expect(bodies.at(-1)?.body).toMatchObject({ slug: "copie-ete", title: "Copie été" })
  expect(slugify("Qualité des données")).toBe("qualite-des-donnees")
})

it("shows each validation error with its path and never imports", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: { message: "invalid course document", errors: [
    { path: "modules.0.chapters.0.missions.0.objective_codes", message: "Objectif inconnu : NOPE" }, { path: "course.title", message: "Value error" }] } }, 422)))
  const onImported = vi.fn()
  wrap(<CourseImport onImported={onImported} />)
  await act(async () => { fireEvent.change(screen.getByLabelText("Fichier de cours JSON"), { target: { files: [file("{}")] } }) })
  expect(await screen.findByRole("alert")).toHaveTextContent("Le fichier ne respecte pas le format attendu.")
  expect(screen.getByText("modules.0.chapters.0.missions.0.objective_codes")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Importer comme nouveau brouillon" })).not.toBeInTheDocument()
  expect(onImported).not.toHaveBeenCalled()
})

it("rejects unreadable JSON locally", async () => {
  vi.stubGlobal("fetch", vi.fn())
  wrap(<CourseImport onImported={vi.fn()} />)
  await act(async () => { fireEvent.change(screen.getByLabelText("Fichier de cours JSON"), { target: { files: [file("pas du json")] } }) })
  expect(await screen.findByText("Ce fichier n’est pas un JSON lisible.")).toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})

it("restores a release into the draft and lists history with backups", async () => {
  const calls: string[] = []
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`)
    if (url.endsWith("/restore")) return json({ restored_missions: 3, release_version: 1 })
    return json([{ id: 7, action: "course.restore", resource_type: "course", actor: "demo.enseignant", created_at: "2026-10-28T01:00:00Z", has_backup: true }])
  }))
  const onRestored = vi.fn()
  wrap(<ReleaseTools courseId={5} archived={false} refreshKey={0} onRestored={onRestored}
    releases={[{ id: 9, version: 1, status: "published", published_at: "2026-10-27T20:00:00Z" }]} />)
  expect(await screen.findByText(/Brouillon restauré depuis une version/)).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "sauvegarde du brouillon précédent" })).toHaveAttribute("href", "/api/v1/teacher/history/7/backup")
  expect(screen.getByRole("link", { name: "Exporter la version 1" })).toHaveAttribute("href", "/api/v1/teacher/releases/9/export")
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Restaurer le brouillon depuis la version 1" })) })
  expect(calls).toContain("POST /api/v1/teacher/courses/5/restore")
  expect(onRestored).toHaveBeenCalled()
  expect(await screen.findByText(/L’ancien brouillon est sauvegardé/)).toBeInTheDocument()
})
