import { test, expect, request, type APIRequestContext, type Browser, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/**
 * ADR-0041: no individual work; a student signs up for the surprise draw, the teacher previews and
 * confirms it, the student sees the reveal once. Demo accounts of the test stack only. The suite starts
 * by removing the demo teams that hold no work (it can run again) and ends by marking the draw
 * notifications as read, so the other suites see no new toast.
 */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => accounts.find((item) => item.username === name)!
const SIGNED_UP = "demo.etudiant09"
const ALONE = "demo.etudiant10"
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR

async function api(baseURL: string, name: string): Promise<{ ctx: APIRequestContext; csrf: string }> {
  const ctx = await request.newContext({ baseURL })
  const { username, password } = account(name)
  expect((await ctx.post("/api/v1/auth/login", { data: { username, password } })).ok()).toBe(true)
  const csrf = (await ctx.storageState()).cookies.find((cookie) => cookie.name === "academy_csrf")!.value
  return { ctx, csrf }
}

async function signIn(browser: Browser, name: string, options: { reducedMotion?: "reduce" } = {}): Promise<Page> {
  const context = await browser.newContext({ locale: "fr-FR", ...options })
  const page = await context.newPage()
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await page.getByLabel("Mot de passe").fill(account(name).password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("button", { name: /Notifications|Compte/ }).first()).toBeVisible()
  return page
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

test.beforeAll(async ({ baseURL }) => {
  // Demo teams without work go back to « without a team » (the suite may run twice).
  const { ctx, csrf } = await api(baseURL!, "demo.enseignant")
  const assignment = (await (await ctx.get("/api/v1/teacher/classes")).json())[0].id
  const project = await (await ctx.get(`/api/v1/teacher/classes/${assignment}/project`)).json()
  for (const team of project.teams) await ctx.delete(`/api/v1/teacher/project/teams/${team.id}`, { headers: { "X-CSRF-Token": csrf } })
  await ctx.dispose()
})

test.afterAll(async ({ baseURL }) => {
  for (const item of accounts.filter((entry) => entry.username.startsWith("demo.etudiant"))) {
    const { ctx, csrf } = await api(baseURL!, item.username)
    await ctx.post("/api/v1/notifications/read-all", { headers: { "X-CSRF-Token": csrf } })
    await ctx.dispose()
  }
})

test("sign up for the surprise team, the teacher draws, the reveal is shown once", async ({ browser }) => {
  // Student: two choices, no « work alone »; signed up, they see their status and can leave.
  const student = await signIn(browser, SIGNED_UP)
  await student.goto("/#/projet")
  // ADR-0051: the project is the first tab of the home page (its title is an h2 under « Bonjour »).
  await expect(student.getByRole("tab", { name: "Projet", selected: true })).toBeVisible()
  await expect(student.getByRole("heading", { level: 2, name: "Projet CampusEquip" })).toBeAttached()
  await expect(student.getByRole("button", { name: "Former mon binôme" })).toBeVisible()
  await expect(student.getByText(/travailler seul/)).toHaveCount(0)
  await student.getByRole("button", { name: "Je tente le binôme surprise" }).click()
  await expect(student.getByText("Vous êtes inscrit au binôme surprise.")).toBeVisible()
  await student.getByRole("button", { name: "Me retirer du tirage" }).click()
  await expect(student.getByRole("button", { name: "Je tente le binôme surprise" })).toBeVisible()
  await student.getByRole("button", { name: "Je tente le binôme surprise" }).click()
  await expect(student.getByTestId("draw-status")).toBeVisible()
  expect(await serious(student)).toEqual([])
  if (shots) await student.screenshot({ path: `${shots}/student-signed-up.png`, fullPage: true })

  // Another student formed a team alone: they cannot submit.
  const alone = await signIn(browser, ALONE, { reducedMotion: "reduce" })
  await alone.goto("/#/projet")
  await alone.getByRole("button", { name: "Former mon binôme" }).click()
  await expect(alone.getByText("En attente d’un camarade : invitez-le ci-dessous. Seul, vous ne pouvez pas déposer.")).toBeVisible()

  // Pages closed during the draw: an open page would show the reveal as soon as the notification arrives.
  const studentContext = student.context(), aloneContext = alone.context()
  await student.close()
  await alone.close()

  // Teacher: Projet > Binômes, preview (the one-person team only with agreement), then confirm.
  const teacher = await signIn(browser, "demo.enseignant")
  await teacher.goto("/#/projet")
  await expect(teacher.getByRole("heading", { name: "Binôme surprise" })).toBeVisible()
  await expect(teacher.getByText("9 étudiants sans équipe · 1 inscrit au tirage")).toBeVisible()
  await teacher.getByText(ALONE, { exact: true }).last().click()  // the one-person team's checkbox label
  await teacher.getByRole("button", { name: "Lancer le tirage" }).click()
  await expect(teacher.getByText("Aperçu : rien n’est enregistré avant validation.")).toBeVisible()
  const groups = teacher.getByRole("listitem").filter({ hasText: " + " })
  await expect(groups).toHaveCount(5)
  expect(await serious(teacher)).toEqual([])
  if (shots) await teacher.screenshot({ path: `${shots}/teacher-preview.png`, fullPage: true })
  await teacher.getByRole("button", { name: "Valider ce tirage" }).click()
  const again = teacher.getByRole("button", { name: "Confirmer le nouveau tirage" })
  if (await again.isVisible().catch(() => false)) await again.click()  // a draw already took place (run again)
  await expect(teacher.getByText("Tirage enregistré : les étudiants tirés au sort sont prévenus.")).toBeVisible()
  await expect(teacher.getByText("Tirages enregistrés")).toBeVisible()

  // The signed-up student: cards turn over once, then the reveal is gone.
  const revealed = await studentContext.newPage()
  await revealed.goto("/#/projet")
  const reveal = revealed.getByTestId("surprise-reveal")
  await expect(reveal.getByRole("heading", { name: /^Votre binôme surprise : demo\.etudiant\d\d/ })).toBeVisible()
  await expect(revealed.locator(".surprise-card")).toHaveCount(1)
  expect(await serious(revealed)).toEqual([])
  await revealed.reload()
  await expect(revealed.getByRole("heading", { level: 2, name: "Projet CampusEquip" })).toBeAttached()
  await expect(revealed.getByRole("heading", { name: "Jalons" })).toBeVisible()
  await expect(revealed.getByTestId("surprise-reveal")).toHaveCount(0)
  await expect(revealed.getByRole("button", { name: "Je tente le binôme surprise" })).toHaveCount(0)

  // With reduced motion, the reveal shows the name at once, without animation.
  const calm = await aloneContext.newPage()
  await calm.goto("/#/projet")
  await expect(calm.getByTestId("surprise-reveal")).toBeVisible()
  await expect(calm.locator(".surprise-card")).toHaveCount(0)
})
