import { expect, type Page } from "@playwright/test"

/**
 * Teacher navigation (ADR-0031): a sidebar link per view, then a sub-tab when the view has some.
 * Example: teacherView(page, "Ma classe", "Demandes d’aide").
 */
export async function teacherView(page: Page, view: string, sub?: string) {
  await page.getByRole("navigation", { name: "Navigation enseignant" }).getByRole("link", { name: view, exact: true }).click()
  if (view === "Mon cours") await expect(page.getByRole("heading", { name: "Studio de cours" })).toBeVisible()
  if (sub) {
    const tab = page.getByRole("tab", { name: sub, exact: true })
    await tab.click()
    await expect(tab).toHaveAttribute("aria-selected", "true")
  }
}
