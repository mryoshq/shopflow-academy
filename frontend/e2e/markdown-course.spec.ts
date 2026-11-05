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

  const context = await browser.newContext({ locale: "fr-FR", viewport: { width: 1366, height: 768 } })
  const student = await context.newPage()
  await login(student, "demo.etudiant10")
  await student.getByRole("tab", { name: "Cours" }).click()  // ADR-0051: the course is in the Cours tab
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
  await expect(student.locator("figure").getByText("100 DH", { exact: true })).toBeVisible()
  await student.getByRole("button", { name: "Description textuelle de toutes les étapes" }).click()
  await expect(student.getByText(/Erreur : Les frais de C-101 sont comptés deux fois/)).toBeVisible()
  expect(await serious(student)).toEqual([])
  await student.screenshot({ path: `${shots}/05-animation.png`, fullPage: true, animations: "disabled" })
  const understood2 = student.getByRole("button", { name: "J’ai compris" })
  if (await understood2.isVisible()) await understood2.click()
  await student.getByRole("button", { name: "Mission suivante" }).first().click()
  await expect(student.getByRole("heading", { level: 1, name: "Pourquoi 70 DH deviennent 100 DH ?" })).toBeVisible()
  await expect(student.getByLabel(/Exécuter la requête actuelle \(SQL/)).toBeVisible()
  // Preconfigured SQL runs on the lab database (ADR-0017): the real result, 100 DH then 70 DH.
  await student.getByRole("button", { name: "Exécuter : Exécuter la requête actuelle" }).click()
  const firstRun = student.getByRole("region", { name: "Code à exécuter" })
  await expect(firstRun.getByRole("cell", { name: "100" })).toBeVisible()
  await student.getByRole("button", { name: "Exécuter : Exécuter la version au grain commande" }).click()
  await expect(firstRun.getByRole("cell", { name: "70" })).toBeVisible()
  expect(await serious(student)).toEqual([])
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
  // Python snippet executed once at import in a disposable container: its real output.
  await student.getByRole("button", { name: "Exécuter : Exécuter l'aperçu pandas du fichier" }).click()
  await expect(student.getByLabel("Sortie de Exécuter l'aperçu pandas du fichier")).toContainText("Doublons sur id : 1")
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
  const editor = student.getByLabel("Votre requête")
  await expect(editor).toHaveValue(/GROUP BY c\.city/)
  await editor.fill("WITH x AS (DELETE FROM orders RETURNING *) SELECT * FROM x")
  await student.getByRole("button", { name: "Exécuter et vérifier" }).click()
  await expect(student.getByText(/refusée : la requête doit seulement lire des données/)).toBeVisible()
  await student.getByRole("button", { name: "Revenir à la requête de départ" }).click()
  await student.getByRole("button", { name: "Exécuter et vérifier" }).click()
  await expect(student.getByText("Presque ! Le résultat diffère encore : réessayez.")).toBeVisible()
  await editor.fill("SELECT c.city, SUM(o.total) AS ca\nFROM orders o JOIN customers c ON c.customer_id = o.customer_id\nGROUP BY c.city\nORDER BY ca DESC")
  await editor.press("Control+Enter")
  await expect(student.getByText(/Bravo, c’est le résultat attendu/)).toBeVisible()
  expect(await serious(student)).toEqual([])
  await student.screenshot({ path: `${shots}/08-defi-sql.png`, fullPage: true, animations: "disabled" })
  const text = await (await student.request.get(`/api/v1/student/missions/${byTitle["Défi bonus, le top des villes"]}`)).text()
  expect(text).not.toContain("ORDER BY ca DESC")
  await context.close()
})

test("every mission of the Markdown course passes axe in the dark theme", async ({ browser }) => {
  const context = await browser.newContext({ locale: "fr-FR", viewport: { width: 1366, height: 768 }, colorScheme: "dark", reducedMotion: "reduce" })
  await context.addInitScript(() => window.localStorage.setItem("shopflow:theme", "dark"))
  const student = await context.newPage()
  await login(student, "demo.etudiant10")
  const dashboard = await (await student.request.get("/api/v1/student/dashboard")).json() as { courses: { title: string; missions: { mission_version_id: number; title: string; status: string }[] }[] }
  const course = dashboard.courses.find((item) => item.title === TITLE)
  test.skip(!course, "course not given to demo.etudiant10 (run the previous test first)")
  await expect(student.locator("html")).toHaveClass(/dark/)
  for (const mission of course!.missions.filter((item) => item.status !== "locked")) {
    await student.goto(`/#/mission/${mission.mission_version_id}`)
    await expect(student.getByRole("heading", { level: 1, name: mission.title })).toBeVisible()
    expect(await serious(student), mission.title).toEqual([])
  }
  await student.screenshot({ path: `${shots}/09-sombre-derniere-mission.png`, fullPage: true, animations: "disabled" })
  await context.close()
})

for (const theme of ["light", "dark"] as const) {
  test(`structured lesson (ADR-0022) in the ${theme} theme: reading order, media description for screen readers, axe`, async ({ browser }) => {
    const context = await browser.newContext({ locale: "fr-FR", viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" })
    await context.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
    const student = await context.newPage()
    await login(student, "demo.etudiant10")
    const dashboard = await (await student.request.get("/api/v1/student/dashboard")).json() as { courses: { title: string; missions: { mission_version_id: number; title: string }[] }[] }
    const course = dashboard.courses.find((item) => item.title === TITLE)
    test.skip(!course, "course not given to demo.etudiant10 (run the first test of this file first)")
    const lesson = course!.missions.find((item) => item.title === "La jointure pas à pas")!
    await student.goto(`/#/mission/${lesson.mission_version_id}`)
    await expect(student.getByRole("heading", { level: 1, name: "La jointure pas à pas" })).toBeVisible()
    await expect(student.locator("html")).toHaveClass(new RegExp(theme))

    await expect(student.getByText(/^Objectif :/)).toBeVisible()
    await expect(student.getByRole("definition").first()).toContainText("Ce que représente une ligne")
    await expect(student.getByRole("region", { name: "Exemple résolu" }).locator("ol li")).toHaveCount(3)
    await expect(student.getByRole("region", { name: "Exemple résolu" }).locator("code")).toHaveText("JOIN order_items")
    // Reading order: objective, hook, vocabulary, example, media, « À vous ».
    const text = await student.locator("main").innerText()
    const order = ["Objectif :", "La comptabilité attend", "Vocabulaire", "Exemple résolu", "Jointure orders et order_items", "À vous"].map((part) => text.indexOf(part))
    expect(order.every((position) => position >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)

    // The media description is never shown on screen; screen readers get it through aria-describedby.
    const media = student.getByRole("group", { name: "Média : Jointure orders et order_items : 70 DH deviennent 100 DH" })
    await expect(media).toHaveAccessibleDescription(/Animation en quatre étapes/)
    const description = student.getByText(/Animation en quatre étapes/)
    expect(await description.evaluate((node) => { const box = node.closest("[id]")!.getBoundingClientRect(); return box.width * box.height })).toBeLessThanOrEqual(1)
    await expect(student.getByRole("button", { name: "Description du média" })).toHaveCount(0)
    expect(await serious(student)).toEqual([])
    await student.screenshot({ path: `${shots}/10-lecon-structuree-${theme === "light" ? "clair" : "sombre"}.png`, fullPage: true, animations: "disabled" })
    await context.close()
  })
}

test("minimum reading time (ADR-0027): « J'ai compris » waits, then validates", async ({ page, browser }) => {
  await login(page, "demo.enseignant")
  const token = (await page.context().cookies()).find((item) => item.name.endsWith("academy_csrf"))?.value ?? ""
  const headers = { "X-CSRF-Token": token }
  const found = await (await page.request.get("/api/v1/teacher/course-search?q=demo-cours-markdown")).json() as { id: number }[]
  test.skip(found.length === 0, "course not imported")
  const courseId = found[0].id
  const rulesUrl = `/api/v1/teacher/courses/${courseId}/attempt-rules`
  const strip = (rules: Record<string, unknown>) => Object.fromEntries(Object.entries(rules).filter(([key]) => !["defaults", "decay_since", "pause_since", "announced_since"].includes(key)))
  const current = await (await page.request.get(rulesUrl)).json() as Record<string, unknown>
  expect((await page.request.put(rulesUrl, { headers, data: { ...strip(current), reading_enabled: true, reading_min: 10, reading_max: 15 } })).status()).toBe(200)
  // A second fictional student joins the Markdown class (idempotent across runs).
  const label = "Cohorte Markdown (comptes fictifs)"
  const cohort = (await (await page.request.get("/api/v1/teacher/cohorts")).json() as { id: number; label: string }[]).find((item) => item.label === label)!
  const students = await (await page.request.get("/api/v1/teacher/students")).json() as { id: number; username: string }[]
  await page.request.post(`/api/v1/teacher/cohorts/${cohort.id}/enrollments`, { headers, data: { user_id: students.find((s) => s.username === "demo.etudiant09")!.id } })
  try {
    const context = await browser.newContext({ locale: "fr-FR", viewport: { width: 1366, height: 768 } })
    const student = await context.newPage()
    await login(student, "demo.etudiant09")
    const dashboard = await (await student.request.get("/api/v1/student/dashboard")).json() as { courses: { title: string; missions: { mission_version_id: number; title: string; status: string }[] }[] }
    const lesson = dashboard.courses.find((item) => item.title === TITLE)!.missions.find((item) => item.title === "Qu'est-ce que le grain d'une table ?")!
    test.skip(lesson.status === "completed", "lesson already understood in an earlier run")
    await student.goto(`/#/mission/${lesson.mission_version_id}`)
    const understood = student.getByRole("button", { name: "J’ai compris" })
    await expect(understood).toBeDisabled()
    await expect(student.getByRole("progressbar", { name: "Temps de lecture" })).toBeVisible()
    expect(await serious(student)).toEqual([])
    await student.screenshot({ path: `${shots}/12-lecture-minimale.png`, fullPage: true, animations: "disabled" })
    // The server refuses a validation that comes too soon.
    const studentToken = (await context.cookies()).find((item) => item.name.endsWith("academy_csrf"))?.value ?? ""
    expect((await student.request.post(`/api/v1/student/missions/${lesson.mission_version_id}/understood`, { headers: { "X-CSRF-Token": studentToken } })).status()).toBe(429)
    await expect(understood).toBeEnabled({ timeout: 20_000 })
    await understood.click()
    await expect(student.getByText("Leçon comprise")).toBeVisible()
    await context.close()
  } finally {
    const latest = await (await page.request.get(rulesUrl)).json() as Record<string, unknown>
    await page.request.put(rulesUrl, { headers, data: { ...strip(latest), reading_enabled: false } })
  }
})
