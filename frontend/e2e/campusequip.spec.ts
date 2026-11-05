import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

/** ADR-0044: « Le voyage d'une location » (CampusEquip), full width, steps in the address, static files with their fingerprints. */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => accounts.find((item) => item.username === name)!
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR

async function signIn(page: Page, name: string) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await page.getByLabel("Mot de passe").fill(account(name).password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${name}` })).toBeVisible()
}

async function serious(page: Page) {
  // The experience has looping animations (pulses): wait only for the finite ones.
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations === Infinity))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

const fullWidth = (page: Page) => page.evaluate(() => {
  const main = document.getElementById("contenu")!.getBoundingClientRect()
  return Math.round(main.width) >= document.documentElement.clientWidth - 1
})

test("student: the dashboard opens CampusEquip, the step follows the address, the files are the delivered ones", async ({ page, request }) => {
  await signIn(page, "demo.etudiant07")
  await page.getByRole("button", { name: /Voir l’animation/ }).click()  // ADR-0051: behind the Projet tab's last button
  await expect(page).toHaveURL(/#\/campusequip\/1$/)
  const steps = page.getByRole("navigation", { name: "Étapes du voyage" })
  await expect(steps).toBeVisible()
  expect(await fullWidth(page)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(await serious(page)).toEqual([])
  if (shots) await page.screenshot({ path: `${shots}/campusequip-1.png` })
  await steps.getByRole("button", { name: /La qualité/ }).click()
  await expect(page).toHaveURL(/#\/campusequip\/3$/)
  await page.goBack()
  await expect(steps.locator("[aria-current]")).toContainText("Le territoire")
  await page.goto("/#/campusequip/5")
  await expect(steps.locator("[aria-current]")).toContainText("Les indicateurs")
  expect(await serious(page)).toEqual([])
  // Static files of the experience: served as delivered (fingerprints of provenance.json), no correction.
  const provenance = await (await request.get("/experiences/campusequip/data/provenance.json")).json()
  const pdf = await request.get("/experiences/campusequip/documents/Sujet_CampusEquip_axes_1_2.pdf")
  expect(pdf.ok()).toBe(true)
  expect(createHash("sha256").update(await pdf.body()).digest("hex")).toBe(provenance.subjectSha256)
  const csv = await request.get("/experiences/campusequip/data/mixte-1.csv")
  expect(csv.ok()).toBe(true)
  expect((await csv.text()).split("\n")[0]).toContain("contract_id")
  // The voyage also takes the whole width.
  await page.goto("/#/voyage/1")
  await expect(page.getByRole("navigation", { name: "Scènes du parcours" })).toBeVisible()
  expect(await fullWidth(page)).toBe(true)
})

test("teacher: CampusEquip in the sidebar, full width; « Réduire les animations » is followed", async ({ browser }) => {
  const context = await browser.newContext({ locale: "fr-FR", reducedMotion: "reduce" })
  const page = await context.newPage()
  await signIn(page, "demo.enseignant")
  await page.getByRole("link", { name: "Expérience CampusEquip" }).click()
  await expect(page).toHaveURL(/#\/campusequip$|#\/campusequip\/1$/)
  await expect(page.getByRole("navigation", { name: "Étapes du voyage" })).toBeVisible()
  await expect(page.locator(".campusequip-root .app.reduced")).toHaveCount(1)
  const main = await page.evaluate(() => Math.round(document.getElementById("contenu")!.getBoundingClientRect().width))
  const nav = await page.evaluate(() => Math.round(document.querySelector("nav[aria-label='Navigation enseignant']")!.getBoundingClientRect().width))
  expect(main).toBeGreaterThanOrEqual(1366 - nav - 2)
  expect(await serious(page)).toEqual([])
  await context.close()
})
