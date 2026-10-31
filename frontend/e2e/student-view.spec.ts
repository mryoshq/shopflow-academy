import { test, expect, request, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/**
 * ADR-0043: « Vue étudiant » (read only, checked through the API) and the « n en ligne » panel.
 * Demo accounts of the test stack only.
 */
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
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

/** What the server knows about the class: progress, attempts, points, help. */
async function classState(baseURL: string) {
  const ctx = await request.newContext({ baseURL })
  await ctx.post("/api/v1/auth/login", { data: { username: "demo.enseignant", password: account("demo.enseignant").password } })
  const assignment = (await (await ctx.get("/api/v1/teacher/classes")).json())[0].id
  const { generated_at: _, ...overview } = await (await ctx.get(`/api/v1/teacher/classes/${assignment}/overview`)).json()
  void _
  const live = await (await ctx.get(`/api/v1/teacher/classes/${assignment}/live`)).json()
  await ctx.dispose()
  // Presence is left out: another student may connect or leave meanwhile (the teacher is never in it).
  return { overview, live: live.students.map((s: { id: number; cells: unknown; help: boolean }) => [s.id, s.cells, s.help]), help: live.help_pending }
}

test("« Vue étudiant »: the student's application, answers checked, nothing recorded on the server", async ({ page, baseURL }) => {
  const before = await classState(baseURL!)
  await signIn(page, "demo.enseignant")
  await page.getByRole("link", { name: "Vue étudiant" }).click()
  await expect(page).toHaveURL(/#\/etudiant$/)
  await expect(page.getByTestId("student-view-banner")).toHaveText("Vue étudiant, rien n’est enregistré")
  await expect(page.getByRole("button", { name: "Revenir à mon interface" })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Navigation enseignant" })).toHaveCount(0)
  // Every block, so that a mission is there even if the class has none open.
  await page.getByText("Afficher aussi les blocs fermés").click()
  const open = page.getByRole("button", { name: /^Ouvrir : / }).first()
  await expect(open).toBeVisible()
  expect(await serious(page)).toEqual([])
  if (shots) await page.screenshot({ path: `${shots}/student-view-dashboard.png`, fullPage: true })
  await open.click()
  await expect(page).toHaveURL(/#\/etudiant\/mission\/\d+$/)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  // Answer like a student when the mission has choices (or « J'ai compris » on a lesson).
  const choice = page.getByRole("radio").first()
  if (await choice.count()) {
    await choice.check({ force: true })
    await page.getByRole("button", { name: "Tester ma décision" }).click()
    await expect(page.getByText(/Essai n°/).first()).toBeVisible()
  }
  const hint = page.getByRole("button", { name: /^Afficher un indice/ })
  if (await hint.count()) {
    await hint.click()
    await expect(page.getByText("Indice déjà consulté.")).toBeVisible()
  }
  expect(await serious(page)).toEqual([])
  if (shots) await page.screenshot({ path: `${shots}/student-view-mission.png`, fullPage: true })
  await page.getByRole("button", { name: "Revenir à mon interface" }).click()
  await expect(page.getByRole("navigation", { name: "Navigation enseignant" })).toBeVisible()
  // The server state of the class did not move: no attempt, no point, no help, no presence.
  expect(await classState(baseURL!)).toEqual(before)
})

test("« n en ligne »: hovering shows the students online, their mission and since when", async ({ browser, page }) => {
  const student = await (await browser.newContext({ locale: "fr-FR" })).newPage()
  await signIn(student, "demo.etudiant08")
  await signIn(page, "demo.enseignant")
  const link = page.getByRole("link", { name: /étudiants? en ligne sur/ })
  await expect(link).toBeVisible()
  await expect(async () => {
    await page.reload()
    await page.getByRole("link", { name: /étudiants? en ligne sur/ }).hover()
    await expect(page.getByTestId("online-panel").getByText("demo.etudiant08")).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 40_000 })
  const panel = page.getByRole("group", { name: "Étudiants en ligne" })
  await expect(panel).toContainText(/depuis/)
  expect(await serious(page)).toEqual([])
  if (shots) await page.screenshot({ path: `${shots}/online-panel.png` })
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("online-panel")).toHaveCount(0)
  // The click keeps its behaviour.
  await page.getByRole("link", { name: /étudiants? en ligne sur/ }).click()
  await expect(page).toHaveURL(/#\/classe\/etudiants$/)
  await student.context().close()
})
