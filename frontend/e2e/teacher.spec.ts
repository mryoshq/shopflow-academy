import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => accounts.find((item) => item.username === name)!
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR ?? "test-results/p0-07"

async function login(page: Page, name: string) {
  const { username, password } = account(name)
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(username)
  await page.getByLabel("Mot de passe").fill(password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${username}` })).toBeVisible()
}

async function openClass(page: Page) {
  // The single class of the test stack is the demonstration cohort (config/test-stack.env).
  await page.getByRole("tab", { name: "Ma classe" }).click()
  await expect(page.getByRole("table", { name: /Progression de la classe Cohorte démonstration/ })).toBeVisible()
  const main = await (await page.request.get("/api/v1/teacher/main")).json() as { assignment_id: number }
  return main.assignment_id
}

test("the teacher follows the class live, pauses, unlocks and exports", async ({ page, browser }) => {
  await login(page, "demo.enseignant")
  const classId = await openClass(page)
  // The students table only: the mission statistics also name students (« Clics rapides », ADR-0027).
  const row = page.getByRole("table", { name: /^Progression de la classe/ }).getByRole("row").filter({ hasText: "demo.etudiant06" })
  await expect(row).toBeVisible()
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations
    .filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)).toEqual([])

  // Live update: a student answers, the teacher table shows it within 10 seconds without reloading.
  const learnerContext = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const learner = await learnerContext.newPage()
  await login(learner, "demo.etudiant06")
  const dashboard = await (await learner.request.get("/api/v1/student/dashboard")).json() as { courses: { title: string; missions: { mission_version_id: number; title: string }[] }[] }
  const missions = dashboard.courses.find((course) => course.title === "Démonstration — Données ShopFlow")!.missions
  // Answer the mission that is NOT the current one, so the "Mission en cours" cell must change.
  const currentCell = row.getByRole("cell").nth(3)
  const useFirst = (await currentCell.textContent()) !== missions[0].title
  const target = useFirst ? missions[0] : missions[1]
  await learner.goto(`/#/mission/${target.mission_version_id}`)
  if (useFirst) await learner.getByRole("radio", { name: /Corriger les frais/ }).check()
  else await learner.getByRole("checkbox", { name: /^Convertir toutes les colonnes/ }).check()
  const started = Date.now()
  await learner.getByRole("button", { name: "Tester ma décision" }).click()
  await expect(learner.getByText(/Presque ! Réessayez|Bonne décision/)).toBeVisible()
  await expect(currentCell).toHaveText(target.title, { timeout: 10_000 })
  const latency = Date.now() - started
  test.info().annotations.push({ type: "latence-suivi-ms", description: String(latency) })
  console.log(`Teacher dashboard latency: ${latency} ms (target <= 10000)`)
  expect(latency).toBeLessThanOrEqual(10_000)
  await page.screenshot({ path: `${shots}/01-suivi-de-classe.png`, fullPage: true, animations: "disabled" })

  // Pause: the student cannot answer; resume reopens. Always resume, even if an assertion fails.
  try {
    await page.getByRole("button", { name: "Mettre en pause" }).click()
    await expect(page.getByRole("button", { name: "Reprendre la séquence" })).toBeVisible()
    await learner.reload()
    await expect(learner.getByText("Séquence en pause")).toBeVisible()
    await expect(learner.getByRole("button", { name: "Tester ma décision" })).toBeDisabled()
    await learner.screenshot({ path: `${shots}/02-etudiant-pause.png`, fullPage: true, animations: "disabled" })
  } finally {
    const token = (await page.context().cookies()).find((item) => item.name.endsWith("academy_csrf"))?.value ?? ""
    await page.request.post(`/api/v1/teacher/classes/${classId}/resume`, { headers: { "X-CSRF-Token": token } })
  }
  await page.getByRole("button", { name: "Actualiser" }).first().click()
  await expect(page.getByRole("button", { name: "Mettre en pause" })).toBeVisible()
  await learner.reload()
  await expect(learner.getByText("Séquence en pause")).toHaveCount(0)

  // Unlock the third mission for this student only.
  await row.getByRole("button", { name: "Détail de demo.etudiant06" }).click()
  await expect(page.getByRole("heading", { name: "Détail : demo.etudiant06" })).toBeVisible()
  await expect(page.getByText("Ordonner un pipeline d'ingestion").last()).toBeVisible()
  const unlock = page.getByRole("button", { name: "Débloquer pour cet étudiant" })
  if (await unlock.count()) {
    await unlock.click()
    await expect(page.getByText(/débloquée pour demo.etudiant06/)).toBeVisible()
  }
  await expect(page.getByText("Débloquée par l’enseignant")).toBeVisible()
  await page.screenshot({ path: `${shots}/03-detail-etudiant.png`, fullPage: true, animations: "disabled" })
  const after = await (await learner.request.get("/api/v1/student/dashboard")).json() as typeof dashboard & { courses: { missions: { status: string }[] }[] }
  expect(after.courses.find((course) => course.title === "Démonstration — Données ShopFlow")!.missions[2].status).not.toBe("locked")

  // CSV export (teacher only).
  const csv = await page.request.get(`/api/v1/teacher/classes/${classId}/export.csv`)
  expect(csv.status()).toBe(200)
  const text = await csv.text()
  expect(text).toContain("etudiant;Frais de livraison après une jointure")
  expect(text).toContain("demo.etudiant06;")
  expect((await learner.request.get(`/api/v1/teacher/classes/${classId}/export.csv`)).status()).toBe(403)
  expect((await learner.request.get(`/api/v1/teacher/classes/${classId}/overview`)).status()).toBe(403)
  await expect(page.getByText("Export CSV des notes").first()).toBeVisible({ timeout: 10_000 })
  await learnerContext.close()
})
