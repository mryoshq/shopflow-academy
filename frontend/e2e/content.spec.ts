import { test, expect, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"

const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const teacher = accounts.find((item) => item.username === "demo.enseignant")!
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR ?? "test-results/p0-08"

async function login(page: Page) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(teacher.username)
  await page.getByLabel("Mot de passe").fill(teacher.password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: "Studio de cours" })).toBeVisible()
}

test("course roundtrip: export, import, validate, preview, publish, search and restore", async ({ page }) => {
  await login(page)
  await page.getByRole("button", { name: /Options avancées : autres cours/ }).click()
  const search = await (await page.request.get("/api/v1/teacher/course-search?q=demo-shopflow-donnees")).json() as { id: number }[]
  const exported = await (await page.request.get(`/api/v1/teacher/courses/${search[0].id}/export`)).json()
  const suffix = Date.now().toString(36)
  const title = `Import démonstration ${suffix}`

  // A malformed file is refused with a precise path, nothing is created.
  const broken = structuredClone(exported)
  broken.modules[0].chapters[0].missions[0].objective_codes = ["INCONNU"]
  await page.getByLabel("Fichier de cours JSON").setInputFiles({ name: "casse.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(broken)) })
  await expect(page.getByRole("alert").filter({ hasText: "format attendu" })).toBeVisible()
  await expect(page.getByText("modules.0.chapters.0.missions.0.objective_codes")).toBeVisible()
  await page.screenshot({ path: `${shots}/01-import-refuse.png`, fullPage: true, animations: "disabled" })

  // The valid export: dry-run report, slug conflict, new title, import.
  await page.getByLabel("Fichier de cours JSON").setInputFiles({ name: "cours.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) })
  await expect(page.getByText("Fichier valide : « Démonstration — Données ShopFlow »")).toBeVisible()
  await expect(page.getByText(/existe déjà/)).toBeVisible()
  await page.getByLabel("Titre du nouveau cours").fill(title)
  await page.screenshot({ path: `${shots}/02-import-rapport.png`, fullPage: true, animations: "disabled" })
  await page.getByRole("button", { name: "Importer comme nouveau brouillon" }).click()
  await expect(page.getByRole("heading", { name: title })).toBeVisible()
  await expect(page.getByText("Cours importé comme nouveau brouillon")).toBeVisible()

  // Search finds it.
  await page.getByLabel("Rechercher un cours").fill(suffix)
  await expect(page.locator("aside").getByRole("button", { name: new RegExp(`${title} · Brouillon`) })).toBeVisible()

  // Validate, preview without answers, publish.
  await page.getByRole("tab", { name: "Aperçu" }).click()
  await page.getByRole("button", { name: "Charger l’aperçu" }).click()
  await expect(page.getByText(/Nadia, analyste chez ShopFlow/)).toBeVisible()
  await page.getByRole("tab", { name: "Publication" }).click()
  await page.getByRole("button", { name: "Vérifier le brouillon" }).click()
  await expect(page.getByRole("status").first()).toContainText("Brouillon valide")
  await page.getByRole("button", { name: "Publier une version" }).click()
  await expect(page.getByText(/Version 1 · publiée/).first()).toBeVisible()

  // Restore the draft from version 1, with a saved backup in the history.
  await page.getByRole("button", { name: "Restaurer le brouillon depuis la version 1" }).click()
  await expect(page.getByText(/L’ancien brouillon est sauvegardé/)).toBeVisible()
  await expect(page.getByRole("link", { name: "sauvegarde du brouillon précédent" }).first()).toBeVisible()
  await expect(page.getByText("Cours importé", { exact: true })).toBeVisible()
  await page.screenshot({ path: `${shots}/03-versions-historique.png`, fullPage: true, animations: "disabled" })
  const release = await page.request.get(`/api/v1/teacher/course-search?q=${suffix}`)
  expect((await release.json() as { status: string }[])[0].status).toBe("published")
})
