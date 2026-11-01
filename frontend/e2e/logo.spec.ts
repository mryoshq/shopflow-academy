import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/**
 * Owner's logo (docs/design/README.md) on the test stack: the light theme shows the full logo with
 * transparent background, the dark theme the owner's green variant; both sit next to the name written
 * in text in the header. The login card now presents Rafi, at 1366x768 and 390x844.
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
    test(`login: Rafi and header logo in the ${theme} theme at ${width}x${height}`, async ({ page }) => {
      // Public-page rendering is independent of accounts and never contacts the database.
      await page.route("**/api/v1/auth/me", (route) => route.fulfill({ status: 401, json: {} }))
      await page.setViewportSize({ width, height })
      await page.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
      await page.goto("/")
      const card = page.locator("form").filter({ has: page.getByRole("button", { name: "Se connecter" }) })
      await expect(card.getByText("Rapidfox Academy")).toBeVisible()
      await expect(card.getByText(/Python Data Engineering & SQL Avancé/)).toBeVisible()
      // ADR-0036: the tab icon follows the theme chosen in the application.
      await expect(page.locator("link#theme-icon")).toHaveAttribute("href", `/icons/favicon-${theme}.png`)
      const rafi = card.getByTestId("rafi-avatar")
      await expect(rafi).toBeVisible()
      const image = rafi.locator("img")
      await expect(image).toHaveAttribute("src", "/rafi/rafi-144.webp")
      await expect(image).toHaveAttribute("width", "176")
      await expect(image).toHaveJSProperty("complete", true)
      expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
      expect(await image.evaluate((img) => getComputedStyle(img).clipPath)).toMatch(/^polygon\(/)
      await visibleLogo(page.locator("header").first(), theme, 32)
      expect(await serious(page)).toEqual([])
      await page.screenshot({ path: `${shots}/login-${theme}-${width}.png` })
    })

    test(`authenticated header logo in the ${theme} theme at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.addInitScript((value) => window.localStorage.setItem("shopflow:theme", value), theme)
      await page.goto("/")
      await page.getByRole("textbox", { name: "Identifiant" }).fill("demo.etudiant01")
      await page.getByLabel("Mot de passe").fill(accounts().find((item) => item.username === "demo.etudiant01")!.password)
      await page.getByRole("button", { name: "Se connecter" }).click()
      await expect(page.getByRole("heading", { name: "Bonjour, demo.etudiant01" })).toBeVisible()
      const header = page.locator("header").first()
      await expect(header.getByText("Rapidfox Academy")).toBeVisible()
      await visibleLogo(header, theme, 32)
      expect(await serious(page)).toEqual([])
      await page.screenshot({ path: `${shots}/header-${theme}-${width}.png` })
    })
  }
}
