import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"
import { teacherView } from "./teacher-nav"

// ADR-0033: « Le voyage d'une donnée », the owner's application integrated in the Academy (fictional demo accounts only).
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => accounts.find((item) => item.username === name)!
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR ?? "test-results/voyage"
const SCENES = ["Avant le nouveau lot", "Les sources arrivent", "Attendre et vérifier", "Contrôler et charger", "Suivre les livraisons", "Deux usages de Redis", "Vérifier et observer"]

async function login(page: Page, name: string) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await page.getByLabel("Mot de passe").fill(account(name).password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${name}` })).toBeVisible()
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

const sceneButton = (page: Page, scene: number) =>
  page.getByRole("navigation", { name: "Scènes du parcours" }).getByRole("button", { name: `0${scene} ${SCENES[scene - 1]}` })

test("student: menu entry, the 7 scenes by address and buttons, back button, player", async ({ page }) => {
  await login(page, "demo.etudiant03")
  await page.getByRole("navigation", { name: "Expérience interactive" }).getByRole("button", { name: "Ouvrir l’expérience" }).click()
  await expect(page).toHaveURL(/#\/voyage\/1$/)
  await expect(page.getByRole("heading", { level: 1, name: "Le voyage d’une donnée." })).toBeVisible()
  await expect(sceneButton(page, 1)).toHaveAttribute("aria-current", "step")
  for (let scene = 2; scene <= 7; scene++) {
    await sceneButton(page, scene).click()
    await expect(sceneButton(page, scene)).toHaveAttribute("aria-current", "step")
    await expect(page).toHaveURL(new RegExp(`#/voyage/${scene}$`))
  }
  await page.goBack()
  await expect(page).toHaveURL(/#\/voyage\/6$/)
  await expect(sceneButton(page, 6)).toHaveAttribute("aria-current", "step")
  // A direct address opens its scene; the player moves step by step.
  await page.goto("/#/voyage/2")
  await expect(sceneButton(page, 2)).toHaveAttribute("aria-current", "step")
  await page.getByRole("button", { name: "Étape précédente" }).click()
  await expect(sceneButton(page, 1)).toHaveAttribute("aria-current", "step")
  await expect(page).toHaveURL(/#\/voyage\/1$/)
  // Dialogs stay inside the experience and close with Escape.
  await page.getByRole("button", { name: "Glossaire", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Le glossaire du voyage." })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

for (const [theme, width, height] of [["light", 1366, 768], ["dark", 1366, 768], ["light", 390, 844], ["dark", 390, 844]] as const) {
  test(`AA, no page overflow and capture: ${theme} at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" })
    await context.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
    const page = await context.newPage()
    await login(page, "demo.etudiant03")
    await page.goto("/#/voyage/4")
    await expect(sceneButton(page, 4)).toHaveAttribute("aria-current", "step")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await serious(page)).toEqual([])
    await page.screenshot({ path: `${shots}/voyage-${theme === "light" ? "clair" : "sombre"}-${width}.png`, animations: "disabled" })
    await context.close()
  })
}

test("teacher: the experience is in the menu and keeps its address", async ({ page }) => {
  await login(page, "demo.enseignant")
  await teacherView(page, "Le voyage d’une donnée")
  await expect(page).toHaveURL(/#\/voyage(\/1)?$/)
  await expect(page.getByRole("navigation", { name: "Scènes du parcours" })).toBeVisible()
  await sceneButton(page, 3).click()
  await expect(page).toHaveURL(/#\/voyage\/3$/)
  expect(await serious(page)).toEqual([])
})
