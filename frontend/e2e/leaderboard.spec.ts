import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

// Entirely synthetic browser fixtures; authorization/score invariants use real API
// and migrated DB in test_leaderboard.py. This spec never contacts a live API.
test("K: teacher settings, automatic names, tied ranks, refresh, daily tab, AA and reduced motion", async ({ page }, testInfo) => {
  let role: "teacher" | "student" = "teacher"
  let enabled = false
  let core = 15
  let displayName = "Atlas"
  let topThree = false
  let hideOpen = false
  let hidden = false
  const unexpected: string[] = []
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname
    let body: unknown
    let status = 200
    if (path.endsWith("/auth/me")) body = { id: 1, username: "fixture-account", role }
    else if (path.endsWith("/leaderboard/classes")) body = role === "teacher" || enabled ? [
      { assignment_id: 4, label: "Classe fictive K" },
      { assignment_id: 5, label: "Cohorte de démonstration avec un intitulé volontairement très long pour le petit écran" },
    ] : []
    else if (path.endsWith("/leaderboard/settings")) {
      const value = route.request().postDataJSON()
      enabled = value.enabled; topThree = value.top_three; hideOpen = value.hide_open_block
      body = value
    } else if (path.endsWith("/leaderboard/name")) { displayName = route.request().postDataJSON().display_name; body = { display_name: displayName } }
    else if (path.endsWith("/classes/4/leaderboard")) {
      if (role === "student" && !enabled) { status = 404; body = { detail: "Classement indisponible." } }
      else {
        const rows = [{ rank: 1, display_name: displayName, is_self: role === "student", core_points: core, bonus_points: 2, completed_blocks: 2, today_blocks: 1 },
          { rank: 1, display_name: "Rif", is_self: false, core_points: core, bonus_points: 2, completed_blocks: 2, today_blocks: 1 }]
        body = { settings: { enabled, top_three: topThree, hide_open_block: hideOpen }, hidden: !enabled || hidden, display_name: displayName,
          day: "2026-10-28", timezone: "Africa/Casablanca", rows: !enabled || hidden ? [] : rows,
          daily_rows: !enabled || hidden ? [] : rows.map(({ rank, display_name, is_self, today_blocks }) => ({ rank, display_name, is_self, today_blocks })) }
      }
    } else if (path.endsWith("/notifications")) body = { unread: 0, items: [] } // ADR-0023: polled on every page
    else if (path.endsWith("/presence")) body = { interval_seconds: 30, unread: 0 } // ADR-0023: student heartbeat
    else { unexpected.push(path); status = 500; body = { detail: "Unexpected fixture request" } }
    await route.fulfill({ status, json: body })
  })
  await page.goto("/#/classement/4")
  await expect(page.getByRole("heading", { name: "Classement", exact: true })).toBeVisible()
  const podium = await page.locator(".leaderboard-podium svg").boundingBox()
  expect(podium?.width).toBeGreaterThan(60)
  expect(podium?.height).toBeGreaterThan(25)
  const enable = page.getByRole("checkbox", { name: "Activer le classement", exact: true })
  await expect(enable).not.toBeChecked()
  await page.getByText("Activer le classement", { exact: true }).click()
  await expect(page.getByRole("table", { name: "Classement de la classe" })).toBeVisible()
  await page.getByText("Afficher le top 3 et sa propre position", { exact: true }).click()
  await expect(page.getByRole("checkbox", { name: "Afficher le top 3 et sa propre position" })).toBeChecked()
  await page.getByText("Masquer pendant un bloc ouvert", { exact: true }).click()
  await expect(page.getByRole("checkbox", { name: "Masquer pendant un bloc ouvert" })).toBeChecked()
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([])
  await page.screenshot({ path: testInfo.outputPath("classement-enseignant.png"), fullPage: true, animations: "disabled" })

  role = "student"
  await page.reload()
  const table = page.getByRole("table", { name: "Classement de la classe" })
  await expect(table.getByText("Rang 1", { exact: true })).toHaveCount(2)
  await expect(table.getByText("· Vous")).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Votre nom affiché" })).toHaveCount(0)
  core = 18
  const start = Date.now()
  await expect(table.getByRole("cell", { name: "18", exact: true })).toHaveCount(2, { timeout: 10_000 })
  expect(Date.now() - start).toBeLessThanOrEqual(10_000)

  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(value => { document.documentElement.classList.toggle("dark", value === "dark") }, theme)
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme })
    await page.setViewportSize({ width: theme === "light" ? 1366 : 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect(page.locator(".leaderboard-podium")).toHaveCSS("animation-name", "none")
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`classement-${theme}.png`), fullPage: true, animations: "disabled" })
    await page.getByRole("tab", { name: "Classement général" }).focus()
    await page.keyboard.press("ArrowRight")
    await expect(page.getByRole("tab", { name: "Progression du jour" })).toBeFocused()
    await expect(page.getByRole("table", { name: "Blocs terminés aujourd’hui" })).toBeVisible()
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([])
    await page.getByRole("tab", { name: "Classement général" }).click()
  }
  hidden = true
  await expect(page.getByText(/classement est masqué pendant un bloc ouvert/)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole("table")).toHaveCount(0)
  enabled = false
  await expect(page.getByRole("alert")).toContainText("n’est pas disponible", { timeout: 10_000 })
  await expect(page.getByText("Rif", { exact: true })).toHaveCount(0)
  expect(unexpected).toEqual([])
  expect(errors).toEqual([])
})
