import { test, expect, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { teacherView } from "./teacher-nav"

// Login page (text, theme, opening) and the « Demandes d'aide » badge. Fictional demo accounts only.
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const password = (name: string) => accounts.find((item) => item.username === name)!.password

async function login(page: Page, name: string) {
  await page.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await page.getByLabel("Mot de passe").fill(password(name))
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${name}` })).toBeVisible()
}

test("login page: new text, no theme switch, opening once per session, form usable at once", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText("Rapidfox Academy", { exact: true }).first()).toBeVisible()
  await expect(page.getByRole("heading", { level: 1, name: "Apprenez la data en prenant de vraies décisions." })).toBeVisible()
  // Non-breaking spaces keep « Classe : B3 IA/Data » on one line: \s matches them.
  await expect(page.getByText(/Module\s:\sPython Data Engineering & SQL Avancé · Classe\s:\sB3\sIA\/Data/)).toBeVisible()
  await expect(page.getByText(/vous travaillez sur ShopFlow, une boutique en ligne fictive, et CampusEquip/)).toBeVisible()
  await expect(page.getByRole("radiogroup")).toHaveCount(0)
  // The opening plays (a decorative, inert copy of the logo) and never blocks the form or the keyboard.
  await expect(page.locator(".login-intro")).toHaveCount(1)
  await page.getByRole("textbox", { name: "Identifiant" }).fill("demo.etudiant01")
  await expect(page.getByRole("textbox", { name: "Identifiant" })).toHaveValue("demo.etudiant01")
  await expect(page.locator(".login-intro")).toHaveCount(0, { timeout: 3000 })
  // Same browser session: no second opening.
  await page.reload()
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible()
  await expect(page.locator(".login-intro")).toHaveCount(0)
})

test("the opening is skipped with reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ locale: "fr-FR", reducedMotion: "reduce" })
  const page = await context.newPage()
  await page.goto("/")
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible()
  await expect(page.locator(".login-intro")).toHaveCount(0)
  await context.close()
})

test("« Demandes d’aide » badge on « Ma classe » and on its tab, gone once handled", async ({ page, browser }) => {
  const studentContext = await browser.newContext({ locale: "fr-FR" })
  const student = await studentContext.newPage()
  await student.goto("/")
  await login(student, "demo.etudiant08")
  const dashboard = await (await student.request.get("/api/v1/student/dashboard")).json() as { courses: { missions: { mission_version_id: number }[] }[] }
  const mission = dashboard.courses[0].missions[0].mission_version_id
  const csrf = (await studentContext.cookies()).find((item) => item.name.endsWith("academy_csrf"))!.value
  const help = await (await student.request.post(`/api/v1/student/missions/${mission}/help`, { data: { message: "Badge" }, headers: { "X-CSRF-Token": csrf } })).json() as { id: number }

  await page.goto("/")
  await login(page, "demo.enseignant")
  const classe = page.getByRole("navigation", { name: "Navigation enseignant" }).getByRole("link", { name: "Ma classe", exact: true })
  await expect(classe).toHaveAccessibleDescription(/\d+ demandes? d’aide en attente/)
  await teacherView(page, "Ma classe", "Demandes d’aide")
  await expect(page.getByRole("tab", { name: "Demandes d’aide", exact: true })).toHaveAccessibleDescription(/\d+ demandes? d’aide en attente/)
  // Handle every pending request of this test student: the badge follows at once.
  const item = page.getByRole("region", { name: /Demandes d’aide en attente/ }).getByRole("listitem").filter({ hasText: "demo.etudiant08" }).first()
  await item.getByRole("button", { name: "Marquer comme traitée" }).click()
  await expect(page.getByText("Demande de demo.etudiant08 marquée comme traitée.")).toBeVisible()
  const teacherCsrf = (await page.context().cookies()).find((cookie) => cookie.name.endsWith("academy_csrf"))!.value
  await page.request.post(`/api/v1/teacher/help/${help.id}/handle`, { headers: { "X-CSRF-Token": teacherCsrf } })
  await studentContext.close()
})
