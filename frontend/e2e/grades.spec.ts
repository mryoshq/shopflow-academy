import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"
import { teacherView } from "./teacher-nav"

/**
 * ADR-0046: project grid of the two subjects, block points, final grade (Résultats, Réglages > Notes, student once shown).
 * Everything it creates is removed at the end (team, grade settings back to their defaults).
 */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => accounts.find((item) => item.username === name)!
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR
const STUDENTS = ["demo.etudiant08", "demo.etudiant09"]
const DEFAULTS = { weights: { course: 30, workshops: 20, project: 50 }, cap: 20, project_bonus_max: 1, course_bonus_max: 1, workshop_modules: null }

async function signIn(page: Page, name: string) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await page.getByLabel("Mot de passe").fill(account(name).password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${name}` })).toBeVisible()
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations === Infinity))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

async function teacherApi(request: APIRequestContext) {
  expect((await request.post("/api/v1/auth/login", { data: { username: "demo.enseignant", password: account("demo.enseignant").password } })).status()).toBe(200)
  const csrf = (await request.storageState()).cookies.find((cookie) => cookie.name === "academy_csrf")!.value
  const assignment = (await (await request.get("/api/v1/teacher/classes")).json())[0].id as number
  return { csrf, assignment }
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

test.describe.serial("grades", () => {
  let team = 0

  test("the teacher enters the new grid; the former grid is never written", async ({ page, request }) => {
    const { csrf, assignment } = await teacherApi(request)
    const view = await (await request.get(`/api/v1/teacher/classes/${assignment}/project`)).json()
    for (const existing of view.teams.filter((item: { members: { name: string }[] }) => item.members.some((m) => STUDENTS.includes(m.name))))
      await request.delete(`/api/v1/teacher/project/teams/${existing.id}`, { headers: { "X-CSRF-Token": csrf } })
    const fresh = await (await request.get(`/api/v1/teacher/classes/${assignment}/project`)).json()
    const ids = fresh.alone.filter((item: { name: string }) => STUDENTS.includes(item.name)).map((item: { id: number }) => item.id)
    expect(ids).toHaveLength(2)
    const created = await request.post(`/api/v1/teacher/classes/${assignment}/project/teams`, { data: { user_ids: ids }, headers: { "X-CSRF-Token": csrf } })
    expect(created.status()).toBe(201)
    team = (await created.json()).team_id

    await signIn(page, "demo.enseignant")
    await teacherView(page, "Projet")
    await page.getByRole("tab", { name: "Notes" }).click()
    const form = page.getByRole("region", { name: `Note de ${STUDENTS.join(" et ")}` })
    await form.getByLabel("Airflow et reprise /3").fill("4")
    await expect(form.getByRole("alert")).toHaveText("Une note dépasse son barème.")
    await expect(form.getByRole("button", { name: "Enregistrer la note" })).toBeDisabled()
    const lines: [string, string][] = [["Modèle relationnel et contraintes /2", "2"], ["Trois analyses SQL, tableaux et graphique /2", "1,5"],
      ["Contrôles Python, quarantaine et rapport /2", "2"], ["Chargement transactionnel, rejeu et prise en charge automatique /2", "2"],
      ["Preuves reproductibles et compréhension (commun) /1", "1"], ["Airflow et reprise /3", "3"], ["Événements MongoDB /2", "2"], ["Redis /2", "1,5"],
      ["Tentatives et analyse temporelle /2", "2"], ["Reproductibilité et explication du groupe /1", "1"], ["IoT ou API /2", "2"], ["Mesures et conservation /2", "2"]]
    for (const [label, value] of lines) await form.getByLabel(label).fill(value)
    for (const name of STUDENTS) await form.getByLabel(`Point individuel de ${name} /1`).fill("1")
    await form.getByRole("button", { name: "Enregistrer la note" }).click()
    await expect(page.getByText("Note du projet enregistrée.")).toBeVisible()
    // 2 + 1.5 + 2 + 2 + 1 + 1 (individual) = 9.5 ; 3 + 2 + 1.5 + 2 + 1 = 9.5 → base 19 ; bonus 4.
    await expect(form.getByRole("row", { name: new RegExp(STUDENTS[0]) })).toContainText("19")
    const csv = await (await request.get(`/api/v1/teacher/classes/${assignment}/project/grades.csv`)).text()
    expect(csv.split("\n")[0]).toContain("socle_20;bonus_10;ancienne_grille_20")
  })

  for (const theme of ["light", "dark"] as const) {
    for (const width of [1366, 390]) {
      test(`AA and captures, ${theme}, ${width} px`, async ({ browser, request }) => {
        await captures(browser, request, theme, width)
      })
    }
  }

  test.afterAll(async ({ request }) => {
    const { csrf, assignment } = await teacherApi(request)
    await request.put(`/api/v1/teacher/classes/${assignment}/grading`, { data: { ...DEFAULTS, visible_to_students: false }, headers: { "X-CSRF-Token": csrf } })
    if (team) await request.delete(`/api/v1/teacher/project/teams/${team}`, { headers: { "X-CSRF-Token": csrf } })
  })
})

async function captures(browser: Browser, request: APIRequestContext, theme: "light" | "dark", width: number) {
  const { csrf, assignment } = await teacherApi(request)
  const name = `${theme === "light" ? "clair" : "sombre"}-${width}`
  const context = await browser.newContext({ locale: "fr-FR", viewport: { width, height: width > 500 ? 900 : 844 }, reducedMotion: "reduce" })
  await context.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
  const page = await context.newPage()
  await signIn(page, "demo.enseignant")

  await teacherView(page, "Projet")
  await page.getByRole("tab", { name: "Notes" }).click()
  await expect(page.getByRole("region", { name: `Note de ${STUDENTS.join(" et ")}` })).toBeVisible()
  expect(await serious(page)).toEqual([])
  await noHorizontalScroll(page)
  if (shots) await page.screenshot({ path: `${shots}/projet-notes-${name}.png`, fullPage: true, animations: "disabled" })

  await teacherView(page, "Résultats")
  const panel = page.getByRole("region", { name: "Note finale de la classe" })
  await expect(panel).toBeVisible()
  await panel.getByRole("button", { name: `Détail de la note de ${STUDENTS[0]}` }).click()
  await expect(page.getByTestId("final-breakdown")).toContainText("Arrondie à 0,25 près.")
  expect(await serious(page)).toEqual([])
  await noHorizontalScroll(page)
  if (shots) await page.screenshot({ path: `${shots}/resultats-note-finale-${name}.png`, fullPage: true, animations: "disabled" })
  const final = await (await request.get(`/api/v1/teacher/classes/${assignment}/results/final.csv`)).text()
  expect(final.split("\n")[0]).toContain("note_finale_20;provisoire")

  await teacherView(page, "Réglages", "Notes")
  await expect(page.getByRole("heading", { name: "Note finale sur 20" })).toBeVisible()
  expect(await serious(page)).toEqual([])
  await noHorizontalScroll(page)
  if (shots) await page.screenshot({ path: `${shots}/reglages-notes-${name}.png`, fullPage: true, animations: "disabled" })
  await context.close()

  // The student sees the final grade only once the teacher shows it; the block counter is in points.
  expect((await request.put(`/api/v1/teacher/classes/${assignment}/grading`, { data: { ...DEFAULTS, visible_to_students: true },
    headers: { "X-CSRF-Token": csrf } })).status()).toBe(200)
  const student = await browser.newContext({ locale: "fr-FR", viewport: { width, height: width > 500 ? 900 : 844 }, reducedMotion: "reduce" })
  await student.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
  const page2 = await student.newPage()
  await signIn(page2, STUDENTS[0])
  await expect(page2.getByRole("region", { name: /^Note finale : / })).toBeVisible()
  await expect(page2.getByTestId("block-points").first()).toHaveText(/pts|Leçons/)
  await expect(page2.getByText(/\d+ \/ \d+ missions?$/)).toHaveCount(0)
  expect(await serious(page2)).toEqual([])
  await noHorizontalScroll(page2)
  if (shots) await page2.screenshot({ path: `${shots}/etudiant-tableau-${name}.png`, fullPage: true, animations: "disabled" })
  await student.close()
  await request.put(`/api/v1/teacher/classes/${assignment}/grading`, { data: { ...DEFAULTS, visible_to_students: false }, headers: { "X-CSRF-Token": csrf } })
}
