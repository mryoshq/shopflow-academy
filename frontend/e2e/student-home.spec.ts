import { test, expect, type APIRequestContext, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/** ADR-0051: the student's home page during the project: Projet first, Cours, Ressources; the old addresses still work. */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => accounts.find((item) => item.username === name)!
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR
const STUDENT = "demo.etudiant04"

async function signIn(page: Page, name = STUDENT) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await page.getByLabel("Mot de passe").fill(account(name).password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${name}` })).toBeVisible()
}

type Member = { id: number; name: string }

async function teacherApi(request: APIRequestContext) {
  expect((await request.post("/api/v1/auth/login", { data: { username: "demo.enseignant", password: account("demo.enseignant").password } })).status()).toBe(200)
  const csrf = (await request.storageState()).cookies.find((cookie) => cookie.name === "academy_csrf")!.value
  const assignment = (await (await request.get("/api/v1/teacher/classes")).json())[0].id as number
  const view = await (await request.get(`/api/v1/teacher/classes/${assignment}/project`)).json() as { teams: { id: number; members: Member[] }[]; alone: Member[] }
  return { csrf, assignment, view }
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

test("a team of two can still invite a third classmate (teams of 2 or 3)", async ({ browser, request }) => {
  const { csrf, assignment, view } = await teacherApi(request)
  const demo = (member: Member) => accounts.some((item) => item.username === member.name)
  // A pair of demo students: an existing one, or one formed by the teacher (removed afterwards).
  let pair = view.teams.find((team) => team.members.length === 2 && team.members.every(demo))
  let created = 0
  if (!pair) {
    const two = view.alone.filter(demo).slice(0, 2)
    expect(two).toHaveLength(2)
    const response = await request.post(`/api/v1/teacher/classes/${assignment}/project/teams`, { data: { user_ids: two.map((item) => item.id) }, headers: { "X-CSRF-Token": csrf } })
    expect(response.status()).toBe(201)
    created = (await response.json()).id
    pair = { id: created, members: two }
  }
  const context = await browser.newContext({ locale: "fr-FR" })
  const page = await context.newPage()
  await signIn(page, pair.members[0].name)
  await expect(page.getByText("Vous pouvez encore inviter un troisième camarade (facultatif).")).toBeVisible()
  await expect(page.getByText("Inviter un camarade", { exact: true })).toBeVisible()
  // A complete pair hands in: the milestones come first, the team (with its invitation form) after.
  await expect(page.getByRole("heading", { name: "Jalons" })).toBeVisible()
  await context.close()
  if (created) await request.delete(`/api/v1/teacher/project/teams/${created}`, { headers: { "X-CSRF-Token": csrf } })
})
