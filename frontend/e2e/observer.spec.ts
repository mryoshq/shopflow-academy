import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

// ADR-0025, ADR-0042: observers invited by the teacher (test stack, fictional accounts only): invitation, activation,
// navigation of both types, refused writes, consultation log.
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const teacherAccount = accounts.find((item) => item.username === "demo.enseignant")!
const PASSWORD = "Observation-e2e-2026"
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR

async function csrfOf(request: APIRequestContext): Promise<string> {
  const cookie = (await request.storageState()).cookies.find((item) => item.name.endsWith("academy_csrf"))
  return cookie?.value ?? ""
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

/** The teacher invites through the API (no SMTP on the test stack: the link comes back to copy). */
async function invite(request: APIRequestContext, kind: "admin" | "guest") {
  const email = `observateur-${kind}-${Date.now()}@example.org`
  const created = await request.post("/api/v1/teacher/observers", { data: { full_name: `Observateur ${kind}`, email, kind }, headers: { "X-CSRF-Token": await csrfOf(request) } })
  expect(created.status()).toBe(201)
  const body = await created.json() as { observer: { id: number }; invitation: { link: string; delivery: string } }
  expect(body.invitation.delivery).toBe("manual")
  return { id: body.observer.id, email, path: new URL(body.invitation.link).hash }
}

/** Opens the link, chooses the password, then signs in. */
async function activate(browser: Browser, path: string, email: string): Promise<Page> {
  const page = await (await browser.newContext({ locale: "fr-FR" })).newPage()
  await page.goto(`/${path}`)
  await expect(page.getByRole("heading", { name: "Activer votre accès observateur" })).toBeVisible()
  expect(await serious(page)).toEqual([])
  if (shots) await page.screenshot({ path: `${shots}/observer-activation.png`, fullPage: true })
  await page.getByLabel(/^Mot de passe/).fill(PASSWORD)
  await page.getByLabel(/^Confirmer le mot de passe/).fill(PASSWORD)
  await page.getByRole("button", { name: "Activer mon compte" }).click()
  await expect(page.getByText("Compte activé : connectez-vous avec votre mot de passe.")).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Identifiant" })).toHaveValue(email)
  await page.getByLabel("Mot de passe").fill(PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: "Espace observateur" })).toBeVisible()
  return page
}

test("guest: invitation, activation, anonymised dashboard and charts, course; no grades, no export, writes refused", async ({ browser, request }) => {
  expect((await request.post("/api/v1/auth/login", { data: teacherAccount })).status()).toBe(200)
  const { id, email, path } = await invite(request, "guest")
  const page = await activate(browser, path, email)
  await expect(page.getByRole("note")).toContainText("Données anonymisées")
  await expect(page.getByRole("button", { name: /Notifications/ })).toHaveCount(0)
  await expect(page.getByRole("region", { name: "Progression moyenne" })).toBeVisible()
  await expect(page.getByRole("main")).not.toContainText("demo.etudiant")
  expect(await serious(page)).toEqual([])
  await page.getByRole("tab", { name: "Graphiques" }).click()
  await expect(page.getByRole("region", { name: "Répartition des notes" })).toBeVisible()
  await page.getByRole("tab", { name: "Cours" }).click()
  await expect(page.getByText("Vue étudiante : les corrigés ne sont pas affichés.", { exact: false })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Notes" })).toHaveCount(0)
  // The link is single-use.
  const again = await page.request.get(`/api/v1/invitations/${path.split("/").pop()}`)
  expect(again.status()).toBe(410)
  // Writes and other routes are refused; the grades are for « Administration » only.
  const csrf = (await page.context().cookies()).find((item) => item.name.endsWith("academy_csrf"))?.value ?? ""
  const assignment = (await (await page.request.get("/api/v1/observer/classes")).json() as { id: number }[])[0].id
  expect((await page.request.get(`/api/v1/observer/classes/${assignment}/grades`)).status()).toBe(403)
  expect((await page.request.get(`/api/v1/observer/classes/${assignment}/report.pdf`)).status()).toBe(403)
  expect((await page.request.post(`/api/v1/teacher/classes/${assignment}/pause`, { headers: { "X-CSRF-Token": csrf } })).status()).toBe(403)
  expect((await page.request.post("/api/v1/presence", { data: {}, headers: { "X-CSRF-Token": csrf } })).status()).toBe(403)
  expect((await page.request.get("/api/v1/student/dashboard")).status()).toBe(403)
  // The teacher sees the consultations, then disables the account: the open session stops.
  const views = await (await request.get("/api/v1/teacher/observers/views")).json() as { email: string; view: string }[]
  expect(views.filter((item) => item.email === email).map((item) => item.view)).toEqual(expect.arrayContaining(["classes", "dashboard", "charts", "course"]))
  expect((await request.patch(`/api/v1/teacher/observers/${id}`, { data: { enabled: false }, headers: { "X-CSRF-Token": await csrfOf(request) } })).status()).toBe(200)
  expect((await page.request.get("/api/v1/observer/classes")).status()).toBe(401)
  await page.context().close()
})

test("administration: names, sortable grades, a student's file, CSV and PDF; the teacher's panel and its log", async ({ browser, page, request }) => {
  expect((await request.post("/api/v1/auth/login", { data: teacherAccount })).status()).toBe(200)
  const { email, path } = await invite(request, "admin")
  const observer = await activate(browser, path, email)
  await observer.getByRole("tab", { name: "Notes" }).click()
  const table = observer.getByRole("table", { name: "Notes de la classe" })
  await expect(table).toContainText("demo.etudiant")
  expect(await serious(observer)).toEqual([])
  if (shots) await observer.screenshot({ path: `${shots}/observer-grades.png`, fullPage: true })
  await table.getByRole("button", { name: /^Fiche de / }).first().click()
  await expect(observer.getByRole("heading", { name: "Progression par module" })).toBeVisible()
  await observer.getByRole("button", { name: "Fermer le panneau" }).click()
  const csv = await observer.request.get(await observer.getByRole("link", { name: "Exporter (CSV)" }).getAttribute("href") ?? "")
  expect(csv.status()).toBe(200)
  expect((await csv.text()).split("\n")[0]).toContain("etudiant;points_cours")
  const pdf = await observer.request.get(await observer.getByRole("link", { name: "Rapport de classe (PDF)" }).getAttribute("href") ?? "")
  expect(pdf.headers()["content-type"]).toBe("application/pdf")
  expect((await pdf.body()).subarray(0, 8).toString()).toBe("%PDF-1.4")
  await observer.context().close()
  // The teacher's panel: the observer is active, the log lists the report.
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(teacherAccount.username)
  await page.getByLabel("Mot de passe").fill(teacherAccount.password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await page.goto("/#/reglages/observateurs")
  await expect(page.getByRole("heading", { name: "Observateurs", level: 2 })).toBeVisible()
  const item = page.getByRole("listitem").filter({ hasText: email })
  await expect(item).toContainText("Actif")
  await expect(item).toContainText("Administration")
  await expect(page.getByRole("region", { name: "Tableau des consultations" })).toContainText("Rapport PDF")
  expect(await serious(page)).toEqual([])
})
