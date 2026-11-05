import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"
import { teacherView } from "./teacher-nav"

/**
 * ADR-0039: streak, badges, level and class goal, on the demonstration course (fictional accounts only).
 * The demo accounts are shared by every spec: the page is checked against the server's own numbers.
 */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const password = (name: string) => accounts.find((item) => item.username === name)!.password
const MISSION = "Frais de livraison après une jointure"
const STUDENT = "demo.etudiant07"

async function login(page: Page, name: string) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await page.getByLabel("Mot de passe").fill(password(name))
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${name}` })).toBeVisible()
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

type Rewards = { streak: number; badges: { label: string; earned: boolean }[]; level: { name: string } }

test("student: a success shows the streak and the badge; the dashboard shows level, streak and collection", async ({ page }) => {
  await login(page, STUDENT)
  await page.getByRole("tab", { name: "Cours" }).click()  // ADR-0051
  await page.getByRole("button", { name: `Ouvrir : ${MISSION}` }).first().click()
  await expect(page.getByRole("heading", { level: 1, name: MISSION })).toBeVisible()
  await page.getByRole("radio", { name: /La jointure passe au grain article/ }).check()
  const reply = page.waitForResponse((response) => /\/student\/missions\/\d+\/attempts$/.test(response.url()) && response.request().method() === "POST")
  await page.getByRole("button", { name: "Tester ma décision" }).click()
  const body = await (await reply).json() as { rewards?: { streak: number; new_badges: { label: string }[] } }
  await expect(page.getByText("Bonne décision")).toBeVisible()
  if (body.rewards && body.rewards.streak > 0) await expect(page.getByText(`Série : ${body.rewards.streak}`).first()).toBeVisible()
  for (const badge of body.rewards?.new_badges ?? []) await expect(page.getByText(badge.label).first()).toBeVisible()
  expect(await serious(page)).toEqual([])

  await page.goto("/#/cours")  // ADR-0051: progression and class goal are in the Cours tab
  const panel = page.getByRole("region", { name: "Votre progression" })
  await expect(panel).toBeVisible()
  // Same course as the panel: the main course (not a demonstration), else the first one (StudentDashboard.rewardsCourse).
  const courses = (await (await page.request.get("/api/v1/student/dashboard")).json() as { courses: { is_demo: boolean; rewards: Rewards }[] }).courses
  const rewards = (courses.find((course) => !course.is_demo) ?? courses[0]).rewards
  await expect(panel.getByText(rewards.level.name, { exact: true })).toBeVisible()
  await expect(panel.getByText(rewards.streak > 0 ? `Série : ${rewards.streak}` : "Réussissez une mission du premier coup pour lancer une série.")).toBeVisible()
  await expect(panel.getByText(`Badges : ${rewards.badges.filter((b) => b.earned).length} sur ${rewards.badges.length}`)).toBeVisible()
  await panel.getByRole("button", { name: "Voir ma collection" }).click()
  await expect(panel.getByRole("list", { name: "Collection de badges" })).toContainText("Première mission réussie")
  await expect(page.getByRole("region", { name: "Objectif de classe" })).toContainText(/La classe a (réussi|terminé) \d+/)
  expect(await serious(page)).toEqual([])
})

test("teacher: class goal in « Ma classe » and in Réglages, badges in the student panel, nothing in the export", async ({ page }) => {
  await login(page, "demo.enseignant")
  await teacherView(page, "Ma classe", "Étudiants")
  await expect(page.getByRole("group", { name: "Objectif de classe" })).toContainText(/La classe a (réussi|terminé) \d+/)
  await page.getByRole("button", { name: `Détail de ${STUDENT}` }).click()
  // The class's main course: level, XP, streak and badge count, apart from the grade.
  await expect(page.getByRole("group", { name: "Progression (hors note)" })).toContainText(/XP.*Série : \d+.*Badges : \d+ sur \d+/)
  await page.keyboard.press("Escape")
  await teacherView(page, "Réglages", "Objectif de classe")
  await expect(page.getByLabel("Ce qui compte")).toBeVisible()
  expect(await serious(page)).toEqual([])
  const classes = await (await page.request.get("/api/v1/teacher/classes")).json() as { id: number }[]
  const exported = await (await page.request.get(`/api/v1/teacher/classes/${classes[0].id}/export.csv`)).text()
  expect(exported.toLowerCase()).not.toMatch(/badge|niveau|xp|stagiaire/)
})
