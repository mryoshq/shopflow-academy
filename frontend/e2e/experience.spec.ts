import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync, writeFileSync } from "node:fs"

/**
 * Sprint 2, part B on the test stack (fictional accounts only): light and dark themes
 * (no flash, axe in both), one-column reader at 390x844, keyboard shortcuts 1-9 and
 * Enter, and the teacher's password reset (shown once, old password refused).
 */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = () => JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => accounts().find((item) => item.username === name)!
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR ?? "test-results/sprint2-b"
const COURSE = "Démonstration — Données ShopFlow"
const MISSION = "Frais de livraison après une jointure"

async function login(page: Page, name: string, password = account(name).password) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await page.getByLabel("Mot de passe").fill(password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${name}` })).toBeVisible()
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))
    .map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(" ")).join(" | ")}`)
}

async function openMission(page: Page, title: string) {
  await page.getByRole("region", { name: COURSE }).getByRole("button", { name: `Ouvrir : ${title}` }).click()
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme} theme: no flash, no serious axe violation, screenshots at 1366x768`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
    // The class is set by theme-init.js before React renders: check it on the bare document.
    await page.goto("/", { waitUntil: "commit" })
    await page.waitForFunction(() => document.documentElement.classList.length > 0)
    expect(await page.evaluate(() => document.documentElement.className)).toContain(theme)
    const radio = page.getByRole("radio", { name: theme === "dark" ? "Sombre" : "Clair" })
    await expect(radio).toHaveAttribute("aria-checked", "true")
    expect(await serious(page)).toEqual([])
    await page.screenshot({ path: `${shots}/${theme}-01-connexion.png`, animations: "disabled" })

    await login(page, "demo.etudiant01")
    expect(await serious(page)).toEqual([])
    await page.screenshot({ path: `${shots}/${theme}-02-tableau-de-bord.png`, fullPage: true, animations: "disabled" })
    await openMission(page, MISSION)
    expect(await serious(page)).toEqual([])
    await page.screenshot({ path: `${shots}/${theme}-03-mission.png`, fullPage: true, animations: "disabled" })

    await page.getByRole("button", { name: "Se déconnecter" }).click()
    await login(page, "demo.enseignant")
    await page.getByRole("tab", { name: "Ma classe" }).click()
    await expect(page.getByRole("heading", { name: "Déroulé de la journée" })).toBeVisible()
    expect(await serious(page)).toEqual([])
    await page.screenshot({ path: `${shots}/${theme}-04-ma-classe.png`, fullPage: true, animations: "disabled" })
    await page.getByRole("tab", { name: "Mon cours" }).click()
    expect(await serious(page)).toEqual([])
    await page.screenshot({ path: `${shots}/${theme}-05-mon-cours.png`, fullPage: true, animations: "disabled" })
  })
}

test("the theme switch follows the system, then remembers an explicit choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" })
  await page.goto("/")
  await expect(page.getByRole("radio", { name: "Système" })).toHaveAttribute("aria-checked", "true")
  await expect(page.locator("html")).toHaveClass(/dark/)
  // Arrow keys move inside the radio group.
  await page.getByRole("radio", { name: "Système" }).focus()
  await page.keyboard.press("ArrowRight")
  await expect(page.getByRole("radio", { name: "Clair" })).toHaveAttribute("aria-checked", "true")
  await expect(page.locator("html")).toHaveClass(/light/)
  await page.reload()
  await expect(page.locator("html")).toHaveClass(/light/)
  await page.getByRole("radio", { name: "Système" }).click()
})

test("390x844: one column, no horizontal scroll, shortcuts 1-9 and Enter", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, "demo.etudiant02")
  const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(await noHorizontalScroll()).toBe(true)
  await page.screenshot({ path: `${shots}/mobile-01-tableau-de-bord.png`, fullPage: true, animations: "disabled" })
  await openMission(page, MISSION)
  expect(await noHorizontalScroll()).toBe(true)
  expect(await serious(page)).toEqual([])

  // Help folds into one line, and the choice is remembered on this browser.
  const help = page.getByRole("button", { name: /^Aide/ })
  await expect(help).toHaveAttribute("aria-expanded", "true")
  await help.click()
  await expect(help).toHaveAttribute("aria-expanded", "false")
  await page.reload()
  await expect(page.getByRole("button", { name: /^Aide/ })).toHaveAttribute("aria-expanded", "false")

  // Shortcut N picks the N-th proposition (the theme switch is not part of the answers).
  const rightRadio = page.getByRole("radio", { name: /La jointure passe au grain article/ })
  const wrongRadio = page.getByRole("radio", { name: /SUM\(DISTINCT/ })
  const position = (radio: typeof rightRadio) => radio.evaluate((node) => Array.from(document.querySelectorAll("input[type=radio]")).indexOf(node as HTMLInputElement))
  const right = await position(rightRadio)
  const wrong = await position(wrongRadio)
  expect(right).toBeGreaterThanOrEqual(0)
  expect(wrong).toBeGreaterThanOrEqual(0)
  await page.locator("body").click({ position: { x: 5, y: 5 } })
  await page.keyboard.press(String(wrong + 1))
  await expect(wrongRadio).toBeChecked()
  await page.keyboard.press(String(right + 1))
  await expect(rightRadio).toBeChecked()
  await page.screenshot({ path: `${shots}/mobile-02-mission.png`, fullPage: true, animations: "disabled" })
  await page.locator("body").click({ position: { x: 5, y: 5 } })
  await page.keyboard.press("Enter")
  await expect(page.getByText("Bonne décision")).toBeVisible()
  await expect(page.getByRole("button", { name: "Mission suivante" }).first()).toBeVisible()
  expect(await noHorizontalScroll()).toBe(true)
  await page.screenshot({ path: `${shots}/mobile-03-reussite.png`, fullPage: true, animations: "disabled" })
})

test("the teacher resets a password: shown once, sessions closed, old password refused", async ({ page, browser }) => {
  const name = "demo.etudiant02"
  const old = account(name).password
  const learnerContext = await browser.newContext()
  const learner = await learnerContext.newPage()
  await login(learner, name, old)

  await login(page, "demo.enseignant")
  await page.getByRole("tab", { name: "Ma classe" }).click()
  await page.getByRole("button", { name: `Détail de ${name}` }).first().click()
  page.once("dialog", (dialog) => void dialog.accept())
  await page.getByRole("button", { name: "Réinitialiser le mot de passe" }).click()
  const shown = page.getByLabel("Nouveau mot de passe")
  await expect(shown).toBeVisible()
  const fresh = (await shown.innerText()).trim()
  expect(fresh.length).toBeGreaterThanOrEqual(10)
  // Keep the fictitious test-stack credentials usable by the next runs.
  writeFileSync(credentialsPath, JSON.stringify(accounts().map((item) => item.username === name ? { ...item, password: fresh } : item), null, 2))
  await page.screenshot({ path: `${shots}/reset-01-mot-de-passe.png`, fullPage: true, animations: "disabled", mask: [shown] })
  await page.getByRole("button", { name: "J’ai noté le mot de passe" }).click()
  await expect(shown).toHaveCount(0)
  await expect(page.getByText(`Mot de passe réinitialisé : ${name}`).first()).toBeVisible()

  // The student's open session is closed.
  expect((await learner.request.get("/api/v1/student/dashboard")).status()).toBe(401)
  await learnerContext.close()
  const retry = await browser.newContext()
  const second = await retry.newPage()
  await second.goto("/")
  await second.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await second.getByLabel("Mot de passe").fill(old)
  await second.getByRole("button", { name: "Se connecter" }).click()
  await expect(second.getByRole("alert")).toBeVisible()
  await login(second, name, fresh)
  await retry.close()
})
