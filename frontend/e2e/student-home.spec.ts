import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/** ADR-0051: the student's home page during the project: Projet first, Cours, Ressources; the old addresses still work. */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => accounts.find((item) => item.username === name)!
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR
const STUDENT = "demo.etudiant04"

async function signIn(page: Page) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(STUDENT)
  await page.getByLabel("Mot de passe").fill(account(STUDENT).password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${STUDENT}` })).toBeVisible()
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations === Infinity))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

test("Projet first, then Cours and Ressources; #/projet and #/mission/… still work; nothing meant for the teacher", async ({ page }) => {
  await signIn(page)
  const tabs = page.getByRole("tablist", { name: "Votre espace" }).getByRole("tab")
  await expect(tabs).toHaveText(["Projet", "Cours", "Ressources"])
  await expect(page.getByRole("tab", { name: "Projet" })).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("heading", { name: "Jalons" })).toBeVisible()
  // The animation is a single button after the project's content, never shown before the action.
  await expect(page.getByRole("button", { name: /Voir l’animation/ })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Étapes du voyage" })).toHaveCount(0)
  await expect(page.getByText(/Cohorte|comptes fictifs|assistant IA|pendant la séance|^Version \d/)).toHaveCount(0)

  await page.getByRole("tab", { name: "Cours" }).click()
  await expect(page).toHaveURL(/#\/cours$/)
  const open = page.getByRole("button", { name: /^Ouvrir : / }).first()
  await expect(open).toBeVisible()
  await page.getByRole("tab", { name: "Ressources" }).click()
  await expect(page).toHaveURL(/#\/ressources$/)
  await expect(page.getByRole("heading", { name: "Documents et liens" })).toBeVisible()

  // Old addresses, used by Rafi and the notifications.
  await page.goto("/#/projet")
  await expect(page.getByRole("tab", { name: "Projet" })).toHaveAttribute("aria-selected", "true")
  const dashboard = await (await page.request.get("/api/v1/student/dashboard")).json() as { courses: { missions: { mission_version_id: number; status: string; title: string }[] }[] }
  const mission = dashboard.courses.flatMap((course) => course.missions).find((item) => item.status !== "locked")!
  await page.goto(`/#/mission/${mission.mission_version_id}`)
  await expect(page.getByRole("heading", { level: 1, name: mission.title })).toBeVisible()
})

for (const theme of ["light", "dark"] as const) {
  for (const width of [1366, 390]) {
    test(`AA on the three tabs, ${theme}, ${width} px`, async ({ browser }) => {
      const context = await browser.newContext({ locale: "fr-FR", viewport: { width, height: width > 500 ? 900 : 844 }, reducedMotion: "reduce" })
      await context.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
      const page = await context.newPage()
      await signIn(page)
      const name = `${theme === "light" ? "clair" : "sombre"}-${width}`
      for (const tab of ["projet", "cours", "ressources"]) {
        await page.goto(`/#/${tab}`)
        await expect(page.getByRole("tab", { selected: true })).toBeVisible()
        expect(await serious(page)).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
        if (shots) await page.screenshot({ path: `${shots}/apres-${name}-${tab}.png`, fullPage: true, animations: "disabled" })
      }
      await context.close()
    })
  }
}
