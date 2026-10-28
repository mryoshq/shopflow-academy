import { test, expect, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"

/** P0-09 acceptance: the teacher publishes a demo, a student completes it, the grade persists, other accounts are isolated. */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => accounts.find((item) => item.username === name)!
const fixture = JSON.parse(readFileSync("e2e/fixtures/demo-course.json", "utf8"))

async function login(page: Page, name: string) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await page.getByLabel("Mot de passe").fill(account(name).password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${name}` })).toBeVisible()
}

test("teacher publishes the demo, a student completes it, the grade persists and stays private", async ({ page, browser }) => {
  const suffix = Date.now().toString(36)
  const title = `Parcours de démonstration ${suffix}`
  await login(page, "demo.enseignant")
  await page.getByLabel("Fichier de cours JSON").setInputFiles({ name: "demo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) })
  await expect(page.getByText(/Fichier valide/)).toBeVisible()
  await page.getByLabel("Titre du nouveau cours").fill(title)
  await page.getByRole("button", { name: "Importer comme nouveau brouillon" }).click()
  await expect(page.getByRole("heading", { name: title })).toBeVisible()
  await page.getByRole("tab", { name: "Publication" }).click()
  await page.getByRole("button", { name: "Publier une version" }).click()
  await expect(page.getByText(/Version 1 · publiée/).first()).toBeVisible()
  await page.getByLabel("Nom de la nouvelle cohorte").fill(`Cohorte parcours ${suffix}`)
  await page.getByRole("button", { name: "Créer la cohorte" }).click()
  const row = page.getByText("demo.etudiant07", { exact: true }).locator("..")
  await row.getByRole("button", { name: "Inscrire" }).click()
  await expect(row.getByText("Inscrit")).toBeVisible()
  await page.getByRole("button", { name: "Attribuer à la cohorte" }).click()
  await expect(page.getByRole("button", { name: "Déjà attribuée" })).toBeDisabled()

  const studentContext = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const student = await studentContext.newPage()
  await login(student, "demo.etudiant07")
  const course = student.getByRole("region", { name: title })
  await course.getByRole("button", { name: "Ouvrir : Frais de livraison après une jointure" }).click()
  await student.getByRole("radio", { name: /La jointure passe au grain article/ }).check()
  await student.getByRole("button", { name: "Tester ma décision" }).click()
  await expect(student.getByText("Bonne décision")).toBeVisible()
  await student.getByRole("button", { name: "Mission suivante" }).first().click()
  for (const start of ["Contrôler le type", "Normaliser", "Dédupliquer", "Traiter la ville"]) await student.getByRole("checkbox", { name: new RegExp(`^${start}`) }).check()
  await student.getByRole("button", { name: "Tester ma décision" }).click()
  await expect(student.getByText("Bonne décision")).toBeVisible()
  await student.getByRole("button", { name: "Mission suivante" }).first().click()
  const expected = ["Lire le fichier source", "Valider le schéma et les types", "Nettoyer les valeurs", "Dédupliquer les enregistrements", "Charger de façon idempotente"]
  await expect(student.getByRole("heading", { level: 1, name: "Ordonner un pipeline d'ingestion" })).toBeVisible()
  const list = student.getByRole("list", { name: "Étapes à ordonner" })
  await expect(list.getByRole("listitem")).toHaveCount(5)
  for (let target = 0; target < expected.length; target += 1) {
    let current = (await list.getByRole("listitem").allInnerTexts()).findIndex((text) => text.includes(expected[target]))
    while (current > target) {
      await list.getByRole("button", { name: new RegExp(`^Monter « ${expected[target]}`) }).click()
      current -= 1
      await expect(list.getByRole("listitem").nth(current)).toContainText(expected[target])
    }
  }
  await student.getByRole("button", { name: "Tester ma décision" }).click()
  await expect(student.getByText("Bonne décision")).toBeVisible()

  // Grade persists across a full reload and a new session.
  await student.goto("/")
  await expect(course.getByText("Réussie")).toHaveCount(3)
  await studentContext.close()
  const again = await browser.newContext()
  const reloaded = await again.newPage()
  await login(reloaded, "demo.etudiant07")
  await expect(reloaded.getByRole("img", { name: "30 points sur 30" }).first()).toBeVisible()
  const dashboard = await (await reloaded.request.get("/api/v1/student/dashboard")).json() as { courses: { title: string; missions: { mission_version_id: number }[] }[] }
  const ids = dashboard.courses.find((item) => item.title === title)!.missions.map((item) => item.mission_version_id)
  await again.close()

  // Cross-account: a student outside the cohort sees neither the course nor its missions.
  const outsiderContext = await browser.newContext()
  const outsider = await outsiderContext.newPage()
  await login(outsider, "demo.etudiant08")
  await expect(outsider.getByRole("region", { name: title })).toHaveCount(0)
  for (const id of ids) {
    expect((await outsider.request.get(`/api/v1/student/missions/${id}`)).status()).toBe(404)
    expect((await outsider.request.get(`/api/v1/student/missions/${id}/attempts`)).status()).toBe(404)
  }
  await outsiderContext.close()

  // The teacher sees the persistent grade in the class view.
  await page.getByRole("tab", { name: "Suivi de classe" }).click()
  const select = page.getByLabel("Classe suivie")
  const value = await select.locator("option").filter({ hasText: `Cohorte parcours ${suffix}` }).getAttribute("value")
  await select.selectOption(value!)
  const line = page.getByRole("row").filter({ hasText: "demo.etudiant07" })
  await expect(line.getByRole("cell").nth(1)).toHaveText("3 / 3")
  await expect(line.getByRole("cell").nth(2)).toHaveText("30 / 30")
})
