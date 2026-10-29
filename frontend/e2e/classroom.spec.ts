import { test, expect, type Page, type BrowserContext } from "@playwright/test"
import { teacherView } from "./teacher-nav"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/**
 * Sprint 2, part A on the test stack (fictional accounts only): the teacher opens blocks
 * one by one in "Ma classe", a closed block shows nothing to students, help requests go
 * from "reçue" to "traitée", and "Résultats" exports the grades.
 */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => accounts.find((item) => item.username === name)!
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR ?? "test-results/sprint2-a"
const COURSE = "Démonstration — Données ShopFlow"
const BLOCK = "Données ShopFlow"

async function login(page: Page, name: string) {
  const { username, password } = account(name)
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(username)
  await page.getByLabel("Mot de passe").fill(password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${username}` })).toBeVisible()
}

async function csrf(context: BrowserContext) {
  return (await context.cookies()).find((item) => item.name.endsWith("academy_csrf"))?.value ?? ""
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

test("the teacher closes and reopens a block; a closed block exposes nothing", async ({ page, browser }) => {
  await login(page, "demo.enseignant")
  await teacherView(page, "Ma classe", "Frise")
  const blocks = page.getByRole("list", { name: "Blocs de la journée" })
  await expect(blocks.getByText(BLOCK)).toBeVisible()
  const main = await (await page.request.get("/api/v1/teacher/main")).json() as { assignment_id: number }
  const learnerContext = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const learner = await learnerContext.newPage()
  await login(learner, "demo.etudiant04")
  const before = await (await learner.request.get("/api/v1/student/dashboard")).json() as { courses: { title: string; missions: { mission_version_id: number }[] }[] }
  const ids = before.courses.find((item) => item.title === COURSE)!.missions.map((item) => item.mission_version_id)
  expect(ids.length).toBe(3)
  try {
    await blocks.getByRole("button", { name: `Fermer le bloc ${BLOCK}` }).click()
    await expect(page.getByText(`Bloc « ${BLOCK} » fermé.`)).toBeVisible()
    await expect(page.getByRole("button", { name: `Ouvrir le bloc suivant : ${BLOCK}` })).toBeEnabled()
    await learner.reload()
    const block = learner.getByRole("group", { name: `Bloc : ${BLOCK}` })
    await expect(block.getByText("Bientôt disponible")).toBeVisible()
    await expect(block.getByRole("button")).toHaveCount(0)
    expect(await serious(learner)).toEqual([])
    await learner.screenshot({ path: `${shots}/01-etudiant-bloc-ferme.png`, fullPage: true, animations: "disabled" })
    for (const id of ids) expect((await learner.request.get(`/api/v1/student/missions/${id}`)).status()).toBe(404)
    const release = (await (await learner.request.get("/api/v1/student/courses")).json() as { id: number; title: string }[]).find((item) => item.title === COURSE)!
    expect(await (await learner.request.get(`/api/v1/student/courses/${release.id}`)).text()).not.toContain("Nadia, analyste")

    await page.getByRole("button", { name: `Ouvrir le bloc suivant : ${BLOCK}` }).click()
    await expect(page.getByText(`Bloc « ${BLOCK} » ouvert pour toute la classe.`)).toBeVisible()
    await expect(page.getByText(new RegExp(`« ${BLOCK} » ouvert depuis 0 min`))).toBeVisible()
    expect(await serious(page)).toEqual([])
    await page.screenshot({ path: `${shots}/02-ma-classe-frise.png`, fullPage: true, animations: "disabled" })
    await learner.reload()
    await expect(learner.getByRole("group", { name: `Bloc : ${BLOCK}` }).getByText("Ouvert")).toBeVisible()
    await expect(learner.getByRole("button", { name: /^Continuer/ })).toBeVisible()
    await learner.screenshot({ path: `${shots}/03-etudiant-blocs.png`, fullPage: true, animations: "disabled" })
  } finally {
    // Leave the demonstration block open for the other tests.
    await page.request.post(`/api/v1/teacher/classes/${main.assignment_id}/blocks/open-next`, { headers: { "X-CSRF-Token": await csrf(page.context()) } })
  }
  await learnerContext.close()
})

test("a help request goes from 'reçue' to 'traitée' and stays private", async ({ page, browser }) => {
  const learnerContext = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const learner = await learnerContext.newPage()
  await login(learner, "demo.etudiant05")
  const dashboard = await (await learner.request.get("/api/v1/student/dashboard")).json() as { courses: { title: string; missions: { mission_version_id: number; title: string }[] }[] }
  const mission = dashboard.courses.find((item) => item.title === COURSE)!.missions[0]
  await learner.goto(`/#/mission/${mission.mission_version_id}`)
  const message = `Pourquoi 100 DH ? ${Date.now().toString(36)}`
  const ask = learner.getByRole("button", { name: "J’ai besoin d’une explication" })
  // A retried run may find the request already pending.
  await expect(ask.or(learner.getByText("Demande reçue"))).toBeVisible()
  if (await ask.isVisible()) {
    await ask.click()
    await learner.getByLabel("Ce qui vous bloque (facultatif)").fill(message)
    await learner.getByRole("button", { name: "Envoyer la demande" }).click()
  }
  await expect(learner.getByText("Demande reçue")).toBeVisible()
  expect(await serious(learner)).toEqual([])
  await learner.screenshot({ path: `${shots}/04-etudiant-aide-recue.png`, fullPage: true, animations: "disabled" })

  // Another student never sees it.
  const otherContext = await browser.newContext()
  const other = await otherContext.newPage()
  await login(other, "demo.etudiant09")
  expect(await (await other.request.get("/api/v1/student/help")).text()).not.toContain("Pourquoi 100 DH")
  await otherContext.close()

  await login(page, "demo.enseignant")
  await teacherView(page, "Ma classe", "Demandes d’aide")
  const help = page.getByRole("region", { name: /Demandes d’aide en attente/ })
  const item = help.getByRole("listitem").filter({ hasText: "demo.etudiant05" }).first()
  await expect(item).toBeVisible({ timeout: 10_000 })
  await expect(item).toContainText(mission.title)
  await page.screenshot({ path: `${shots}/05-ma-classe-aide.png`, fullPage: true, animations: "disabled" })
  await item.getByRole("button", { name: "Marquer comme traitée" }).click()
  await expect(page.getByText("Demande de demo.etudiant05 marquée comme traitée.")).toBeVisible()
  await learner.reload()
  await expect(learner.getByText("Demande traitée")).toBeVisible()
  await learnerContext.close()
})

test("results list the class grades and export them", async ({ page }) => {
  await login(page, "demo.enseignant")
  await teacherView(page, "Résultats")
  const table = page.getByRole("table", { name: "Notes de la classe" })
  await expect(table.getByRole("row").filter({ hasText: "demo.etudiant01" })).toBeVisible()
  const link = page.getByRole("link", { name: "Exporter les notes (CSV)" })
  const csv = await page.request.get((await link.getAttribute("href"))!)
  expect(csv.status()).toBe(200)
  expect(await csv.text()).toContain("etudiant;")
  expect(await serious(page)).toEqual([])
  await page.screenshot({ path: `${shots}/06-resultats.png`, fullPage: true, animations: "disabled" })
})
