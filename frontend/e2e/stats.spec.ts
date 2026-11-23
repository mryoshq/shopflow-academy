import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/** Issue #110: statistics page (teacher) and its projection mode; AA in both themes, 1366 and 390 px, no names. */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => accounts.find((item) => item.username === name)!
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR

async function signIn(page: Page) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill("demo.enseignant")
  await page.getByLabel("Mot de passe").fill(account("demo.enseignant").password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("button", { name: /Compte et paramètres/ })).toBeVisible()
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations === Infinity))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1366, 390]) {
    test(`statistics and projection, ${theme}, ${width} px`, async ({ browser }) => {
      const context = await browser.newContext({ locale: "fr-FR", viewport: { width, height: width > 500 ? 900 : 844 }, reducedMotion: "reduce" })
      await context.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
      const page = await context.newPage()
      await signIn(page)
      await page.goto("/#/statistiques")
      await expect(page.getByRole("heading", { name: "Soutenances" })).toBeVisible()
      await expect(page.getByRole("region", { name: "Équipes ayant déposé" })).toBeVisible()
      await expect(page.locator("main")).not.toContainText(/demo\.etudiant/)
      expect(await serious(page)).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      const name = `${theme === "light" ? "clair" : "sombre"}-${width}`
      if (shots) await page.screenshot({ path: `${shots}/stats-${name}.png`, fullPage: true, animations: "disabled" })
      await page.getByRole("button", { name: "Mode projection" }).click()
      const projection = page.getByRole("dialog", { name: "Statistiques en mode projection" })
      await expect(projection.getByRole("heading", { level: 1 })).toBeVisible()
      await expect(projection).not.toContainText(/demo\.etudiant/)
      expect(await serious(page)).toEqual([])
      if (shots) await page.screenshot({ path: `${shots}/stats-projection-${name}.png`, animations: "disabled" })
      await page.keyboard.press("Escape")
      await expect(projection).toHaveCount(0)
      await context.close()
    })
  }
}
