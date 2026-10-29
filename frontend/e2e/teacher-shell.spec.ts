import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"
import { teacherView } from "./teacher-nav"

/**
 * ADR-0031: the teacher single-page application. One address per view, the browser back button,
 * direct links, Ctrl+K, the « Aujourd’hui » cards and AA in both themes. Read-only: it never opens a
 * block nor publishes, so the other specs keep their state (classroom.spec and studio.spec do that).
 */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const teacher = accounts.find((item) => item.username === "demo.enseignant")!
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR ?? "test-results/o-enseignant"

async function login(page: Page) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(teacher.username)
  await page.getByLabel("Mot de passe").fill(teacher.password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${teacher.username}` })).toBeVisible()
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

const hash = (page: Page) => new URL(page.url()).hash

test("addresses, back button, direct links and Ctrl+K", async ({ page }) => {
  await login(page)
  expect(hash(page)).toBe("#/aujourdhui")
  for (const card of ["Bloc ouvert", "Étudiants en ligne", "Demandes d’aide en attente", "Étudiants bloqués", "Progression moyenne"])
    await expect(page.getByRole("region", { name: card })).toBeVisible()

  // A card leads to its view; sub-tabs change the address; back returns step by step.
  await page.getByRole("region", { name: "Demandes d’aide en attente" }).getByRole("link", { name: "Traiter les demandes" }).click()
  await expect(page).toHaveURL(/#\/classe\/aide$/)
  await expect(page.getByRole("tab", { name: "Demandes d’aide", exact: true })).toHaveAttribute("aria-selected", "true")
  await teacherView(page, "Ma classe", "Étudiants")
  await expect(page).toHaveURL(/#\/classe\/etudiants$/)
  await expect(page.getByRole("table", { name: /^Progression de la classe/ })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/#\/classe\/frise$/)
  await expect(page.getByRole("tab", { name: "Frise", exact: true })).toHaveAttribute("aria-selected", "true")
  await page.goBack()
  await expect(page).toHaveURL(/#\/classe\/aide$/)
  await page.goBack()
  await expect(page).toHaveURL(/#\/aujourdhui$/)
  await expect(page.getByRole("heading", { name: `Bonjour, ${teacher.username}` })).toBeVisible()

  // Direct addresses open the right view and sub-view.
  await page.goto("/#/cours/regles")
  await expect(page.getByRole("heading", { name: "Règles contre le clic au hasard" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Règles", exact: true })).toHaveAttribute("aria-selected", "true")
  await page.goto("/#/resultats")
  await expect(page.getByRole("heading", { level: 1, name: "Résultats" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Exporter les notes (CSV)" })).toBeVisible()
  await page.goto("/#/projet")
  await expect(page.getByRole("heading", { level: 1, name: "Projet CampusEquip" })).toBeVisible()

  // The publication tab of « Mon cours » (publishing itself is covered by studio.spec).
  await teacherView(page, "Mon cours", "Publication")
  await expect(page).toHaveURL(/#\/cours\/publication$/)

  // Ctrl+K: search a view and go there with the keyboard.
  await page.keyboard.press("Control+k")
  const search = page.getByRole("combobox", { name: "Rechercher une vue, un étudiant ou un bloc" })
  await expect(search).toBeFocused()
  await search.fill("Ma classe")
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/#\/classe\/frise$/)
  await expect(page.getByRole("heading", { level: 1, name: "Ma classe" })).toBeVisible()

  // A resumed session reopens the last view.
  await page.goto("/")
  await expect(page).toHaveURL(/#\/classe\/frise$/)
})

for (const theme of ["light", "dark"] as const) {
  test(`AA and captures in the ${theme} theme`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" })
    await context.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
    const page = await context.newPage()
    const name = theme === "light" ? "clair" : "sombre"
    await login(page)
    await expect(page.getByRole("region", { name: "Progression moyenne" })).toBeVisible()
    expect(await serious(page)).toEqual([])
    await page.screenshot({ path: `${shots}/apres-aujourdhui-${name}.png`, fullPage: true, animations: "disabled" })
    await teacherView(page, "Ma classe", "Frise")
    await expect(page.getByRole("heading", { name: "Déroulé de la journée" })).toBeVisible()
    expect(await serious(page)).toEqual([])
    await page.screenshot({ path: `${shots}/apres-ma-classe-${name}.png`, fullPage: true, animations: "disabled" })
    await teacherView(page, "Ma classe", "Étudiants")
    await page.getByRole("button", { name: /^Détail de demo\.etudiant/ }).first().click()
    await expect(page.getByRole("dialog", { name: /^Détail : / })).toBeVisible()
    expect(await serious(page)).toEqual([])
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await context.close()
  })
}
