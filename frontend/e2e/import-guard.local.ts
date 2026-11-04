import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

const fixturePath = process.env.SHOPFLOW_IMPORT_GUARD_FIXTURE
if (!fixturePath) throw new Error("Generate SHOPFLOW_IMPORT_GUARD_FIXTURE with the pytest import guard scenario.")
const dashboards = JSON.parse(readFileSync(fixturePath, "utf8"))

for (const theme of ["light", "dark"]) for (const width of [390, 1366]) {
  test(`student openings survive import checks, ${theme} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 })
    let dashboard = dashboards.before
    await page.route("**/api/v1/**", async (route) => {
      if (new URL(route.request().url()).pathname.endsWith("/student/dashboard")) {
        await route.fulfill({ json: dashboard })
      } else {
        await route.fulfill({ status: 404, json: {} })
      }
    })
    for (const phase of ["before", "refused", "renamed"]) {
      dashboard = dashboards[phase]
      await page.goto(`/e2e/fixtures/evolutions.html?import-guard=1&theme=${theme}`)
      const course = page.getByRole("region", { name: "Cours de test", exact: true })
      const block = course.getByRole("group", { name: "Bloc : Bloc 1" })
      await expect(block.getByText("Ouvert", { exact: true })).toBeVisible()
      await expect(block.getByRole("button", { name: /^Ouvrir/ })).toHaveCount(2)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([])
      await page.screenshot({ path: `test-results/import-guard-${phase}-${theme}-${width}.png`, fullPage: true })
    }
  })
}
