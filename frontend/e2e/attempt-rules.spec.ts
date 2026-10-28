import { test, expect, type APIRequestContext, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/**
 * Sprint 2, part L (ADR-0027) on the test stack: the teacher turns on the rules against random
 * clicking; a student sees the announcement, « Essai N : jusqu'à P % », the pause after an error
 * (enforced by the server), and the teacher sees « Clics rapides ». The rules are switched off
 * again at the end so the other specs keep the default behaviour.
 */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = () => JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR ?? "test-results/sprint2-l"
const STUDENT = "demo.etudiant08"
const MISSION = "Frais de livraison après une jointure"
test.describe.configure({ mode: "serial" })

async function login(page: Page, name: string) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await page.getByLabel("Mot de passe").fill(accounts().find((item) => item.username === name)!.password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${name}` })).toBeVisible()
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => `${item.id} ${item.nodes.map((n) => n.target.join(" ")).join(" | ")}`)
}

async function csrf(page: Page) {
  return (await page.context().cookies()).find((item) => item.name.endsWith("academy_csrf"))?.value ?? ""
}

async function putRules(request: APIRequestContext, token: string, courseId: number, changes: Record<string, unknown>) {
  const current = await (await request.get(`/api/v1/teacher/courses/${courseId}/attempt-rules`)).json() as Record<string, unknown>
  const body = Object.fromEntries(Object.entries({ ...current, ...changes }).filter(([key]) => !["defaults", "decay_since", "pause_since", "announced_since"].includes(key)))
  const response = await request.put(`/api/v1/teacher/courses/${courseId}/attempt-rules`, { data: body, headers: { "X-CSRF-Token": token } })
  expect(response.status()).toBe(200)
}

const suffix = (theme: string) => theme === "light" ? "clair" : "sombre"

test("the teacher turns the rules on in « Mon cours » → Règles", async ({ page }) => {
  await login(page, "demo.enseignant")
  await page.getByRole("tab", { name: "Règles" }).click()
  await expect(page.getByRole("heading", { name: "Règles contre le clic au hasard" })).toBeVisible()
  await page.getByLabel(/Points dégressifs/).check()
  await page.getByLabel(/Pause après une erreur/).check()
  await expect(page.getByLabel("Pourcentages par essai")).toHaveValue("100, 70, 50")
  await page.getByRole("button", { name: "Enregistrer les règles" }).click()
  await expect(page.getByText(/Règles enregistrées/)).toBeVisible()
  await expect(page.getByText(/Active depuis le/)).toBeVisible()
  expect(await serious(page)).toEqual([])
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => window.localStorage.setItem("shopflow:theme", value), theme)
    await page.reload()
    await page.getByRole("tab", { name: "Règles" }).click()
    await expect(page.getByText(/Active depuis le/)).toBeVisible()
    await page.screenshot({ path: `${shots}/40-regles-${suffix(theme)}.png`, fullPage: true, animations: "disabled" })
  }
})

for (const [theme, width, height] of [["light", 1366, 768], ["dark", 1366, 768], ["light", 390, 844], ["dark", 390, 844]] as const) {
  test(`student in the ${theme} theme at ${width}px: announcement, attempt percentage, pause after an error`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" })
    await context.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
    const page = await context.newPage()
    const size = `${suffix(theme)}-${width}`
    await login(page, STUDENT)
    await expect(page.getByText(/Nouvelle règle : chaque essai compte/).first()).toBeVisible()
    expect(await serious(page)).toEqual([])
    await page.screenshot({ path: `${shots}/41-annonce-${size}.png`, fullPage: false, animations: "disabled" })
    await page.getByRole("button", { name: `Ouvrir : ${MISSION}` }).first().click()
    await expect(page.getByRole("heading", { level: 1, name: MISSION })).toBeVisible()
    const label = page.getByText(/^Essai \d+ : jusqu’à \d+ % des points$/)
    await expect(label).toBeVisible()
    await page.getByRole("radio", { name: /SUM\(DISTINCT/ }).check()
    await page.getByRole("button", { name: "Tester ma décision" }).click()
    await expect(page.getByText("Presque ! Réessayez")).toBeVisible()
    await expect(page.getByText(/^Pause de \d+ s : relisez la situation\.$/)).toBeVisible()
    await expect(page.getByRole("button", { name: /^Réessayer dans \d+ s$/ })).toBeDisabled()
    await expect(page.getByRole("button", { name: "Voir un indice" })).toBeVisible()
    expect(await serious(page)).toEqual([])
    await page.screenshot({ path: `${shots}/42-pause-${size}.png`, fullPage: true, animations: "disabled" })
    // The server refuses an attempt during the pause.
    const mission = Number(page.url().split("/").pop())
    const refused = await page.request.post(`/api/v1/student/missions/${mission}/attempts`, {
      data: { idempotency_key: `e2e-pause-${Date.now()}`, answer: { choice_ids: ["x"] } }, headers: { "X-CSRF-Token": await csrf(page) } })
    expect(refused.status()).toBe(429)
    await expect(page.getByRole("button", { name: "Réessayer" })).toBeEnabled({ timeout: 35_000 })
    await page.getByRole("button", { name: "Réessayer" }).click()
    await expect(label).toBeVisible()
    const [, percent] = /jusqu’à (\d+) %/.exec(await label.innerText())!
    await page.getByRole("radio", { name: /La jointure passe au grain article/ }).check()
    await page.getByRole("button", { name: "Tester ma décision" }).click()
    await expect(page.getByText("Bonne décision")).toBeVisible()
    await expect(page.getByText(new RegExp(`^Essai n° \\d+ : ${Number(percent) / 10} / 10 pts`))).toBeVisible()
    await context.close()
  })
}

test("« Ma classe » shows fast clicks", async ({ page }) => {
  await login(page, "demo.enseignant")
  await page.getByRole("tab", { name: "Ma classe" }).click()
  const row = page.getByRole("row").filter({ hasText: STUDENT })
  await expect(row.getByText(/Clics rapides : \d+/)).toBeVisible()
  await expect(page.getByRole("table", { name: "Statistiques par mission" })).toContainText(STUDENT)
  await page.screenshot({ path: `${shots}/43-ma-classe-clics-rapides.png`, fullPage: true, animations: "disabled" })
})

// Always switch the rules off again, even after a failure, so the other specs keep the defaults.
test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  await login(page, "demo.enseignant")
  const main = await (await page.request.get("/api/v1/teacher/main")).json() as { course: { id: number } }
  await putRules(page.request, await csrf(page), main.course.id, { decay_enabled: false, pause_enabled: false, reading_enabled: false })
  await page.close()
})
