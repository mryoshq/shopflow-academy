import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/**
 * Sprint 2, part D: the demonstration course written in Markdown (docs/examples/demo-course),
 * imported on the test stack with `scripts/course_md.py import … --test-stack --publish`
 * (CI step), is played by a student: lesson, line chart, code, comparison, runs, SQL challenge.
 */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => accounts.find((item) => item.username === name)!
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR ?? "test-results/sprint2-d"
const TITLE = "Démonstration — cours écrit en Markdown"

async function login(page: Page, name: string) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await page.getByLabel("Mot de passe").fill(account(name).password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${name}` })).toBeVisible()
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => `${item.id} ${item.nodes.map((n) => n.target.join(" ")).join(" | ")}`)
}

test("a student plays the Markdown demonstration course", async ({ page, browser }) => {
  await login(page, "demo.enseignant")
  const token = (await page.context().cookies()).find((item) => item.name.endsWith("academy_csrf"))?.value ?? ""
  const headers = { "X-CSRF-Token": token }
  const found = await (await page.request.get("/api/v1/teacher/course-search?q=demo-cours-markdown")).json() as { id: number }[]
  test.skip(found.length === 0, "course not imported (run scripts/course_md.py import docs/examples/demo-course --test-stack --publish)")
  const releases = await (await page.request.get(`/api/v1/teacher/courses/${found[0].id}/releases`)).json() as { id: number; status: string }[]
  const release = releases.find((item) => item.status === "published")!
  // Give it to a class of one fictional student and open both blocks (idempotent across runs).
  const label = "Cohorte Markdown (comptes fictifs)"
  const cohorts = await (await page.request.get("/api/v1/teacher/cohorts")).json() as { id: number; label: string }[]
  let cohort = cohorts.find((item) => item.label === label)?.id
  if (!cohort) cohort = (await (await page.request.post("/api/v1/teacher/cohorts", { headers, data: { label } })).json() as { id: number }).id
  const students = await (await page.request.get("/api/v1/teacher/students")).json() as { id: number; username: string }[]
  await page.request.post(`/api/v1/teacher/cohorts/${cohort}/enrollments`, { headers, data: { user_id: students.find((s) => s.username === "demo.etudiant10")!.id } })
  await page.request.post(`/api/v1/teacher/cohorts/${cohort}/assignments`, { headers, data: { course_release_id: release.id } })
  const klass = (await (await page.request.get("/api/v1/teacher/classes")).json() as { id: number; cohort: string }[]).find((item) => item.cohort === label)!
  for (let index = 0; index < 2; index += 1) await page.request.post(`/api/v1/teacher/classes/${klass.id}/blocks/open-next`, { headers })

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const student = await context.newPage()
  await login(student, "demo.etudiant10")
  const course = student.getByRole("region", { name: TITLE })
  await expect(course.getByText(/Une journée courte pour découvrir chaque type/)).toBeVisible()
  await course.getByRole("button", { name: "Ouvrir : Qu'est-ce que le grain d'une table ?" }).click()
  await expect(student.getByText("Le grain d'une table, c'est ce que représente une ligne.")).toBeVisible()
  await expect(student.getByLabel(/La jointure qui change le grain \(SQL/)).toContainText("JOIN order_items")
  const understood = student.getByRole("button", { name: "J’ai compris" })
  if (await understood.isVisible()) await understood.click()
  await expect(student.getByText("Leçon comprise")).toBeVisible()
  expect(await serious(student)).toEqual([])
  await student.screenshot({ path: `${shots}/01-lecon.png`, fullPage: true, animations: "disabled" })

  // Coded animation (ADR-0018): step by step, arrows drawn between rows, text alternative.
  await student.getByRole("button", { name: "Mission suivante" }).first().click()
  await expect(student.getByRole("heading", { level: 1, name: "La jointure pas à pas" })).toBeVisible()
  await expect(student.getByText("Deux commandes, une ligne chacune. Les frais attendus font 30 + 40 = 70 DH.")).toBeVisible()
  await student.getByRole("button", { name: "Étape suivante" }).click()
  await expect(student.getByText("Chaque article pointe vers sa commande. C-101 a deux articles.")).toBeVisible()
  await expect(student.locator("figure svg path[marker-end]")).toHaveCount(3)
  await student.getByRole("button", { name: "Étape suivante" }).click()
  await expect(student.getByText("100 DH", { exact: true })).toBeVisible()
  await student.getByRole("button", { name: "Description textuelle de toutes les étapes" }).click()
  await expect(student.getByText(/Erreur : Les frais de C-101 sont comptés deux fois/)).toBeVisible()
  expect(await serious(student)).toEqual([])
  await student.screenshot({ path: `${shots}/05-animation.png`, fullPage: true, animations: "disabled" })
  const understood2 = student.getByRole("button", { name: "J’ai compris" })
  if (await understood2.isVisible()) await understood2.click()
  await student.getByRole("button", { name: "Mission suivante" }).first().click()
  await expect(student.getByRole("heading", { level: 1, name: "Pourquoi 70 DH deviennent 100 DH ?" })).toBeVisible()
  await expect(student.getByLabel(/Exécuter la requête actuelle \(SQL/)).toBeVisible()
  await student.screenshot({ path: `${shots}/02-mission-run.png`, fullPage: true, animations: "disabled" })

  const dashboard = await (await student.request.get("/api/v1/student/dashboard")).json() as { courses: { title: string; missions: { title: string; mission_version_id: number }[] }[] }
  const byTitle = Object.fromEntries(dashboard.courses.find((item) => item.title === TITLE)!.missions.map((m) => [m.title, m.mission_version_id]))
  await student.goto(`/#/mission/${byTitle["Lire l'évolution des rejets"]}`)
  await expect(student.getByText("Lignes rejetées par nuit")).toBeVisible()
  await expect(student.getByText(/donnée absente/).first()).toBeAttached()
  expect(await serious(student)).toEqual([])
  await student.screenshot({ path: `${shots}/03-courbe.png`, fullPage: true, animations: "disabled" })
  // Mind map: keyboard tree, folding.
  await student.goto(`/#/mission/${byTitle["Carte des règles de qualité"]}`)
  const tree = student.getByRole("tree", { name: "Qualité d'un fichier importé" })
  await tree.getByRole("treeitem", { name: /Qualité des données/ }).focus()
  await student.keyboard.press("ArrowDown")
  await expect(tree.getByRole("treeitem", { name: /^Types/ })).toBeFocused()
  await student.keyboard.press("ArrowRight")
  await expect(tree.getByRole("treeitem", { name: "Montants numériques" })).toBeVisible()
  expect(await serious(student)).toEqual([])
  await student.screenshot({ path: `${shots}/06-carte-mentale.png`, fullPage: true, animations: "disabled" })
  // Animated pipeline, with reduced motion respected.
  await student.emulateMedia({ reducedMotion: "reduce" })
  await student.goto(`/#/mission/${byTitle["Les règles de qualité utiles"]}`)
  await expect(student.getByText("1 000 lignes en entrée.", { exact: true })).toBeVisible()
  for (let index = 0; index < 3; index += 1) await student.getByRole("button", { name: "Étape suivante" }).click()
  await expect(student.getByText("983 lignes", { exact: true })).toBeVisible()
  const flowToken = student.locator("figure [aria-hidden=true][style*='left']").first()
  expect(Number.parseFloat(await flowToken.evaluate((element) => getComputedStyle(element).transitionDuration))).toBeLessThan(0.01)
  expect(await serious(student)).toEqual([])
  await student.screenshot({ path: `${shots}/07-pipeline.png`, fullPage: true, animations: "disabled" })
  await student.emulateMedia({ reducedMotion: "no-preference" })
  // Course video with captions, served by the gateway.
  await student.goto(`/#/mission/${byTitle["Vidéo facultative, le pipeline en quatre secondes"]}`)
  const video = student.locator("video")
  await expect(video).toBeVisible()
  const src = await video.getAttribute("src")
  expect(src).toMatch(/^\/media\/[0-9a-f]{16}\.mp4$/)
  const file = await student.request.get(src!)
  expect(file.status()).toBe(200)
  expect(file.headers()["content-type"]).toBe("video/mp4")
  const captions = await student.request.get(await student.locator("video track").getAttribute("src") ?? "")
  expect(captions.headers()["content-type"]).toContain("text/vtt")
  expect((await student.request.get("/media/0000.mp4")).status()).toBe(404)
  await student.goto(`/#/mission/${byTitle["Deux scripts, un seul bon"]}`)
  await expect(student.getByRole("group", { name: "Comparaison côte à côte" })).toBeVisible()
  expect(await serious(student)).toEqual([])
  await student.screenshot({ path: `${shots}/04-comparaison.png`, fullPage: true, animations: "disabled" })
  await student.goto(`/#/mission/${byTitle["Défi bonus, le top des villes"]}`)
  await expect(student.getByLabel(/Requête de départ/)).toContainText("GROUP BY c.city")
  const text = await (await student.request.get(`/api/v1/student/missions/${byTitle["Défi bonus, le top des villes"]}`)).text()
  expect(text).not.toContain("ORDER BY c.city")
  await context.close()
})
