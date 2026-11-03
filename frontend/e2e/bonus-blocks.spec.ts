import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

for (const width of [390, 1366]) for (const theme of ["light", "dark"]) {
  test(`optional bonus labels and keyboard detail ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    const block = { chapter_id: 7, position: 1, module: "Module fictif", title: "Bonus A", open: true, mission_count: 0, bonus_count: 2, bonus_only: true }
    const students = [2, 1, 0].map((done, i) => ({ id: i + 1, name: `Élève fictif ${i + 1}`, online: false, seen_at: null, mission: null, help: false, fast_attempts: 0,
      cells: [{ chapter_id: 7, state: "not_started", done: 0, total: 0, bonus_done: done, bonus_total: 2, for_student: false }] }))
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith("/timeline")) return route.fulfill({ json: { generated_at: new Date().toISOString(), assignment_id: 4, student_count: 3, block_minutes: 15, next_block_id: null,
        blocks: [{ ...block, opened_at: new Date().toISOString(), bonus_possible: 10, duration_minutes: 0, completed_students: 0, bonus_completed_students: 1, help_pending: 0 }], help: [], missions: [] } })
      if (path.endsWith("/live")) return route.fulfill({ json: { generated_at: new Date().toISOString(), assignment_id: 4, student_count: 3, online_count: 0, blocks: [block], students } })
      if (path.endsWith("/messages")) return route.fulfill({ json: [] })
      return route.fulfill({ status: 404, json: {} })
    })
    await page.goto(`/e2e/fixtures/evolutions.html?bonus=1&theme=${theme}`)
    await expect(page.getByText("Bonus facultatifs", { exact: true })).toHaveCount(2)
    await expect(page.getByRole("list", { name: "Blocs de la journée" })).not.toContainText("environ 0 min")
    const trigger = page.getByRole("button", { name: /Bonus facultatifs du bloc Bonus A/ })
    await expect(trigger).toHaveText("1 / 3 ont réussi tous les bonus")
    await expect(page.getByRole("img", { name: /Élève fictif 1, Bonus A : 2 \/ 2 bonus réussis/ })).toBeVisible()
    await trigger.focus(); await trigger.press("Enter")
    const panel = page.getByRole("dialog")
    await expect(panel.getByText("Élève fictif 1 · 2 / 2 bonus réussis")).toBeVisible()
    await expect(panel.getByText("Élève fictif 2 · 1 / 2 bonus réussis")).toBeVisible()
    await expect(panel.getByText("Élève fictif 3 · 0 / 2 bonus réussis")).toBeVisible()
    await expect(panel).not.toContainText("terminé")
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/bonus-${theme}-${width}.png`, fullPage: true })
    await panel.getByRole("button", { name: "Fermer" }).press("Escape")
    await expect(panel).not.toBeVisible(); await expect(trigger).toBeFocused()
  })
}
