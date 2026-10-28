import { test, expect } from "@playwright/test"
import { readFileSync } from "node:fs"

const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const teacher = accounts.find((account) => account.username === "demo.enseignant")
const student = accounts.find((account) => account.username === "demo.etudiant01")
if (!teacher || !student) throw new Error("Demo credentials are missing")

async function login(page: import("@playwright/test").Page, account: { username: string; password: string }) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(account.username)
  await page.getByLabel("Mot de passe").fill(account.password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${account.username}` })).toBeVisible()
}

/** Blocks arrive closed: open the first block of the class given to this cohort. */
async function openFirstBlock(page: import("@playwright/test").Page, cohort: string) {
  const classes = await (await page.request.get("/api/v1/teacher/classes")).json() as { id: number; cohort: string }[]
  const klass = classes.find((item) => item.cohort === cohort)!
  const token = (await page.context().cookies()).find((item) => item.name.endsWith("academy_csrf"))?.value ?? ""
  const response = await page.request.post(`/api/v1/teacher/classes/${klass.id}/blocks/open-next`, { headers: { "X-CSRF-Token": token } })
  expect(response.status()).toBe(200)
}

test("studio: create, validate, preview, publish, assign and read without leaking answers", async ({ page, browser }) => {
  const suffix = Date.now().toString(36)
  const courseTitle = `Démonstration SQL ${suffix}`
  const cohortTitle = `Cohorte démo ${suffix}`
  await login(page, teacher)
  await expect(page.getByRole("heading", { name: "Studio de cours" })).toBeVisible()
  // Other courses live in the advanced options: the studio opens the single course first.
  await page.getByRole("button", { name: /Options avancées : autres cours/ }).click()
  const sidebar = page.locator("aside")
  await sidebar.getByLabel("Titre").fill(courseTitle)
  await sidebar.getByLabel("Description").fill("Exercice fictif pour vérifier le studio.")
  await sidebar.getByRole("button", { name: "Créer le cours" }).click()
  await expect(page.getByRole("heading", { name: courseTitle })).toBeVisible()

  await page.getByRole("tab", { name: "Publication" }).click()
  await page.getByRole("button", { name: "Publier une version" }).click()
  await expect(page.getByRole("alert")).toContainText("incomplet")
  await page.getByRole("tab", { name: "Structure" }).click()
  await page.getByLabel("Description de l’objectif").fill("Comparer des volumes SQL")
  await page.getByRole("button", { name: "Ajouter l’objectif" }).click()
  await page.getByLabel("Titre du nouveau module").fill("Fondations")
  await page.getByRole("button", { name: "Ajouter un module" }).click()
  await page.getByLabel("Nouveau chapitre pour Fondations").fill("Comparer")
  await page.getByRole("button", { name: "Ajouter un chapitre" }).click()
  await page.getByLabel("Nouvelle mission pour Comparer").fill("Comparer deux valeurs")
  await page.getByRole("button", { name: "Ajouter une mission" }).click()
  await expect(page.getByRole("heading", { name: "Éditer une mission" })).toBeVisible()
  await page.getByLabel("Situation").fill("Dans un tableau SQL, A < B et B > A.")
  await page.getByLabel("Consigne").fill("Quelle affirmation est correcte ?")
  await page.getByLabel("Proposition 1").fill("A est inférieur à B")
  await page.getByLabel("Proposition 2").fill("A est supérieur à B")
  await page.getByRole("button", { name: "Enregistrer la mission" }).click()
  await expect(page.getByRole("status")).toContainText("Mission enregistrée")

  await page.getByRole("tab", { name: "Aperçu" }).click()
  await page.getByRole("button", { name: "Charger l’aperçu" }).click()
  await expect(page.getByText("Dans un tableau SQL, A < B et B > A.").last()).toBeVisible()
  await page.getByRole("button", { name: "Simuler cette réponse" }).click()
  await expect(page.getByRole("status").last()).toContainText("correction privée")
  await page.screenshot({ path: process.env.SHOPFLOW_SCREENSHOT_DIR ? `${process.env.SHOPFLOW_SCREENSHOT_DIR}/p0-04-teacher.png` : "test-results/p0-04-teacher.png", fullPage: true })

  await page.getByRole("tab", { name: "Publication" }).click()
  await page.getByRole("button", { name: "Vérifier le brouillon" }).click()
  await expect(page.getByRole("status")).toContainText("Brouillon valide")
  await page.getByRole("button", { name: "Publier une version" }).click()
  await expect(page.getByText("Version 1 · publiée")).toBeVisible()
  await page.getByLabel("Nom de la nouvelle cohorte").fill(cohortTitle)
  await page.getByRole("button", { name: "Créer la cohorte" }).click()
  const row = page.getByText(student.username).locator("..")
  await row.getByRole("button", { name: "Inscrire" }).click()
  await expect(row.getByText("Inscrit")).toBeVisible()
  await page.getByRole("button", { name: "Attribuer à la cohorte" }).click()
  await expect(page.getByRole("button", { name: "Déjà attribuée" })).toBeDisabled()
  await openFirstBlock(page, cohortTitle)

  const learner = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const learnerPage = await learner.newPage()
  await login(learnerPage, student)
  const learnerCourse = learnerPage.getByRole("region", { name: courseTitle })
  await expect(learnerCourse).toBeVisible()
  const courseList = await learnerPage.request.get("/api/v1/student/courses")
  const releases = await courseList.json() as { id: number; title: string }[]
  const release = releases.find((item) => item.title === courseTitle)
  expect(release).toBeTruthy()
  const courseResponse = await learnerPage.request.get(`/api/v1/student/courses/${release!.id}`)
  const text = await courseResponse.text()
  expect(text).not.toMatch(/correct_ids|correct_pairs|feedback|action_id|max_points/)
  await learnerCourse.getByRole("button", { name: "Ouvrir : Comparer deux valeurs" }).click()
  await expect(learnerPage.getByText("Dans un tableau SQL, A < B et B > A.")).toBeVisible()
  await expect(learnerPage.getByRole("button", { name: "Simuler cette réponse" })).toHaveCount(0)
  await learnerPage.screenshot({ path: process.env.SHOPFLOW_SCREENSHOT_DIR ? `${process.env.SHOPFLOW_SCREENSHOT_DIR}/p0-04-student.png` : "test-results/p0-04-student.png", fullPage: true })
  const forbidden = await learnerPage.request.get("/api/v1/teacher/courses")
  expect(forbidden.status()).toBe(403)
  await learner.close()
})
