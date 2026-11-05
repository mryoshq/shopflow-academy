import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { App } from "../App"
import { StudentDashboard } from "../student/StudentDashboard"
import type { Dashboard } from "../student/types"
import { AccountMenu } from "../preferences/AccountMenu"
import { PreferencesProvider } from "../preferences/PreferencesProvider"
import { LANGUAGES, detectLanguage, formatDate, formatNumber, info, language, setLanguage, t, tn } from "./index"
import { serverText } from "./server"

const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
const json = (body: unknown) => ({ status: 200, ok: true, json: async () => body })
const navigatorLanguages = (languages: string[]) => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(languages)
  vi.spyOn(navigator, "language", "get").mockReturnValue(languages[0])
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); setLanguage("fr"); localStorage.clear() })

it("the browser language by default, the remembered choice first, French otherwise", () => {
  navigatorLanguages(["en-GB", "fr"])
  expect(detectLanguage()).toBe("en")
  navigatorLanguages(["de-DE", "es"])
  expect(detectLanguage()).toBe("fr")
  localStorage.setItem("shopflow:lang", "en")
  expect(detectLanguage()).toBe("en")
  localStorage.setItem("shopflow:lang", "xx")
  navigatorLanguages(["fr-FR"])
  expect(detectLanguage()).toBe("fr")
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
  navigatorLanguages(["en-US"])
  expect(detectLanguage()).toBe("en")
})

it("choosing a language updates <html lang>, the direction and the remembered choice", () => {
  setLanguage("en")
  expect([language(), document.documentElement.lang, document.documentElement.dir, localStorage.getItem("shopflow:lang")]).toEqual(["en", "en", "ltr", "en"])
  expect(LANGUAGES.map((item) => item.code)).toEqual(["fr", "en"])
  expect(info("en").locale).toBe("en-GB")
  setLanguage("fr")
  expect(document.documentElement.lang).toBe("fr")
})

it("French is the reference text; English has its own words, plurals and Intl formats", () => {
  expect(t("Bonjour,")).toBe("Bonjour,")
  expect(tn("{{count}} mission réussie sur {{total}}", 0, { total: 3 })).toBe("0 mission réussie sur 3")
  expect(tn("{{count}} mission réussie sur {{total}}", 2, { total: 3 })).toBe("2 missions réussies sur 3")
  expect(formatNumber(12.5, { minimumFractionDigits: 1 })).toBe("12,5")
  setLanguage("en")
  expect(t("Bonjour,")).toBe("Hello,")
  expect(t("Ouvrir : {{title}}", { title: "CSV" })).toBe("Open: CSV")
  expect(tn("{{count}} mission réussie sur {{total}}", 0, { total: 3 })).toBe("0 missions passed out of 3")
  expect(tn("{{count}} mission réussie sur {{total}}", 1, { total: 3 })).toBe("1 mission passed out of 3")
  expect(formatNumber(12.5, { minimumFractionDigits: 1 })).toBe("12.5")
  expect(formatDate("2026-10-31T10:00:00Z", { day: "numeric", month: "long", timeZone: "UTC" })).toBe("31 October")
})

it("the server's automatic notifications are shown in English; a teacher's message stays as written", () => {
  setLanguage("en")
  expect(serverText("Le bloc « Jointures » est ouvert.")).toBe("Block “Jointures” is open.")
  expect(serverText("Le bloc « Jointures » est ouvert pour vous.")).toBe("Block “Jointures” is open for you.")
  expect(serverText("salma demande de l’aide sur « Frais ».")).toBe("salma is asking for help on “Frais”.")
  expect(serverText("« Bloc 1 » terminé par 1 étudiant sur 10 (10 %).")).toBe("“Bloc 1” finished by 1 student out of 10 (10 %).")
  expect(serverText("Pause de 5 minutes.", "message")).toBe("Pause de 5 minutes.")
  setLanguage("fr")
  expect(serverText("Le bloc « Jointures » est ouvert.")).toBe("Le bloc « Jointures » est ouvert.")
})

it("in English: the login page", async () => {
  setLanguage("en")
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false }))
  wrap(<App />)
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { level: 1, name: "Learn data by making real decisions." })).toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "Username" })).toBeInTheDocument()
  expect(screen.getByLabelText("Password")).toBeInTheDocument()
  expect(screen.getByText(/You stay signed in for 30 days/)).toBeInTheDocument()
})

it("in English: the student dashboard, course content kept in French", async () => {
  setLanguage("en")
  const data: Dashboard = { display_name: "salma", ai_enabled: false, courses: [{
    release_id: 3, title: "Démonstration — Données ShopFlow", description: "", version: 1, is_demo: true, resources: [],
    score: { core_points: 12.5, core_possible: 20, bonus_points: 0, bonus_possible: 0, completed: 1, total: 3 }, paused: false,
    missions: [
      { mission_version_id: 11, title: "Frais", module: "M", chapter: "C", kind: "single_choice", estimated_duration_minutes: 10, status: "completed", locked_by: [], best_points: 10, possible: 10, bonus: false },
      { mission_version_id: 13, title: "Ordre", module: "M", chapter: "C", kind: "reorder", estimated_duration_minutes: 8, status: "locked", locked_by: ["Frais"], best_points: 0, possible: 5, bonus: false },
    ] }] }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(data)))
  wrap(<StudentDashboard navigate={vi.fn()} tab="cours" />)
  expect(await screen.findByRole("heading", { name: "Hello, salma" })).toBeInTheDocument()
  expect(screen.getByText("Your score")).toBeInTheDocument()
  expect(screen.getByText(/1 mission passed out of 3\. Your best attempt counts\./)).toBeInTheDocument()
  expect(screen.getByRole("img", { name: "12.5 points out of 20" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Locked: Ordre" })).toBeDisabled()
  expect(screen.getByText("Unlocks after: Frais")).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Démonstration — Données ShopFlow" })).toBeInTheDocument()
})

it("the account menu offers Français and English, each named in its own language", async () => {
  render(<ChakraProvider value={system}><PreferencesProvider account={{ username: "salma", role: "student" }}>
    <AccountMenu account={{ username: "salma", role: "student" }} onLogout={vi.fn()} variant="header" />
  </PreferencesProvider></ChakraProvider>)
  fireEvent.keyDown(window, { key: ",", ctrlKey: true })
  const select = await screen.findByRole("combobox", { name: "Langue de l’interface" })
  expect([...(select as HTMLSelectElement).options].map((option) => [option.value, option.textContent, option.lang])).toEqual([["fr", "Français", "fr"], ["en", "English", "en"]])
  fireEvent.change(select, { target: { value: "en" } })
  expect(language()).toBe("en")
  expect(document.documentElement.lang).toBe("en")
  expect(localStorage.getItem("shopflow:lang")).toBe("en")
})

it("the offline page switches to English when English was chosen", () => {
  const html = readFileSync(resolve(process.cwd(), "public/offline.html"), "utf8")
  document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("<script src=\"/offline.js\">"))
  document.documentElement.lang = "en"
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)))
  new Function(readFileSync(resolve(process.cwd(), "public/offline.js"), "utf8"))()
  expect(document.getElementById("heading")).toHaveTextContent("Temporarily unavailable")
  expect(document.getElementById("retry")).toHaveTextContent("Try again now")
  expect(document.getElementById("next")).toHaveTextContent(/Next attempt in 1 s/)
  document.body.innerHTML = ""
})
