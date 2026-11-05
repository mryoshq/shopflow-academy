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
  window.location.hash = ""
  vi.unstubAllGlobals()
  document.cookie = "academy_csrf=; Max-Age=0; Path=/"
})

it("shows a large Rafi while recovering the session, then on login without private API calls", async () => {
  let finish!: (value: { status: number; ok: boolean }) => void
  const fetchMock = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  vi.stubGlobal("fetch", fetchMock)
  show()
  expect(screen.getByTestId("rafi-loading")).toHaveTextContent("Chargement de votre espace…")
  expect(screen.getByTestId("rafi-loading").querySelector("img")).toHaveAttribute("width", "240")
  finish({ status: 401, ok: false })
  expect(await screen.findByTestId("rafi-login")).toBeInTheDocument()
  expect(screen.queryByTestId("rafi-loading")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Rafi, votre assistant" }))
  expect(fetchMock.mock.calls.every(([url]) => url === "/api/v1/auth/me")).toBe(true)
  expect(screen.getByRole("textbox", { name: "Identifiant" })).toBeInTheDocument()
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
  fireEvent.click(screen.getByRole("button", { name: "Se connecter" }))
  expect(await screen.findByRole("heading", { name: "Bonjour, demo.enseignant" })).toBeInTheDocument()
  const sent = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/auth/login"))
  // ADR-0038: no « Rester connecté » box any more; every session lasts 30 days.
  expect(JSON.parse(sent?.[1].body)).toEqual({ username: "demo.enseignant", password: "local-secret" })
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
  fireEvent.click(screen.getByRole("button", { name: /Compte et paramètres/ }))
  const logoutItem = await screen.findByRole("menuitem", { name: "Se déconnecter" })
  fireEvent.pointerMove(logoutItem, { pointerType: "mouse" })
  fireEvent.pointerDown(logoutItem, { pointerType: "mouse", button: 0 })
  fireEvent.click(logoutItem)
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
    if (url.endsWith("/teacher/observers/mail")) return json({ configured: false })
    return json([])
  })
  vi.stubGlobal("fetch", fetchMock)
  window.history.replaceState(null, "", "/")
  localStorage.setItem("shopflow:teacher:route", "#/reglages/observateurs")
  show()
  expect(await screen.findByRole("heading", { name: "Observateurs", level: 2 })).toBeInTheDocument()
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
    if (url.endsWith("/student/project")) return json({ cohort_id: null, cohorts: [] })
    if (url.endsWith("/student/rafi")) return json({ sounds: false, next: { kind: "done" } })
    if (url.includes("/notifications")) return json({ unread: 0, items: [] })
    throw new Error(`Unexpected path ${url}`)
  }))
  show()
  expect(await screen.findByRole("heading", { name: "Bonjour, prenom.nom" })).toBeInTheDocument()
  // ADR-0051: the Projet tab comes first; the Cours tab says there is no course yet.
  expect(screen.getByRole("tab", { name: "Projet" })).toHaveAttribute("aria-selected", "true")
  fireEvent.click(screen.getByRole("tab", { name: "Cours" }))
  expect(await screen.findByText("Aucun cours pour le moment")).toBeInTheDocument()
  expect(screen.queryByText(/@example.com/)).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /Continuer/ })).not.toBeInTheDocument()
})

/** What nginx or Cloudflare answers when the backend is down: an HTML page, never JSON. */
const gateway = (status = 502) => ({ status, ok: false, headers: { get: () => "text/html" }, json: async () => { throw new Error("html") } })
const student = { id: 7, username: "demo.etudiant01", role: "student" }
function studentApi(url: string) {
  if (url.endsWith("/student/dashboard")) return json({ display_name: "demo.etudiant01", ai_enabled: false, courses: [] })
  if (url.includes("/notifications")) return json({ unread: 0, items: [] })
  if (url.includes("/presence")) return json({ interval_seconds: 30, unread: 0 })
  if (url.includes("/radio")) return json({ streams: [] })
  if (url.includes("/leaderboard/classes")) return json([])
  return json({})
}

it("502 during session recovery: « momentanément indisponible », never the login, then back to the requested page", async () => {
  window.location.hash = "#/projet"
  let down = true
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url === "/health/live") return down ? gateway(502) : json({ status: "ok" })
    if (down) return gateway(502)
    if (url.endsWith("/auth/me")) return json(student)
    return studentApi(url)
  })
  vi.stubGlobal("fetch", fetchMock)
  show()
  expect(await screen.findByText(/La plateforme est momentanément indisponible\. Votre session et votre travail sont conservés\. Nouvelle tentative automatique/)).toBeInTheDocument()
  expect(screen.getByText(/^Rapidfox/)).toHaveTextContent("Rapidfox Academy")
  expect(screen.queryByRole("textbox", { name: "Identifiant" })).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/auth/logout"))).toBe(false)
  down = false
  // The automatic attempt (1 s, then 2 s…) finds the platform and reopens the session at the same address.
  expect(await screen.findByRole("button", { name: /^Compte et paramètres/ }, { timeout: 5000 })).toBeInTheDocument()
  expect(window.location.hash).toBe("#/projet")
  expect(screen.queryByText(/Nouvelle tentative automatique/)).not.toBeInTheDocument()
  window.location.hash = ""
}, 10000)

it("401 shows the login, without « Rester connecté », with the 30-day notice", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false }))
  show()
  expect(await screen.findByRole("textbox", { name: "Identifiant" })).toBeInTheDocument()
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
  expect(screen.getByText("Vous restez connecté 30 jours sur cet appareil. Sur un ordinateur partagé, déconnectez-vous depuis le menu de votre compte.")).toBeInTheDocument()
})

it("a 502 on a page already open shows the banner and keeps the session; a 401 alone signs out", async () => {
  window.location.hash = ""
  let down = false
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
    if (down && url !== "/health/live") return gateway(504)
    if (url === "/health/live") return down ? gateway(504) : json({ status: "ok" })
    if (url.endsWith("/auth/me")) return json(student)
    return studentApi(url)
  }))
  show()
  expect(await screen.findByRole("heading", { name: "Bonjour, demo.etudiant01" })).toBeInTheDocument()
  down = true
  const { api } = await import("./api")
  const read = api<{ courses: unknown[] }>("/student/dashboard")
  expect(await screen.findByText(/Nouvelle tentative automatique/)).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Bonjour, demo.etudiant01" })).toBeInTheDocument()  // still signed in
  down = false
  // The read that waited is sent again and succeeds; the banner leaves.
  expect((await read).courses).toEqual([])
  await vi.waitFor(() => expect(screen.queryByText(/Nouvelle tentative automatique/)).not.toBeInTheDocument(), { timeout: 5000 })
}, 10000)
