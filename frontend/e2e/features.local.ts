import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
for (const palette of ["classic", "catppuccin"]) for (const theme of ["light", "dark"]) for (const width of [390, 1366]) {
  test(`palette ${palette}, mode ${theme}, ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(({ palette, theme }) => { if (!localStorage.getItem("shopflow:palette")) localStorage.setItem("shopflow:palette", palette); if (!localStorage.getItem("shopflow:theme")) localStorage.setItem("shopflow:theme", theme) }, { palette, theme })
    await page.route("**/api/**", (route) => route.fulfill({ status: 404, json: {} }))
    await page.goto("/e2e/fixtures/features.html")
    await expect(page.locator("html")).toHaveAttribute("data-palette", palette)
    await expect(page.locator("html")).toHaveClass(new RegExp(theme))
    await expect(page.getByRole("heading", { name: "Fonctions locales fictives" })).toBeVisible()
    const canvas = await page.locator("main").evaluate((node) => getComputedStyle(node).backgroundColor)
    if (palette === "catppuccin") expect(canvas).toBe(theme === "dark" ? "rgb(30, 30, 46)" : "rgb(239, 241, 245)")
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([])
    await page.getByRole("button", { name: "Ouvrir les paramètres" }).click()
    await expect(page.getByRole("combobox", { name: "Palette de couleurs" })).toHaveValue(palette)
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/palette-${palette}-${theme}-${width}.png`, fullPage: true })
    await page.getByRole("combobox", { name: "Palette de couleurs" }).selectOption(palette === "classic" ? "catppuccin" : "classic")
    await expect(page.locator("html")).toHaveClass(new RegExp(theme))
    await page.getByRole("button", { name: "Fermer les paramètres" }).press("Escape")
    await expect(page.getByRole("dialog")).not.toBeVisible()
    await page.reload()
    await expect(page.locator("html")).toHaveAttribute("data-palette", palette === "classic" ? "catppuccin" : "classic")
  })
}
test("system mode and focusable native palette choice remain independent", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  await page.goto("/e2e/fixtures/features.html")
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.getByRole("button", { name: "Ouvrir les paramètres" }).click()
  const palette = page.getByRole("combobox", { name: "Palette de couleurs" })
  await palette.focus(); await expect(palette).toBeFocused(); await palette.selectOption("catppuccin")
  await expect(palette).toHaveValue("catppuccin")
  await expect(page.getByRole("radio", { name: /Système/ })).toBeChecked()
  await page.emulateMedia({ colorScheme: "light" })
  await expect(page.locator("html")).toHaveClass(/light/)
  await expect(page.locator("html")).toHaveAttribute("data-palette", "catppuccin")
})

for (const theme of ["light", "dark"]) {
  test(`normal motion reaches stable accessible dialog colours — ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" })
    await page.addInitScript((theme) => {
      localStorage.setItem("shopflow:palette", "catppuccin")
      localStorage.setItem("shopflow:theme", theme)
    }, theme)
    await page.route("**/api/**", (route) => route.fulfill({ status: 404, json: {} }))
    await page.goto("/e2e/fixtures/features.html")
    await page.getByRole("button", { name: "Ouvrir les paramètres" }).click()
    const dialog = page.getByRole("dialog")
    await expect(page.getByRole("combobox", { name: "Palette de couleurs" })).toHaveValue("catppuccin")
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) =>
      animation.playState === "running" && animation.effect?.getComputedTiming().iterations !== Infinity).length)).toBe(0)
    await expect(dialog).toHaveCSS("opacity", "1")
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([])
    await page.getByRole("button", { name: "Fermer les paramètres" }).press("Escape")
    await expect(dialog).not.toBeVisible()
  })
}
for (const theme of ["light", "dark"]) for (const width of [390, 1366]) {
  test(`student summary from protected detail — ${theme} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript((theme) => localStorage.setItem("shopflow:theme", theme), theme)
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith("/classes")) return route.fulfill({ json: [{ id: 4, cohort: "Classe fictive", course_title: "Cours fictif", version: 1, paused: false, student_count: 1 }] })
      if (path.endsWith("/interventions")) return route.fulfill({ json: [] })
      if (path.endsWith("/overview")) return route.fulfill({ json: { generated_at: new Date().toISOString(), assignment_id: 4, cohort: "Classe fictive", course_title: "Cours fictif", version: 1, paused: false, missions: [], students: [{ id: 9, display_name: "Alice Fictive", completed: 2, total: 5, core_points: 9.5, core_possible: 40, bonus_points: 3, attempts: 4, hints: 0, current_mission: null, last_activity: null, active: false, needs_help: [] }] } })
      if (path.endsWith("/students/9")) return route.fulfill({ json: { id: 9, display_name: "Alice Fictive", missions: [], attempts: [], summary: {
        core_points: 9.5, core_possible: 40, bonus_points: 3, bonus_possible: 4, completed: 2, total: 5, remaining: 3, lessons_read: 1, lessons_total: 1,
        attempted_unfinished: 1, not_started_open: 1, not_started_closed: 1, not_started_locked: 0, help_pending_count: 1,
        help_pending: [{ mission: "Question fictive", created_at: "2024-07-01T12:00:00Z" }], last_activity: null,
      } } })
      return route.fulfill({ status: 404, json: {} })
    })
    await page.goto("/e2e/fixtures/features.html?screen=student")
    await page.getByRole("button", { name: "Détail de Alice Fictive" }).click()
    const panel = page.getByRole("dialog", { name: "Alice Fictive" })
    await expect(panel.getByText("9,5 / 40")).toBeVisible()
    await expect(panel.getByText("3 / 4")).toBeVisible()
    await expect(panel.getByText("Jamais tentées, blocs fermés")).toBeVisible()
    await expect(panel.getByText("Demandes d’aide en attente : 1")).toBeVisible()
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/student-summary-${theme}-${width}.png`, fullPage: true })
    await page.getByRole("button", { name: "Fermer le panneau" }).press("Escape")
    await expect(panel).not.toBeVisible()
  })
}
