import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
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

const main = {
  course: { id: 5, slug: "python-data-engineering-sql", title: "Python Data Engineering & SQL Avancé", status: "draft" },
  cohort: { id: 3, label: "Classe B3 IA/Data", student_count: 10 }, assignment_id: null, assigned_version: null, latest_version: null,
}

it("a fresh teacher login lands on « Aujourd’hui »; the sidebar, sub-views, addresses and logout with CSRF work", async () => {
  window.history.replaceState(null, "", "/")
  localStorage.setItem("shopflow:teacher:route", "#/cours/regles")  // ignored after a fresh login
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith("/auth/me")) return { status: 401, ok: false }
    if (url.endsWith("/auth/login")) return json({ id: 1, username: "demo.enseignant", role: "teacher" })
    if (url.endsWith("/auth/logout")) return { status: 204, ok: true }
    if (url.endsWith("/teacher/main/setup")) return json(main)
    if (url.endsWith("/teacher/courses")) return json([{ id: 5, slug: "python-data-engineering-sql", title: "Python Data Engineering & SQL Avancé", status: "draft" }])
    if (url.endsWith("/teacher/courses/5")) return json({ id: 5, slug: "python-data-engineering-sql", title: "Python Data Engineering & SQL Avancé", status: "draft", description: "", objectives: [], modules: [] })
    if (url.endsWith("/teacher/courses/5/releases")) return json([])
    if (url.endsWith("/teacher/cohorts") || url.endsWith("/teacher/students")) return json([])
    if (url.includes("/teacher/cohorts/")) return json({ id: 3, label: "Classe B3 IA/Data", student_ids: [], release_ids: [] })
    if (url.includes("/notifications")) return json({ unread: 0, items: [] })
    throw new Error(`Unexpected path ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  show()
  fireEvent.change(await screen.findByRole("textbox", { name: "Identifiant" }), { target: { value: "demo.enseignant" } })
  fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "local-secret" } })
  fireEvent.click(screen.getByRole("checkbox", { name: /Rester connecté/ }))
  fireEvent.click(screen.getByRole("button", { name: "Se connecter" }))
  expect(await screen.findByRole("heading", { name: "Bonjour, demo.enseignant" })).toBeInTheDocument()
  const sent = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/auth/login"))
  expect(JSON.parse(sent?.[1].body)).toEqual({ username: "demo.enseignant", password: "local-secret", remember: true })
  expect(Object.keys(localStorage).filter((key) => /session|csrf|token/i.test(key))).toEqual([])
  expect(window.location.hash).toBe("#/aujourdhui")
  expect(screen.getByText("Votre cours n’est pas encore publié")).toBeInTheDocument()
  const nav = screen.getByRole("navigation", { name: "Navigation enseignant" })
  for (const name of ["Aujourd’hui", "Ma classe", "Mon cours", "Résultats", "Projet", "Leaderboard", "Réglages"]) expect(within(nav).getByRole("link", { name })).toBeInTheDocument()
  expect(within(nav).getByRole("link", { name: "Aujourd’hui" })).toHaveAttribute("aria-current", "page")
  // Mon cours: the studio with its sub-views as tabs, each with its own address.
  window.location.hash = "#/cours/plan"
  window.dispatchEvent(new HashChangeEvent("hashchange"))
  expect(await screen.findByRole("heading", { name: "Studio de cours" })).toBeInTheDocument()
  expect(await screen.findByRole("tab", { name: "Plan", selected: true })).toBeInTheDocument()
  for (const name of ["Missions", "Aperçu", "Import", "Règles", "Publication"]) expect(screen.getByRole("tab", { name })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("tab", { name: "Import" }))
  await vi.waitFor(() => expect(window.location.hash).toBe("#/cours/import"))
  expect(await screen.findByText("Nouveau cours")).toBeInTheDocument()
  expect(localStorage.getItem("shopflow:teacher:route")).toBe("#/cours/import")
  const setup = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/teacher/main/setup"))
  expect(setup?.[1].method).toBe("POST")
  document.cookie = `academy_csrf=${"A".repeat(43)}; Path=/`
  fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }))
  expect(await screen.findByRole("heading", { name: "Connexion" })).toBeInTheDocument()
  const logout = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/auth/logout"))
  expect(logout?.[1].headers["X-CSRF-Token"]).toBe("A".repeat(43))
})

it("a resumed session reopens the last view; a direct address wins over it", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith("/auth/me")) return json({ id: 1, username: "demo.enseignant", role: "teacher" })
    if (url.endsWith("/teacher/main/setup")) return json(main)
    if (url.includes("/notifications")) return json({ unread: 0, items: [] })
    if (url.endsWith("/teacher/notification-settings")) return json({ help: true, block: true })
    if (url.endsWith("/teacher/observers") || url.endsWith("/teacher/observers/views")) return json([])
    return json([])
  })
  vi.stubGlobal("fetch", fetchMock)
  window.history.replaceState(null, "", "/")
  localStorage.setItem("shopflow:teacher:route", "#/reglages/observateurs")
  show()
  expect(await screen.findByRole("heading", { name: "Observateurs en lecture seule" })).toBeInTheDocument()
  expect(window.location.hash).toBe("#/reglages/observateurs")
  cleanup()
  window.history.replaceState(null, "", "/#/reglages/notifications")
  show()
  expect(await screen.findByRole("tab", { name: "Notifications", selected: true })).toBeInTheDocument()
  localStorage.clear()
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
