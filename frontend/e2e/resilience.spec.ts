import { test, expect, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"

// ADR-0038: an outage of the API (gateway 502/504, cut network) never signs out; the page tries again by
// itself and comes back to the requested address. Fictional demo account only.
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const NAME = "demo.etudiant09"
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR ?? "test-results/resilience"
const UNAVAILABLE = /La plateforme est momentanément indisponible\. Votre session et votre travail sont conservés\. Nouvelle tentative automatique/

async function login(page: Page) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(NAME)
  await page.getByLabel("Mot de passe").fill(accounts.find((item) => item.username === NAME)!.password)
  await expect(page.getByRole("checkbox")).toHaveCount(0)
  await expect(page.getByText("Vous restez connecté 30 jours sur cet appareil.", { exact: false })).toBeVisible()
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${NAME}` })).toBeVisible()
}

/** What the gateway answers while the backend restarts: an HTML 502, for the API and the health check. */
async function cut(page: Page) {
  const down = async (route: import("@playwright/test").Route) => route.fulfill({ status: 502, contentType: "text/html", body: "<h1>502 Bad Gateway</h1>" })
  await page.route("**/api/**", down)
  await page.route("**/health/**", down)
}
async function restore(page: Page) {
  await page.unroute("**/api/**")
  await page.unroute("**/health/**")
}

test("API down at load: « momentanément indisponible », session kept, automatic return to the requested page", async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)
  const dashboard = await (await page.request.get("/api/v1/student/dashboard")).json() as { courses: { missions: { mission_version_id: number; title: string }[] }[] }
  const mission = dashboard.courses[0].missions[0]
  await cut(page)
  await page.goto(`/#/mission/${mission.mission_version_id}`)
  await page.reload()
  await expect(page.getByText(UNAVAILABLE)).toBeVisible()
  await expect(page.getByText("Prochaine tentative dans", { exact: false })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Identifiant" })).toHaveCount(0)
  await page.screenshot({ path: `${shots}/indisponible.png`, animations: "disabled" })
  await restore(page)
  // Attempts after 1, 2, 4, 8, 16 s: back within the next attempt, on the same mission, still signed in.
  await expect(page.getByRole("heading", { level: 1, name: mission.title })).toBeVisible({ timeout: 45_000 })
  await expect(page).toHaveURL(new RegExp(`#/mission/${mission.mission_version_id}$`))
})

test("API down on an open page: banner, the page stays, then the waiting view loads by itself", async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)
  const dashboard = await (await page.request.get("/api/v1/student/dashboard")).json() as { courses: { missions: { mission_version_id: number; title: string }[] }[] }
  const mission = dashboard.courses[0].missions[0]
  await cut(page)
  await page.evaluate((id) => { window.location.hash = `#/mission/${id}` }, mission.mission_version_id)
  await expect(page.getByText(UNAVAILABLE)).toBeVisible()
  await expect(page.getByRole("button", { name: /^Compte et paramètres/ })).toBeVisible()  // still signed in
  await page.screenshot({ path: `${shots}/bandeau.png`, animations: "disabled" })
  await restore(page)
  await expect(page.getByRole("heading", { level: 1, name: mission.title })).toBeVisible({ timeout: 45_000 })
  await expect(page.getByText(UNAVAILABLE)).toHaveCount(0)
})

test("only a 401 signs out", async ({ page }) => {
  await login(page)
  await page.context().clearCookies()
  await page.reload()
  await expect(page.getByRole("textbox", { name: "Identifiant" })).toBeVisible()
})
