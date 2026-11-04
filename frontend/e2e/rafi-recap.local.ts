import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

const notice = (id: number, kind: string, text: string) => ({ id, kind, sender: null, text, data: { link: "#/mission/42" }, read_at: null, created_at: "2026-11-04T16:30:00Z" })
const recap = notice(1, "session_recap", "Il vous reste 2 missions dans les blocs ouverts.")
const next = { kind: "mission", title: "Mission fictive", link: "#/mission/42", started: false }
async function student(page: Page, theme: string, width: number, data: { silent: boolean; items: ReturnType<typeof notice>[] }) {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript((theme) => { localStorage.setItem("shopflow:theme", theme); localStorage.setItem("shopflow:lang", "fr") }, theme)
  await page.route("**/api/v1/**", (route) => {
    const url = new URL(route.request().url())
    let json: unknown = {}
    if (url.pathname.endsWith("/auth/me")) json = { id: 42, username: "eleve.fictif", role: "student" }
    if (url.pathname.endsWith("/student/dashboard")) json = { display_name: "Élève fictif", ai_enabled: false, courses: [] }
    if (url.pathname.endsWith("/student/rafi")) json = { sounds: false, scope: "42", silent: data.silent, next }
    if (url.pathname.endsWith("/notifications")) json = { unread: data.items.length, items: data.items.filter((n) => n.id > Number(url.searchParams.get("after"))).toReversed() }
    if (url.pathname.endsWith("/presence")) json = { unread: data.items.length, interval_seconds: 30 }
    if (url.pathname.endsWith("/radio")) json = { streams: [] }
    return route.fulfill({ json })
  })
  await page.goto("/")
}

async function accessible(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations === Infinity))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([])
}

for (const theme of ["light", "dark"]) for (const width of [1366, 390]) {
  test(`silence preserves manual help and the recap in ${theme} at ${width}px`, async ({ page }, info) => {
    await student(page, theme, width, { silent: true, items: [recap] })
    const avatar = page.getByRole("button", { name: "Rafi : 1 annonce" })
    await expect(avatar).toBeVisible()
    await expect(page.getByTestId("rafi-bubble")).toHaveCount(0)
    const manual = page.getByRole("button", { name: "Que faire maintenant ?" })
    await manual.focus()
    await manual.press("Enter")
    const help = page.getByTestId("rafi-next")
    await expect(help.getByRole("link", { name: "Y aller" })).toHaveAttribute("href", "#/mission/42")
    await expect(help).toContainText("Mission fictive")
    await accessible(page)
    await page.screenshot({ path: info.outputPath("rafi-apres-aide.png"), fullPage: true })
    await avatar.click()
    const bubble = page.getByTestId("rafi-bubble")
    await expect(bubble).toContainText(recap.text)
    await expect(bubble.getByRole("link", { name: "Y aller" })).toHaveAttribute("href", "#/mission/42")
    await accessible(page)
    await page.screenshot({ path: info.outputPath("rafi-apres-recap.png"), fullPage: true })
  })
}

test("automatic recaps, milestones and congratulations share a ten-minute cooldown across reloads and tabs", async ({ page, context }) => {
  const start = Date.parse("2026-11-04T16:30:00Z")
  const data = { silent: false, items: [recap] }
  await page.clock.setFixedTime(new Date(start))
  await student(page, "light", 1366, data)
  await expect(page.getByTestId("rafi-bubble")).toContainText(recap.text)
  const tab = await context.newPage()
  await tab.clock.setFixedTime(new Date(start + 60_000))
  data.items.push(notice(2, "project_reminder", "Rappel fictif"))
  await student(tab, "light", 1366, data)
  await expect(tab.getByRole("button", { name: "Rafi : 2 annonces" })).toBeVisible()
  await expect(tab.getByTestId("rafi-bubble")).toHaveCount(0)
  await tab.reload()
  await expect(tab.getByRole("button", { name: "Rafi : 2 annonces" })).toBeVisible()
  await expect(tab.getByTestId("rafi-bubble")).toHaveCount(0)
  data.items.push(notice(3, "block_congratulation", "Bravo, vous avez terminé le bloc « Atelier fictif »."))
  await tab.clock.setFixedTime(new Date(start + 10 * 60_000))
  await tab.reload()
  await expect(tab.getByTestId("rafi-bubble")).toContainText("Bravo")
})

for (const width of [1366, 390]) test(`teacher switches and recap time at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 })
  let settings = { sounds: true, silent: false, recap_at: null as string | null }
  const changes: unknown[] = []
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { id: 3, username: "prof.fictif", role: "teacher" } })
    if (path.endsWith("/teacher/main/setup")) return route.fulfill({ json: {
      course: { id: 4, title: "Cours fictif", slug: "cours-fictif", status: "published" }, cohort: { id: 5, label: "Classe fictive", student_count: 2 },
      assignment_id: 7, latest_version: 1, assigned_version: 1,
    } })
    if (path.endsWith("/rafi")) {
      if (route.request().method() === "PUT") {
        const change = route.request().postDataJSON()
        changes.push(change)
        settings = { ...settings, ...change }
      }
      return route.fulfill({ json: settings })
    }
    if (path.endsWith("/notifications")) return route.fulfill({ json: { unread: 0, items: [] } })
    if (path.endsWith("/live")) return route.fulfill({ json: { online_count: 0, student_count: 2, blocks: [], students: [] } })
    if (path.endsWith("/notification-settings")) return route.fulfill({ json: { help: true, blocked: true, block_done: true, block_done_percent: 80, auto_soon: true, auto_done: true, disconnect: true, student_block_open: true, student_help_handled: true } })
    return route.fulfill({ json: {} })
  })
  await page.goto("/#/reglages/notifications")
  const silent = page.getByRole("checkbox", { name: "Mode silencieux pour la classe" })
  await expect(silent).toBeVisible()
  await silent.focus()
  await silent.press("Space")
  await expect(silent).toBeChecked()
  await expect(page.getByRole("checkbox", { name: "Sons de Rafi pour toute la classe" })).toBeChecked()
  await page.getByLabel("Heure du récapitulatif (heure du Maroc)").fill("17:30")
  await page.getByRole("button", { name: "Enregistrer l’heure" }).click()
  await expect(page.getByText("Réglages de Rafi enregistrés.")).toBeVisible()
  await expect(silent).toBeEnabled()
  await expect.poll(() => changes).toEqual([{ silent: true }, { recap_at: "17:30" }])
  await accessible(page)
  await page.screenshot({ path: info.outputPath("rafi-reglages.png"), fullPage: true })
})
