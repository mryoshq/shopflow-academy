import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/**
 * Owner's logo (docs/design/README.md) on the test stack: the light theme shows the full logo with
 * transparent background, the dark theme the owner's green variant; both sit next to the name written
 * in text, in the header and on the login page, at 1366x768 and 390x844.
 */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = () => JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR ?? "test-results/logo"

async function serious(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

async function visibleLogo(scope: ReturnType<Page["locator"]>, theme: "light" | "dark", size: number) {
  const logo = scope.locator(`img[src="/icons/logo-${theme}.png"]`)
  await expect(logo).toBeVisible()
  await expect(scope.locator(`img[src="/icons/logo-${theme === "light" ? "dark" : "light"}.png"]`)).toBeHidden()
  expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(256)
  const box = await logo.boundingBox()
  expect([box?.width, box?.height]).toEqual([size, size])
}

for (const theme of ["light", "dark"] as const) {
  for (const [width, height] of [[1366, 768], [390, 844]] as const) {
    test(`logo in the ${theme} theme at ${width}x${height}: login and header`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
      await page.goto("/")
      const card = page.locator("form").filter({ has: page.getByRole("button", { name: "Se connecter" }) })
      await expect(card.getByText("ShopFlow Academy")).toBeVisible()
      await visibleLogo(card, theme, 56)
      expect(await serious(page)).toEqual([])
      await page.screenshot({ path: `${shots}/login-${theme}-${width}.png` })

      await page.getByRole("textbox", { name: "Identifiant" }).fill("demo.etudiant01")
      await page.getByLabel("Mot de passe").fill(accounts().find((item) => item.username === "demo.etudiant01")!.password)
      await page.getByRole("button", { name: "Se connecter" }).click()
      await expect(page.getByRole("heading", { name: "Bonjour, demo.etudiant01" })).toBeVisible()
      const header = page.locator("header").first()
      await expect(header.getByText("ShopFlow Academy")).toBeVisible()
      await visibleLogo(header, theme, 32)
      expect(await serious(page)).toEqual([])
      await page.screenshot({ path: `${shots}/header-${theme}-${width}.png` })
    })
  }
}
