import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

// Public pages only, with a simulated auth response: no real account or database mutation.
test("large Rafi during session recovery, then login, with pointer-following eyes", async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const privateRequests: string[] = []
  await page.route("**/api/v1/**", async (route) => {
    if (!route.request().url().endsWith("/auth/me")) privateRequests.push(route.request().url())
    await gate
    await route.fulfill({ status: 401, contentType: "application/json", body: "{}" })
  })
  await page.goto("/")
  const loading = page.getByTestId("rafi-loading")
  await expect(loading).toBeVisible()
  await expect(loading.locator("img")).toHaveAttribute("width", "240")
  const pupil = loading.getByTestId("rafi-eyes").locator("g[transform]").first()
  await page.mouse.move(5, 5)
  await expect(pupil).not.toHaveAttribute("transform", "translate(0.00 0.00)")
  await page.screenshot({ path: "test-results/rafi-entry-loading.png", fullPage: true })
  release()
  await expect(page.getByTestId("rafi-login")).toBeVisible()
  await expect(loading).toHaveCount(0)
  await page.getByRole("button", { name: "Rafi, votre assistant" }).click()
  await page.getByRole("textbox", { name: "Identifiant" }).fill("exemple")
  await expect(page.getByRole("textbox", { name: "Identifiant" })).toHaveValue("exemple")
  expect(privateRequests).toEqual([])
})

for (const theme of ["light", "dark"]) {
  for (const width of [1366, 390]) {
    test(`login: transparent Rafi, no toolbar, reduced motion, AA — ${theme}, ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ reducedMotion: "reduce" })
      await page.addInitScript((value) => localStorage.setItem("shopflow:theme", value), theme)
      await page.route("**/api/v1/**", (route) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }))
      await page.goto("/")
      const avatar = page.getByTestId("rafi-login").getByTestId("rafi-avatar")
      await expect(avatar).toBeVisible()
      await expect(avatar.locator("img")).toHaveAttribute("width", "176")
      expect(await avatar.locator("img").evaluate((img) => getComputedStyle(img).clipPath)).toMatch(/^polygon\(/)
      await expect(page.getByRole("button", { name: /Replier Rafi|Afficher Rafi|sons de Rafi/ })).toHaveCount(0)
      await page.mouse.move(5, 5)
      await avatar.click()
      await expect(avatar.getByTestId("rafi-eyes").locator("g[transform]").first()).toHaveAttribute("transform", "translate(0.00 0.00)")
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
      expect(axe.violations).toEqual([])
      await page.screenshot({ path: `test-results/rafi-entry-${theme}-${width}.png`, fullPage: true })
      await avatar.screenshot({ path: `test-results/rafi-avatar-${theme}-${width}.png` })
    })
  }
}
