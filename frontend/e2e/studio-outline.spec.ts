import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/**
 * Sprint 2, part G2 (ADR-0022) on the test stack: studio outline (counters, collapsible blocks,
 * filters, objectives by category), preview navigation by block, icons, and the student's block
 * objective without any objective code. Needs the Markdown demonstration course imported
 * (CI step `scripts/course_md.py import docs/examples/demo-course --test-stack --publish`).
 */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = () => JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR ?? "test-results/sprint2-g2"
const TITLE = "Démonstration — cours écrit en Markdown"

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

async function openMarkdownCourse(page: Page) {
  await login(page, "demo.enseignant")
  const found = await (await page.request.get("/api/v1/teacher/course-search?q=demo-cours-markdown")).json() as { id: number }[]
  test.skip(found.length === 0, "course not imported")
  await page.getByRole("button", { name: /Options avancées : autres cours/ }).click()
  await page.getByLabel("Rechercher un cours").fill("Markdown")
  await page.locator("aside").getByRole("button", { name: new RegExp(TITLE) }).first().click()
  await expect(page.getByRole("heading", { level: 3, name: TITLE })).toBeVisible()
}

test("icons and theme colours are served", async ({ page }) => {
  for (const [path, type] of [["/icons/favicon.svg", "image/svg+xml"], ["/icons/icon-192.png", "image/png"], ["/icons/icon-512.png", "image/png"],
    ["/icons/apple-touch-icon.png", "image/png"], ["/icons/icon-maskable-512.png", "image/png"], ["/icons/favicon-16.png", "image/png"],
    ["/icons/icon-32.png", "image/png"], ["/icons/logo-light.png", "image/png"], ["/icons/logo-dark.png", "image/png"],
    ["/icons/share-1200x630.png", "image/png"]]) {
    const response = await page.request.get(path)
    expect(response.status(), path).toBe(200)
    expect(response.headers()["content-type"]).toContain(type)
  }
  await page.goto("/")
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute("href", "/icons/favicon.svg")
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2)
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/icons\/share-1200x630\.png$/)
  // The login card shows the full logo next to the name written in text.
  await expect(page.getByText("ShopFlow Academy").first()).toBeVisible()
})

for (const theme of ["light", "dark"] as const) {
  test(`studio outline and objectives in the ${theme} theme (1366x768)`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
    await openMarkdownCourse(page)
    const outline = page.getByLabel("Plan du cours")
    await expect(outline.getByLabel("Compteurs du cours")).toContainText("Blocs2")
    await expect(outline.getByLabel("Compteurs du cours")).toContainText("Leçons7")
    await expect(outline.getByRole("button", { name: /^1\s*Le grain des tables/ })).toHaveAttribute("aria-expanded", "true")
    await expect(outline.getByRole("button", { name: /^2\s*Qualité et ingestion/ })).toHaveAttribute("aria-expanded", "false")
    const row = outline.getByRole("button", { name: "La jointure pas à pas", exact: true }).locator("xpath=ancestor::li")
    await expect(row).toContainText("Leçon")
    await expect(row).toContainText("Valide")
    // Objectives by category: SQL first, block objectives folded at the end.
    await expect(page.getByRole("button", { name: /^SQL/ })).toHaveAttribute("aria-expanded", "true")
    await expect(page.getByRole("button", { name: /^Objectifs de bloc/ })).toHaveAttribute("aria-expanded", "false")
    expect(await serious(page)).toEqual([])
    await page.screenshot({ path: `${shots}/20-studio-plan-${theme === "light" ? "clair" : "sombre"}.png`, fullPage: true, animations: "disabled" })
    // Filter by objective, then by type.
    await page.getByRole("button", { name: /qui couvrent DEMO-PIPELINE/ }).click()
    await expect(page.getByText("Éléments qui couvrent")).toBeVisible()
    await expect(outline.getByText(/3 éléments affichés/)).toBeVisible()
    await page.getByRole("button", { name: "Retirer le filtre" }).click()
    await outline.getByLabel("Filtrer par type").selectOption("bonus")
    await expect(outline.getByRole("button", { name: "Défi bonus, le top des villes", exact: true })).toBeVisible()
    await expect(outline.getByText(/1 élément affiché/)).toBeVisible()
  })
}

for (const theme of ["light", "dark"] as const) test(`preview in the ${theme} theme: outline and navigation by block`, async ({ page }) => {
  await page.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
  await openMarkdownCourse(page)
  await page.getByRole("tab", { name: "Aperçu" }).click()
  await page.getByRole("button", { name: "Charger l’aperçu" }).click()
  const nav = page.getByRole("navigation", { name: "Navigation par bloc" })
  await expect(nav).toContainText("Bloc 1 sur 2 : Le grain des tables")
  await expect(nav.getByRole("button", { name: "Bloc précédent" })).toBeDisabled()
  await nav.getByRole("button", { name: "Bloc suivant" }).click()
  await expect(nav).toContainText("Bloc 2 sur 2 : Qualité et ingestion")
  await expect(page.getByLabel("Aperçu de Carte des règles de qualité")).toBeVisible()
  await expect(nav.getByRole("button", { name: "Bloc suivant" })).toBeDisabled()
  expect(await serious(page)).toEqual([])
  await page.screenshot({ path: `${shots}/21-apercu-par-bloc-${theme === "light" ? "clair" : "sombre"}.png`, fullPage: true, animations: "disabled" })
})

for (const theme of ["light", "dark"] as const) {
  test(`390x844 in the ${theme} theme: block objective without code, lesson, studio outline`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })
    await context.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
    const page = await context.newPage()
    const suffix = theme === "light" ? "clair" : "sombre"
    const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    await login(page, "demo.etudiant10")
    const dashboard = await (await page.request.get("/api/v1/student/dashboard")).json() as { courses: { title: string; missions: { mission_version_id: number; title: string }[] }[] }
    const course = dashboard.courses.find((item) => item.title === TITLE)
    test.skip(!course, "course not given to demo.etudiant10 (markdown-course.spec.ts runs first)")
    const region = page.getByRole("region", { name: TITLE })
    await expect(region.getByText(/Objectif : Expliquer pourquoi un total change après une jointure/)).toBeVisible()
    await expect(page.locator("main")).not.toContainText(/BLOC-GRAIN|DEMO-GRAIN/)
    expect(await noHorizontalScroll()).toBe(true)
    await page.screenshot({ path: `${shots}/30-mobile-tableau-de-bord-${suffix}.png`, fullPage: true, animations: "disabled" })
    const lesson = course!.missions.find((item) => item.title === "La jointure pas à pas")!
    await page.goto(`/#/mission/${lesson.mission_version_id}`)
    await expect(page.getByRole("heading", { level: 1, name: "La jointure pas à pas" })).toBeVisible()
    await expect(page.getByText(/^Objectif :/)).toBeVisible()
    await expect(page.getByRole("region", { name: "Exemple résolu" })).toBeVisible()
    expect(await noHorizontalScroll()).toBe(true)
    expect(await serious(page)).toEqual([])
    await page.screenshot({ path: `${shots}/31-mobile-lecon-structuree-${suffix}.png`, fullPage: true, animations: "disabled" })
    await page.getByRole("button", { name: "Se déconnecter" }).click()
    await expect(page.getByRole("textbox", { name: "Identifiant" })).toBeVisible()
    await openMarkdownCourse(page)
    await expect(page.getByLabel("Plan du cours").getByLabel("Compteurs du cours")).toBeVisible()
    expect(await noHorizontalScroll()).toBe(true)
    expect(await serious(page)).toEqual([])
    await page.screenshot({ path: `${shots}/32-mobile-studio-plan-${suffix}.png`, fullPage: true, animations: "disabled" })
    await context.close()
  })
}
