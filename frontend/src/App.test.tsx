import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import { afterEach, expect, it, vi } from "vitest"
import { App } from "./App"

function show() {
  render(<ChakraProvider value={defaultSystem}><App /></ChakraProvider>)
}

const json = (body: unknown) => ({ status: 200, ok: true, json: async () => body })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.cookie = "academy_csrf=; Max-Age=0; Path=/"
})

it("shows login without course content to an anonymous visitor", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false }))
  show()
  expect(await screen.findByRole("heading", { name: "Connexion" })).toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "Identifiant" })).toBeInTheDocument()
  expect(screen.queryByLabelText("Studio de cours")).not.toBeInTheDocument()
})

it("opens the teacher studio and logs out with CSRF", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith("/auth/me")) return { status: 401, ok: false }
    if (url.endsWith("/auth/login")) return json({ id: 1, username: "demo.enseignant", role: "teacher" })
    if (url.endsWith("/auth/logout")) return { status: 204, ok: true }
    if (url.endsWith("/teacher/courses") || url.endsWith("/teacher/cohorts") || url.endsWith("/teacher/students")) return json([])
    throw new Error(`Unexpected path ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  show()
  fireEvent.change(await screen.findByRole("textbox", { name: "Identifiant" }), { target: { value: "demo.enseignant" } })
  fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "local-secret" } })
  fireEvent.click(screen.getByRole("button", { name: "Se connecter" }))
  expect(await screen.findByRole("heading", { name: "Studio de cours" })).toBeInTheDocument()
  expect(await screen.findByText("Aucun cours créé. Commencez ci-dessous.")).toBeInTheDocument()
  document.cookie = `academy_csrf=${"A".repeat(43)}; Path=/`
  fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }))
  expect(await screen.findByRole("heading", { name: "Connexion" })).toBeInTheDocument()
  const logout = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/auth/logout"))
  expect(logout?.[1].headers["X-CSRF-Token"]).toBe("A".repeat(43))
})

it("shows assigned courses to a student without corrections", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith("/auth/me")) return json({ id: 2, username: "demo.etudiant", role: "student" })
    if (url.endsWith("/student/courses")) return json([{ id: 7, course_id: 4, version: 1, title: "Démo SQL" }])
    if (url.endsWith("/student/courses/7")) return json({ title: "Démo SQL", description: "Démonstration", version: 1, objectives: [], modules: [{ id: 1, title: "Module", sort_order: 0, chapters: [{ id: 2, title: "Chapitre", sort_order: 0, missions: [{ id: 3, title: "Mission", slug: "mission", sort_order: 0, definition: { kind: "single_choice", scenario: "Comparer A < B", instructions: "Choisir", choices: [{ id: "a", label: "A" }, { id: "b", label: "B" }], match_targets: [], hints: [], resources: [], display_data: null } }] }] }] })
    throw new Error(`Unexpected path ${url}`)
  }))
  show()
  fireEvent.click(await screen.findByRole("button", { name: "Démo SQL · version 1" }))
  expect(await screen.findByLabelText("Aperçu de Mission")).toBeInTheDocument()
  expect(screen.queryByText("Simuler cette réponse")).not.toBeInTheDocument()
  expect(screen.queryByText(/correction privée/i)).not.toBeInTheDocument()
})

it("shows a useful network error during session recovery", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
  show()
  expect(await screen.findByRole("alert")).toHaveTextContent("momentanément indisponible")
})
