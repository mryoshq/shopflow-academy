import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
async function mock(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/live")) return route.fulfill({ json: { generated_at: new Date().toISOString(), students: [
      { id: 1, name: "Alice", online: true, seen_at: new Date().toISOString(), mission: "Mission fictive", cells: [{ chapter_id: 7, state: "done", done: 2, total: 2 }] },
      { id: 2, name: "Bilal", online: false, seen_at: "2026-11-01T23:30:00Z", mission: "Mission passée", cells: [{ chapter_id: 7, state: "in_progress", done: 1, total: 2 }] },
    ] } })
    return route.fulfill({ status: 404, json: {} })
  })
}
for (const theme of ["light", "dark"]) for (const width of [390, 1366]) {
  test(`block popover stays in viewport and restores focus — ${theme} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" }); await mock(page)
    await page.goto(`/e2e/fixtures/evolutions.html?bottom=1&theme=${theme}`)
    const trigger = page.getByRole("button", { name: /Progression du bloc/ })
    await trigger.focus(); await expect(page.getByRole("dialog")).toBeVisible()
    await expect(trigger).toBeFocused() // Hover/focus must not steal focus.
    await trigger.press("Enter")
    const panel = page.getByRole("dialog")
    await expect(panel.getByRole("button", { name: "Fermer" })).toBeFocused()
    await expect(panel.getByText("Alice · terminé (2/2)")).toBeVisible()
    await expect(panel.getByText("Dernière page observée : Mission passée")).toBeVisible()
    await expect.poll(async () => {
      const bounds = await panel.boundingBox()
      return !!bounds && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 844
    }).toBe(true)
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/evolutions-popover-${theme}-${width}.png`, fullPage: true })
    await panel.getByRole("button", { name: "Fermer" }).click(); await expect(panel).not.toBeVisible(); await expect(trigger).toBeFocused()
    await trigger.press("Enter"); await expect(panel).toBeVisible(); await panel.getByRole("button", { name: "Fermer" }).press("Escape")
    await expect(panel).not.toBeVisible(); await expect(trigger).toBeFocused()

  })
}
