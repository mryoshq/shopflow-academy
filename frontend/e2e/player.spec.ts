import { test, expect, type Page, type BrowserContext } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/**
 * P0-05 student player on the demonstration course (fictional accounts only).
 * Requires: stack running + `python -m app.demo_course` (see docs/STUDENT-PLAYER.md).
 */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => {
  const found = accounts.find((item) => item.username === name)
  if (!found) throw new Error(`Demo account ${name} is missing`)
  return found
}
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR ?? "test-results/p0-05"
const COURSE = "Démonstration — Données ShopFlow"

async function keyboardLogin(page: Page, name: string) {
  const { username, password } = account(name)
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).focus()
  await page.keyboard.type(username)
  await page.keyboard.press("Tab")
  await page.keyboard.type(password)
  await page.keyboard.press("Enter")
  await expect(page.getByRole("heading", { name: `Bonjour, ${username}` })).toBeVisible()
}

/** Activate a control with the keyboard only: move focus to it, then press a key. */
async function press(page: Page, locator: ReturnType<Page["getByRole"]>, key = "Enter") {
  // The app moves focus on purpose (to the feedback, to the moved step); wait until it settles.
  await expect(async () => {
    await locator.focus()
    await expect(locator).toBeFocused({ timeout: 300 })
  }).toPass({ timeout: 10_000 })
  await page.keyboard.press(key)
}

async function openMission(page: Page, title: string) {
  const course = page.getByRole("region", { name: COURSE })
  await press(page, course.getByRole("button", { name: `Ouvrir : ${title}` }))
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()
}

async function seriousA11yViolations(page: Page) {
  // Measure the settled page: a button fading from disabled to enabled is not a contrast defect.
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => item.impact === "serious" || item.impact === "critical").map((item) => `${item.id}: ${item.nodes.length} ${item.nodes.map((node) => `${node.target.join(" ")} [${node.failureSummary?.split("\n").slice(1).join(" ").trim()}]`).join(" | ")}`)
}

async function csrf(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find((item) => item.name.endsWith("academy_csrf"))
  return cookie?.value ?? ""
}

test("a student completes the three demonstrations with the keyboard only", async ({ page, context }) => {
  await keyboardLogin(page, "demo.etudiant03")
  const course = page.getByRole("region", { name: COURSE })
  await expect(course.getByText("Démonstration", { exact: true })).toBeVisible()
  expect(await seriousA11yViolations(page)).toEqual([])
  await page.screenshot({ path: `${shots}/01-tableau-de-bord.png`, fullPage: true, animations: "disabled" })

  // Mission 1 — shipping fees after a JOIN: a wrong answer, a hint, then the right one.
  await openMission(page, "Frais de livraison après une jointure")
  await expect(page.getByRole("table")).toContainText("Tapis berbère")
  expect(await seriousA11yViolations(page)).toEqual([])
  await page.screenshot({ path: `${shots}/02-mission.png`, fullPage: true, animations: "disabled" })
  await press(page, page.getByRole("radio", { name: /SUM\(DISTINCT/ }), "Space")
  await press(page, page.getByRole("button", { name: "Tester ma décision" }))
  await expect(page.getByText("Presque ! Réessayez")).toBeVisible()
  await expect(page.getByText(/par hasard/)).toBeVisible()
  await page.screenshot({ path: `${shots}/03-feedback-a-revoir.png`, fullPage: true, animations: "disabled" })
  const hint = page.getByRole("button", { name: /Afficher un indice|Indice suivant/ })
  if (await hint.count()) {
    await press(page, hint)
    await expect(page.getByText(/déjà consulté/)).toBeVisible()
  }
  await page.screenshot({ path: `${shots}/04-indice.png`, fullPage: true, animations: "disabled" })
  await press(page, page.getByRole("button", { name: "Réessayer" }))
  await press(page, page.getByRole("radio", { name: /La jointure passe au grain article/ }), "Space")
  await press(page, page.getByRole("button", { name: "Tester ma décision" }))
  await expect(page.getByText("Bonne décision")).toBeVisible()
  await expect(page.getByText(/70 DH/).first()).toBeVisible()
  await page.screenshot({ path: `${shots}/05-feedback-correct.png`, fullPage: true, animations: "disabled" })

  // Mission 2 — CSV validation (multiple choice), via the "next mission" button.
  await press(page, page.getByRole("button", { name: "Mission suivante" }).first())
  await expect(page.getByRole("heading", { level: 1, name: "Valider un import CSV de clients" })).toBeVisible()
  for (const start of ["Contrôler le type", "Normaliser", "Dédupliquer", "Traiter la ville"]) {
    const box = page.getByRole("checkbox", { name: new RegExp(`^${start}`) })
    if (!(await box.isChecked())) await press(page, box, "Space")
    await expect(box).toBeChecked()
  }
  await press(page, page.getByRole("button", { name: "Tester ma décision" }))
  await expect(page.getByText("Bonne décision")).toBeVisible()

  // Mission 3 — pipeline order, unlocked by mission 2; reorder with Monter buttons only.
  await press(page, page.getByRole("button", { name: "Mission suivante" }).first())
  await expect(page.getByRole("heading", { level: 1, name: "Ordonner un pipeline d'ingestion" })).toBeVisible()
  const expected = ["Lire le fichier source", "Valider le schéma et les types", "Nettoyer les valeurs (dates, espaces, montants)",
    "Dédupliquer les enregistrements", "Charger de façon idempotente (upsert)"]
  const list = page.getByRole("list", { name: "Étapes à ordonner" })
  for (let target = 0; target < expected.length; target += 1) {
    const labels = await list.getByRole("listitem").allInnerTexts()
    let current = labels.findIndex((text) => text.includes(expected[target]))
    if (current <= target) continue
    const up = page.getByRole("button", { name: `Monter « ${expected[target]} »` })
    await expect(async () => {
      await up.focus()
      await expect(up).toBeFocused({ timeout: 300 })
    }).toPass({ timeout: 10_000 })
    while (current > target) {
      // Focus follows the moved step, so a keyboard user simply presses Enter again.
      await expect(up).toBeFocused()
      await page.keyboard.press("Enter")
      current -= 1
      await expect(list.getByRole("listitem").nth(current)).toContainText(expected[target])
    }
  }
  await expect(list.getByRole("listitem").first()).toContainText("Lire le fichier source")
  expect(await seriousA11yViolations(page)).toEqual([])
  await press(page, page.getByRole("button", { name: "Tester ma décision" }))
  await expect(page.getByText("Bonne décision")).toBeVisible()
  await press(page, page.getByRole("button", { name: "Retour au tableau de bord" }).last())
  await expect(course.getByText("Réussie")).toHaveCount(3)
  await expect(page.getByRole("img", { name: "30 points sur 30" })).toBeVisible()
  await page.screenshot({ path: `${shots}/09-score.png`, fullPage: true, animations: "disabled" })

  // No answer key in any student payload.
  for (const path of ["/api/v1/student/dashboard"]) {
    const body = await (await page.request.get(path)).text()
    expect(body).not.toMatch(/correct_ids|correct_pairs|action_id|max_points|"explanation":\s*"[^"]/)
  }
  // Student cannot reach the teacher API.
  expect((await page.request.get("/api/v1/teacher/courses")).status()).toBe(403)
  expect((await page.request.get("/api/v1/teacher/students")).status()).toBe(403)
  await context.close()
})

test("a second student is isolated, sees the locked state and survives a network failure", async ({ page, context }) => {
  await keyboardLogin(page, "demo.etudiant05")
  const course = page.getByRole("region", { name: COURSE })
  const lockedButton = course.getByRole("button", { name: "Verrouillée : Ordonner un pipeline d'ingestion" })
  await expect(lockedButton).toBeDisabled()
  await page.screenshot({ path: `${shots}/06-verrouillee.png`, fullPage: true, animations: "disabled" })
  const dashboard = await (await page.request.get("/api/v1/student/dashboard")).json() as { courses: { title: string; missions: { mission_version_id: number; title: string; status: string }[] }[] }
  const missions = dashboard.courses.find((item) => item.title === COURSE)!.missions
  const locked = missions[2]
  await page.goto(`/#/mission/${locked.mission_version_id}`)
  await expect(page.getByText("Mission verrouillée")).toBeVisible()

  // Network failure on submit: the selection is kept and the retry reuses the same idempotency key.
  await page.goto(`/#/mission/${missions[0].mission_version_id}`)
  await expect(page.getByRole("heading", { level: 1, name: missions[0].title })).toBeVisible()
  const keys: string[] = []
  let fail = true
  await page.route("**/api/v1/student/missions/*/attempts", async (route) => {
    keys.push(JSON.parse(route.request().postData() ?? "{}").idempotency_key)
    if (fail) { fail = false; await route.abort("internetdisconnected"); return }
    await route.continue()
  })
  await press(page, page.getByRole("radio", { name: /Corriger les frais/ }), "Space")
  await press(page, page.getByRole("button", { name: "Tester ma décision" }))
  await expect(page.getByText("Connexion interrompue : votre réponse n’a pas pu être envoyée.")).toBeVisible()
  await expect(page.getByRole("radio", { name: /Corriger les frais/ })).toBeChecked()
  await page.screenshot({ path: `${shots}/07-erreur-reseau.png`, fullPage: true, animations: "disabled" })
  await press(page, page.getByRole("button", { name: "Renvoyer ma décision" }))
  await expect(page.getByText("Presque ! Réessayez")).toBeVisible()
  expect(keys).toHaveLength(2)
  expect(keys[0]).toBe(keys[1])
  await page.unroute("**/api/v1/student/missions/*/attempts")

  // Concurrent duplicate submissions with one key create a single attempt.
  const token = await csrf(context)
  const view = await (await page.request.get(`/api/v1/student/missions/${missions[0].mission_version_id}`)).json() as { attempts_count: number; definition: { choices: { id: string }[] } }
  const key = `concurrent-${Date.now()}`
  const responses = await Promise.all(Array.from({ length: 5 }, () => page.request.post(`/api/v1/student/missions/${missions[0].mission_version_id}/attempts`, {
    headers: { "X-CSRF-Token": token }, data: { idempotency_key: key, answer: { choice_ids: [view.definition.choices[0].id] } },
  })))
  const ids = new Set(await Promise.all(responses.map(async (response) => (await response.json() as { attempt_id: number }).attempt_id)))
  expect(responses.every((response) => [200, 201].includes(response.status()))).toBe(true)
  expect(ids.size).toBe(1)
  const after = await (await page.request.get(`/api/v1/student/missions/${missions[0].mission_version_id}`)).json() as { attempts_count: number }
  expect(after.attempts_count).toBe(view.attempts_count + 1)

  // Mission 3 stays locked for this student whatever student 03 did.
  const again = await (await page.request.get("/api/v1/student/dashboard")).json() as typeof dashboard
  expect(again.courses.find((item) => item.title === COURSE)!.missions[2].status).toBe("locked")
  await context.close()
})

test("a student without courses sees the empty state", async ({ page }) => {
  await page.route("**/api/v1/student/dashboard", (route) => route.fulfill({ json: { display_name: "demo.etudiant09", ai_enabled: false, courses: [] } }))
  await keyboardLogin(page, "demo.etudiant09")
  await expect(page.getByText("Aucun cours pour le moment")).toBeVisible()
  expect(await seriousA11yViolations(page)).toEqual([])
  await page.screenshot({ path: `${shots}/08-vide.png`, fullPage: true, animations: "disabled" })
})

test("the login page is accessible", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible()
  expect(await seriousA11yViolations(page)).toEqual([])
  await page.screenshot({ path: `${shots}/00-connexion.png`, fullPage: true, animations: "disabled" })
})

test("best score and attempt history are kept per student", async ({ page }) => {
  await keyboardLogin(page, "demo.etudiant03")
  await openMission(page, "Frais de livraison après une jointure")
  await expect(page.getByText("Meilleur score : 10 / 10 pts")).toBeVisible()
  // A wrong answer after a success never lowers the best score.
  await press(page, page.getByRole("radio", { name: /Supprimer les lignes/ }), "Space")
  await press(page, page.getByRole("button", { name: "Tester ma décision" }))
  await expect(page.getByText(/Meilleur score conservé : 10 pts/)).toBeVisible()
  await press(page, page.getByRole("button", { name: /Historique de vos essais/ }))
  await expect(page.getByText(/Réussi · 10 pts/).first()).toBeVisible()
  await page.screenshot({ path: `${shots}/10-historique.png`, fullPage: true, animations: "disabled" })
  const other = await page.request.get("/api/v1/student/dashboard")
  expect(await other.text()).not.toMatch(/correct_ids|correct_pairs|"scoring"|max_points/)
})
