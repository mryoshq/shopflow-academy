import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { system } from "./theme"
import { afterEach, expect, it, vi } from "vitest"
import { App } from "./App"

function show() {
  render(<ChakraProvider value={system}><App /></ChakraProvider>)
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

it("greets a student by the local part of the identifier and shows the empty state", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith("/auth/me")) return json({ id: 2, username: "prenom.nom@example.com", role: "student" })
    if (url.endsWith("/student/dashboard")) return json({ display_name: "prenom.nom", ai_enabled: false, courses: [] })
    throw new Error(`Unexpected path ${url}`)
  }))
  show()
  expect(await screen.findByRole("heading", { name: "Bonjour, prenom.nom" })).toBeInTheDocument()
  expect(screen.getByText("Aucun cours pour le moment")).toBeInTheDocument()
  expect(screen.queryByText(/@example.com/)).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /Continuer/ })).not.toBeInTheDocument()
})

it("shows a useful network error during session recovery", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
  show()
  expect(await screen.findByRole("alert")).toHaveTextContent("momentanément indisponible")
})
