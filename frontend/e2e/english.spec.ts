import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/**
 * ADR-0040: the whole interface in English (fictional demo accounts only). The browser asks for English;
 * course content (titles, situations, choices) stays in its own language.
 */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const password = (name: string) => accounts.find((item) => item.username === name)!.password
const MISSION = "Frais de livraison après une jointure"

test.use({ locale: "en-GB" })

async function login(page: Page, name: string) {
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await page.getByRole("textbox", { name: "Username" }).fill(name)
  await page.getByLabel("Password").fill(password(name))
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByRole("heading", { name: `Hello, ${name}` })).toBeVisible()
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

test("English: sign in, dashboard and mission; the choice is remembered and French comes back on demand", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: "Learn data by making real decisions." })).toBeVisible()
  expect(await serious(page)).toEqual([])
  await login(page, "demo.etudiant09")
  await expect(page.getByText("Your score")).toBeVisible()
  await expect(page.getByText(/missions? passed out of \d+\. Your best attempt counts\./)).toBeVisible()
  expect(await serious(page)).toEqual([])
  await page.getByRole("button", { name: `Open: ${MISSION}` }).click()
  await expect(page.getByRole("heading", { level: 1, name: MISSION })).toBeVisible()  // course content stays French
  await expect(page.getByText("Your decision", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Test my decision" })).toBeVisible()
  expect(await serious(page)).toEqual([])
  // Back to French from the settings: remembered in this browser, <html lang> follows.
  await page.keyboard.press("Control+,")
  await page.getByRole("combobox", { name: "Interface language" }).selectOption("fr")
  await expect(page.locator("html")).toHaveAttribute("lang", "fr")
  await expect(page.getByRole("button", { name: "Tester ma décision" })).toBeVisible()
  expect(await page.evaluate(() => window.localStorage.getItem("shopflow:lang"))).toBe("fr")
  await page.evaluate(() => window.localStorage.setItem("shopflow:lang", "en"))
})

test("English: the teacher's « My class »", async ({ page }) => {
  await login(page, "demo.enseignant")
  const nav = page.getByRole("navigation", { name: "Teacher navigation" })
  await nav.getByRole("link", { name: "My class", exact: true }).click()
  await page.getByRole("tab", { name: "Students", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Live tracking" })).toBeVisible()
  await expect(page.getByText("Message to students")).toBeVisible()
  await expect(page.getByRole("table", { name: "Students by blocks" })).toBeVisible()
  expect(await serious(page)).toEqual([])
})
