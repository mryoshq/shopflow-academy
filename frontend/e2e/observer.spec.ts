import { test, expect, type APIRequestContext } from "@playwright/test"
import { readFileSync } from "node:fs"

// J (ADR-0025): a read-only observer created by the teacher on the test stack (fictional demo accounts only).
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const teacherAccount = accounts.find((item) => item.username === "demo.enseignant")!

async function csrfOf(request: APIRequestContext): Promise<string> {
  const cookie = (await request.storageState()).cookies.find((item) => item.name.endsWith("academy_csrf"))
  return cookie?.value ?? ""
}

test("observer: sign-in, read-only consultation, refused actions, consultations listed for the teacher", async ({ page, request }) => {
  // The teacher creates the observer; its password is returned once.
  expect((await request.post("/api/v1/auth/login", { data: teacherAccount })).status()).toBe(200)
  const username = `observateur-e2e-${Date.now()}`
  const created = await request.post("/api/v1/teacher/observers", { data: { username }, headers: { "X-CSRF-Token": await csrfOf(request) } })
  expect(created.status()).toBe(201)
  const { id, password } = await created.json() as { id: number; password: string }

  // Sign-in and consultation in the browser.
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(username)
  await page.getByLabel("Mot de passe").fill(password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: "Espace observateur" })).toBeVisible()
  await expect(page.getByRole("note")).toContainText("lecture seule")
  await expect(page.getByText("Vue étudiante : les corrigés ne sont pas affichés.", { exact: false })).toBeVisible()
  await expect(page.getByRole("button", { name: /Notifications/ })).toHaveCount(0)
  await page.getByRole("tab", { name: "Progression" }).click()
  await expect(page.getByRole("table", { name: "Progression de la classe" })).toBeVisible()
  await expect(page.getByRole("table", { name: "Progression de la classe" })).not.toContainText("demo.etudiant")
  await page.getByRole("tab", { name: "Résultats" }).click()
  await expect(page.getByRole("link", { name: "Exporter les notes (CSV)" })).toBeVisible()

  // Refused actions: every write and every teacher or student route answers 403.
  const csrf = (await page.context().cookies()).find((item) => item.name.endsWith("academy_csrf"))?.value ?? ""
  const classes = await (await page.request.get("/api/v1/observer/classes")).json() as { id: number }[]
  const assignment = classes[0].id
  expect((await page.request.post(`/api/v1/teacher/classes/${assignment}/pause`, { headers: { "X-CSRF-Token": csrf } })).status()).toBe(403)
  expect((await page.request.post("/api/v1/teacher/observers", { data: { username: "intrus.e2e" }, headers: { "X-CSRF-Token": csrf } })).status()).toBe(403)
  expect((await page.request.get("/api/v1/teacher/classes")).status()).toBe(403)
  expect((await page.request.get("/api/v1/student/dashboard")).status()).toBe(403)
  expect((await page.request.post("/api/v1/presence", { data: {}, headers: { "X-CSRF-Token": csrf } })).status()).toBe(403)

  // The teacher sees each consultation, then disables the account: the open session stops working.
  const views = await (await request.get("/api/v1/teacher/observers/views")).json() as { observer: string; view: string }[]
  const mine = views.filter((item) => item.observer === username).map((item) => item.view)
  expect(mine).toEqual(expect.arrayContaining(["classes", "course", "progress", "results"]))
  expect((await request.patch(`/api/v1/teacher/observers/${id}`, { data: { enabled: false }, headers: { "X-CSRF-Token": await csrfOf(request) } })).status()).toBe(200)
  expect((await page.request.get("/api/v1/observer/classes")).status()).toBe(401)
})
