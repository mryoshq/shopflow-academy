import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

// ADR-0033: « Le voyage d'une donnée », 7 scenes, on the test stack (fictional demo account only).
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const student = accounts.find((item) => item.username === "demo.etudiant03")!

test("voyage: the 7 scenes by address, buttons and arrows, in both themes", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(student.username)
  await page.getByLabel("Mot de passe").fill(student.password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${student.username}` })).toBeVisible()
  await page.goto("/#/voyage/2")
  await expect(page.getByRole("heading", { name: "Le voyage d’une donnée" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Scène 2 sur 7" })).toHaveAttribute("aria-current", "step")
  await page.getByRole("button", { name: "Scène 1 sur 7" }).click()
  for (let scene = 1; scene <= 7; scene++) {
    await expect(page.getByText(`Scène ${scene} sur 7`, { exact: true })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`#/voyage/${scene}$`))
    if (scene < 7) await page.getByRole("button", { name: "Scène suivante →" }).click()
  }
  await expect(page.getByRole("button", { name: "Scène suivante →" })).toBeDisabled()
  await page.goBack()
  await expect(page.getByRole("button", { name: "Scène 6 sur 7" })).toHaveAttribute("aria-current", "step")
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" })
    await page.evaluate((value) => document.documentElement.classList.toggle("dark", value === "dark"), theme)
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([])
  }
})
