import { test, expect, type Browser, type Page } from "@playwright/test"
import { teacherView } from "./teacher-nav"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/**
 * Sprint 2, part H (ADR-0023) on the test stack: live grid at 1366×768, teacher message with toast
 * and read receipt, help request in the teacher's notification centre, block opened for one
 * student, automatic opening by the server. The demonstration block is closed during some tests
 * and always reopened afterwards.
 */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const password = (name: string) => accounts.find((item) => item.username === name)!.password
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR ?? "test-results/sprint2-h"
const STUDENT = "demo.etudiant04"
const BLOCK = "Données ShopFlow"

test.describe.configure({ mode: "serial" })

async function login(page: Page, name: string) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await page.getByLabel("Mot de passe").fill(password(name))
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${name}` })).toBeVisible()
}

async function serious(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => `${item.id} ${item.nodes.map((n) => n.target.join(" ")).join(" | ")}`)
}

async function csrf(page: Page) {
  return (await page.context().cookies()).find((c) => c.name.endsWith("academy_csrf"))!.value
}

async function context(browser: Browser, theme: "light" | "dark", width = 1366, height = 768) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" })
  await ctx.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
  return ctx
}

type Main = { assignment_id: number }
type LiveData = { blocks: { chapter_id: number; title: string; open: boolean }[]; students: { id: number; name: string }[] }

async function classInfo(page: Page) {
  const main = await (await page.request.get("/api/v1/teacher/main")).json() as Main
  const live = await (await page.request.get(`/api/v1/teacher/classes/${main.assignment_id}/live`)).json() as LiveData
  return { id: main.assignment_id, block: live.blocks.find((b) => b.title === BLOCK)!, student: live.students.find((s) => s.name === STUDENT)! }
}

async function teacherPost(page: Page, path: string, data?: unknown) {
  return page.request.post(`/api/v1${path}`, { data, headers: { "X-CSRF-Token": await csrf(page) } })
}

for (const theme of ["light", "dark"] as const) {
  test(`live grid fits 1366×768 in the ${theme} theme, message with toast and read receipt`, async ({ browser }) => {
    const teacherCtx = await context(browser, theme)
    const teacher = await teacherCtx.newPage()
    await login(teacher, "demo.enseignant")
    const studentCtx = await context(browser, theme)
    const student = await studentCtx.newPage()
    await login(student, STUDENT)
    await teacherView(teacher, "Ma classe", "Étudiants")
    const grid = teacher.getByRole("table", { name: "Étudiants par blocs" })
    await expect(grid).toBeVisible()
    // The student's heartbeat makes them « en ligne » within one refresh.
    await expect(grid.getByRole("row").filter({ hasText: STUDENT }).getByText("en ligne")).toBeVisible({ timeout: 10_000 })
    const panel = teacher.getByRole("region", { name: "Grille étudiants par blocs (défilement horizontal)" })
    const box = (await panel.boundingBox())!
    expect(box.height).toBeLessThan(600) // ten students and the header fit in the 1366×768 screen
    expect(await teacher.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await serious(teacher)).toEqual([])

    const info = await classInfo(teacher)
    await teacher.getByRole("combobox", { name: "Destinataires" }).selectOption(String(info.student.id))
    const text = `Message ${theme} : relisez la consigne du bloc.`
    await teacher.getByRole("textbox", { name: "Texte du message" }).fill(text)
    const sent = Date.now()
    await teacher.getByRole("button", { name: "Envoyer" }).click()
    await expect(teacher.getByText("Message envoyé à 1 étudiant.")).toBeVisible()
    const toast = student.getByRole("region", { name: "Notifications récentes" }).getByText(text)
    await expect(toast).toBeVisible({ timeout: 10_000 })
    test.info().annotations.push({ type: "latence-message-ms", description: String(Date.now() - sent) })
    expect(await serious(student)).toEqual([])
    await teacher.screenshot({ path: `${shots}/50-suivi-direct-${theme}-1366.png`, animations: "disabled" })
    await student.screenshot({ path: `${shots}/51-message-etudiant-${theme}-1366.png`, animations: "disabled" })
    await student.getByRole("region", { name: "Notifications récentes" }).getByRole("button", { name: "J’ai lu" }).first().click()
    await expect(teacher.getByRole("list", { name: "Messages envoyés" }).getByText(/lu par 1\/1/).first()).toBeVisible({ timeout: 15_000 })
    await teacherCtx.close()
    await studentCtx.close()
  })
}

test("help request reaches the teacher's notification centre within 10 s", async ({ browser }) => {
  const teacherCtx = await context(browser, "light")
  const teacher = await teacherCtx.newPage()
  await login(teacher, "demo.enseignant")
  const studentCtx = await context(browser, "light")
  const student = await studentCtx.newPage()
  await login(student, STUDENT)
  const dashboard = await (await student.request.get("/api/v1/student/dashboard")).json() as { courses: { missions: { mission_version_id: number }[] }[] }
  const mission = dashboard.courses[0].missions[0].mission_version_id
  const response = await student.request.post(`/api/v1/student/missions/${mission}/help`, { data: { message: "Je bloque sur le grain." }, headers: { "X-CSRF-Token": await csrf(student) } })
  expect(response.status()).toBeLessThan(300)
  await expect(teacher.getByRole("region", { name: "Notifications récentes" }).getByText(new RegExp(`${STUDENT} demande de l’aide`))).toBeVisible({ timeout: 10_000 })
  await teacher.getByRole("button", { name: /Notifications : \d+ non lue/ }).click()
  await expect(teacher.getByRole("dialog", { name: "Historique des notifications" }).getByText("Demande d’aide", { exact: false }).first()).toBeVisible()
  expect(await serious(teacher)).toEqual([])
  await teacher.screenshot({ path: `${shots}/52-centre-notifications-1366.png`, animations: "disabled" })
  await teacherCtx.close()
  await studentCtx.close()
})

test("a closed block opened for one student only, within 10 s (« ouvert pour vous »)", async ({ browser }) => {
  const teacherCtx = await context(browser, "light")
  const teacher = await teacherCtx.newPage()
  await login(teacher, "demo.enseignant")
  const info = await classInfo(teacher)
  await teacherPost(teacher, `/teacher/classes/${info.id}/blocks/${info.block.chapter_id}/close`)
  const studentCtx = await context(browser, "dark", 390, 844)
  const student = await studentCtx.newPage()
  try {
    await login(student, STUDENT)
    const card = student.getByRole("group", { name: `Bloc : ${BLOCK}` })
    await expect(card.getByText("Bientôt disponible")).toBeVisible()
    await teacherView(teacher, "Ma classe", "Étudiants")
    const row = teacher.getByRole("table", { name: "Étudiants par blocs" }).getByRole("row").filter({ hasText: STUDENT })
    await row.getByRole("button", { name: new RegExp(`${BLOCK} : fermé\\. Ouvrir ce bloc pour ${STUDENT}`) }).click()
    await expect(teacher.getByText(`« ${BLOCK} » ouvert pour ${STUDENT}.`)).toBeVisible()
    await expect(card.getByText("Ouvert pour vous")).toBeVisible({ timeout: 10_000 })
    expect(await serious(student)).toEqual([])
    await student.screenshot({ path: `${shots}/53-ouvert-pour-vous-sombre-390.png`, fullPage: true, animations: "disabled" })
    await student.getByRole("button", { name: /Notifications/ }).click()
    await expect(student.getByRole("dialog", { name: "Historique des notifications" }).getByText(/ouvert pour vous/)).toBeVisible()
    await student.screenshot({ path: `${shots}/54-historique-sombre-390.png`, animations: "disabled" })
    // Another student of the class still sees the block closed.
    expect((await (await teacher.request.get(`/api/v1/teacher/classes/${info.id}/live`)).json() as { students: { name: string; cells: { state: string }[] }[] })
      .students.filter((s) => s.name !== STUDENT).every((s) => s.cells[0].state === "closed")).toBe(true)
  } finally {
    await teacherPost(teacher, `/teacher/classes/${info.id}/blocks/${info.block.chapter_id}/students/${info.student.id}/relock`)
    await teacherPost(teacher, `/teacher/classes/${info.id}/blocks/${info.block.chapter_id}/open`)
    await teacherCtx.close()
    await studentCtx.close()
  }
})

test("automatic opening: plan shown before activation, the server opens the block, nothing closes", async ({ browser }) => {
  const teacherCtx = await context(browser, "light")
  const teacher = await teacherCtx.newPage()
  await login(teacher, "demo.enseignant")
  const info = await classInfo(teacher)
  await teacherPost(teacher, `/teacher/classes/${info.id}/blocks/${info.block.chapter_id}/close`)
  try {
    await teacherView(teacher, "Ma classe", "Frise")
    const section = teacher.getByRole("region", { name: "Ouverture automatique des blocs" })
    // « Heure de fin » is a time of today: after 21:00 « now + 3 h » would wrap past midnight into the past.
    const now = new Date()
    const end = new Date(Math.min(now.getTime() + 3 * 3600_000, new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59).getTime()))
    await section.getByLabel("Heure de fin").fill(`${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`)
    await section.getByRole("button", { name: "Voir le planning" }).click()
    await expect(section.getByRole("list", { name: "Planning d’ouverture" }).getByText(BLOCK)).toBeVisible()
    await section.screenshot({ path: `${shots}/55-planning-avant-activation.png`, animations: "disabled" })
    await section.getByRole("button", { name: "Activer ce planning" }).click()
    await expect(section.getByText("Active", { exact: true })).toBeVisible()
    // The background check (every 15 s) opens the block that is due now.
    await expect.poll(async () => ((await (await teacher.request.get(`/api/v1/teacher/classes/${info.id}/live`)).json()) as LiveData)
      .blocks.find((b) => b.chapter_id === info.block.chapter_id)!.open, { timeout: 30_000 }).toBe(true)
    await expect(teacher.getByRole("region", { name: "Notifications récentes" }).getByText(/^Ouverture automatique : «/)).toBeVisible({ timeout: 15_000 })
    expect(await serious(teacher)).toEqual([])
    await section.getByRole("button", { name: "Arrêter" }).click()
    await expect(section.getByText("Désactivée")).toBeVisible()
  } finally {
    await teacherPost(teacher, `/teacher/classes/${info.id}/auto/stop`)
    await teacherPost(teacher, `/teacher/classes/${info.id}/blocks/${info.block.chapter_id}/open`)
    await teacherCtx.close()
  }
})

for (const theme of ["light", "dark"] as const) {
  test(`390×844 in the ${theme} theme: student bell and history, teacher live grid without page overflow`, async ({ browser }) => {
    const studentCtx = await context(browser, theme, 390, 844)
    const student = await studentCtx.newPage()
    await login(student, STUDENT)
    await student.getByRole("button", { name: /Notifications/ }).click()
    await expect(student.getByRole("dialog", { name: "Historique des notifications" })).toBeVisible()
    expect(await student.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await serious(student)).toEqual([])
    await student.screenshot({ path: `${shots}/56-etudiant-notifications-${theme}-390.png`, animations: "disabled" })
    const teacherCtx = await context(browser, theme, 390, 844)
    const teacher = await teacherCtx.newPage()
    await login(teacher, "demo.enseignant")
    await teacherView(teacher, "Ma classe", "Étudiants")
    await expect(teacher.getByRole("table", { name: "Étudiants par blocs" })).toBeVisible()
    expect(await teacher.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await serious(teacher)).toEqual([])
    await teacher.getByRole("heading", { name: "Suivi en direct" }).scrollIntoViewIfNeeded()
    await teacher.screenshot({ path: `${shots}/57-enseignant-suivi-${theme}-390.png`, animations: "disabled" })
    await studentCtx.close()
    await teacherCtx.close()
  })
}
