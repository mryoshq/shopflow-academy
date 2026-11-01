import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/** ADR-0048: grotesque self-hosted, large rounded panels, dark dotted header, typewriter word, AA in both themes. */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => accounts.find((item) => item.username === name)!
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations === Infinity))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

async function signIn(page: Page, name: string) {
  await page.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await page.getByLabel("Mot de passe").fill(account(name).password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${name}` })).toBeVisible()
}

test("the typewriter word changes, the font is served by the Academy, the title keeps one accessible name", async ({ page }) => {
  const fonts: string[] = []
  page.on("request", (request) => { if (request.resourceType() === "font") fonts.push(request.url()) })
  await page.goto("/")
  const title = page.getByRole("heading", { level: 1, name: "Apprenez la data en prenant de vraies décisions." })
  await expect(title).toBeVisible()
  const typed = page.getByTestId("typewriter")
  await expect(typed).not.toHaveText("la data", { timeout: 8000 })
  await expect(title).toHaveAccessibleName("Apprenez la data en prenant de vraies décisions.")
  expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check("600 40px 'Space Grotesk Variable'") })).toBe(true)
  expect(fonts.length).toBeGreaterThan(0)
  expect(fonts.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true)
  expect(await title.evaluate((node) => getComputedStyle(node).fontFamily)).toContain("Space Grotesk")
})

for (const theme of ["light", "dark"] as const) {
  for (const width of [1366, 390]) {
    test(`AA and captures, ${theme}, ${width} px (still with « Réduire les animations »)`, async ({ browser }) => {
      const name = `${theme === "light" ? "clair" : "sombre"}-${width}`
      const context = await browser.newContext({ locale: "fr-FR", viewport: { width, height: width > 500 ? 900 : 844 }, reducedMotion: "reduce" })
      await context.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
      const page = await context.newPage()
      await page.goto("/")
      await expect(page.getByTestId("typewriter")).toHaveText("la data")
      await page.waitForTimeout(3000)
      await expect(page.getByTestId("typewriter")).toHaveText("la data")  // frozen
      expect(await serious(page)).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      if (shots) await page.screenshot({ path: `${shots}/connexion-${name}.png`, fullPage: true, animations: "disabled" })

      await signIn(page, "demo.etudiant03")
      const hero = page.locator("[data-theme-panel=hero]")
      await expect(hero).toBeVisible()
      await expect(hero.getByText("Tableau de bord")).toBeVisible()
      await expect(page.getByTestId("updated-at")).toContainText(/Mis à jour à \d{2}:\d{2}/)
      expect(await hero.evaluate((node) => getComputedStyle(node).borderTopLeftRadius)).toBe("24px")
      expect(await serious(page)).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      if (shots) await page.screenshot({ path: `${shots}/tableau-${name}.png`, fullPage: true, animations: "disabled" })
      await context.close()
    })
  }
}
