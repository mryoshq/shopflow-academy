import { readFileSync } from "node:fs"
import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
const EXPECTED_CSP = /add_header Content-Security-Policy "([^"]+)" always;/.exec(readFileSync("../gateway/nginx.conf", "utf8"))![1]

async function mock(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/live")) return route.fulfill({ json: { generated_at: new Date().toISOString(), students: [
      { id: 1, name: "Alice", online: true, seen_at: new Date().toISOString(), mission: "Mission fictive", cells: [{ chapter_id: 7, state: "done", done: 2, total: 2 }] },
      { id: 2, name: "Bilal", online: false, seen_at: "2026-11-01T23:30:00Z", mission: "Mission passée", cells: [{ chapter_id: 7, state: "in_progress", done: 1, total: 2 }] },
    ] } })
    if (path.endsWith(".sql")) return route.fulfill({ contentType: "text/plain", body: "SELECT 1;\n-- <img src=x onerror=alert(1)>" })
    return route.fulfill({ status: 404, json: {} })
  })
}
for (const theme of ["light", "dark"]) for (const width of [390, 1366]) {
  test(`block popover stays in viewport and restores focus, code is inert — ${theme} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" }); await mock(page)
    const response = await page.goto(`/e2e/fixtures/evolutions.html?bottom=1&theme=${theme}`)
    expect(response!.headers()["content-security-policy"]).toBe(EXPECTED_CSP)
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
    await page.getByRole("button", { name: "Aperçu de Requête fictive" }).click()
    const code = page.getByLabel("Contenu de query.sql"); await expect(code).toContainText("<img src=x onerror=alert(1)>")
    await expect(code.locator("img")).toHaveCount(0); await expect(code.locator('[data-token="keyword"]')).toHaveText("SELECT")
    const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations
    expect(violations).toEqual([])
    await page.screenshot({ path: `test-results/evolutions-code-${theme}-${width}.png`, fullPage: true })
    await page.getByRole("button", { name: "Fermer l’aperçu" }).press("Escape")
    await expect(page.getByRole("dialog")).not.toBeVisible()
  })
}

function pdfFixture(): Buffer {
  const stream = (text: string) => `BT /F1 18 Tf 40 160 Td (${text}) Tj ET`
  const first = stream("Local PDF page one"), second = stream("Local PDF page two")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R /OpenAction 8 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /Annots [9 0 R] >>",
    `<< /Length ${first.length} >>\nstream\n${first}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    `<< /Length ${second.length} >>\nstream\n${second}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /S /JavaScript /JS <${Buffer.from('app.alert("PDF SCRIPT MUST NOT RUN")').toString("hex")}> >>`,
    "<< /Type /Annot /Subtype /Link /Rect [20 20 280 180] /A << /S /URI /URI (https://example.invalid/pdf-link) >> >>",
  ]
  let pdf = "%PDF-1.7\n"
  const offsets = [0]
  for (let index = 0; index < objects.length; index++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n` }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf)
}
for (const theme of ["light", "dark"]) for (const width of [390, 1366]) {
  test(`PDF local canvas, page/zoom/text, no scripting or remote viewer — ${theme} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" })
    await mock(page)
    await page.route("**/api/v1/downloads/*.pdf", (route) => route.fulfill({ contentType: "application/pdf", body: pdfFixture() }))
    const dialogs: string[] = [], external: string[] = [], errors: string[] = []
    page.on("dialog", async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss() })
    page.on("request", (request) => { if (new URL(request.url()).origin !== new URL(test.info().project.use.baseURL!).origin) external.push(request.url()) })
    page.on("pageerror", (error) => errors.push(error.message))
    const response = await page.goto(`/e2e/fixtures/evolutions.html?theme=${theme}`)
    expect(response!.headers()["content-security-policy"]).toBe(EXPECTED_CSP)
    await page.getByRole("button", { name: "Aperçu de Guide fictif" }).click()
    await expect(page.getByText("Page 1 sur 2", { exact: true })).toBeVisible()
    await expect(page.getByText("Chargement de la page…", { exact: true })).not.toBeVisible()
    await page.getByText("Texte de la page (accessible)").click()
    await expect(page.getByText("Local PDF page one", { exact: true })).toBeVisible()
    const canvas = page.locator("canvas")
    expect(await canvas.evaluate((node) => {
      const data = node.getContext("2d")!.getImageData(0, 0, node.width, node.height).data
      let ink = 0; for (let i = 0; i < data.length; i += 4) if (data[i] < 150 && data[i + 3] > 0) ink++
      return ink
    })).toBeGreaterThan(50)
    await page.getByRole("combobox", { name: "Zoom du PDF" }).selectOption("1.5")
    await expect(canvas).toHaveAttribute("width", "450")
    await expect(page.getByRole("button", { name: "Page suivante" })).toBeEnabled()
    await page.getByRole("button", { name: "Page suivante" }).click()
    await expect(page.getByText("Page 2 sur 2", { exact: true })).toBeVisible()
    await expect(page.getByText("Local PDF page two", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Page suivante" })).toBeDisabled()
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([])
    expect(dialogs).toEqual([]); expect(external).toEqual([]); expect(errors).toEqual([])
    await page.screenshot({ path: `test-results/evolutions-pdf-${theme}-${width}.png`, fullPage: true })
    await expect(page.getByRole("link", { name: "Télécharger", exact: true })).toHaveAttribute("href", "/api/v1/downloads/0123456789abcdef.pdf")
    await page.getByRole("button", { name: "Fermer l’aperçu" }).press("Escape")
    await expect(page.getByRole("dialog")).not.toBeVisible()
    await expect.poll(() => page.workers().length).toBe(0)
    await expect(page.getByRole("button", { name: "Aperçu de Guide fictif" })).toBeFocused()
  })
}

test("PDF invalid and access failure keep a download fallback and retry", async ({ page }) => {
  await mock(page)
  let calls = 0
  await page.route("**/api/v1/downloads/*.pdf", (route) => { calls++; return route.fulfill(calls === 1 ? { status: 404, body: "" } : { contentType: "application/pdf", body: "not a PDF" }) })
  await page.goto("/e2e/fixtures/evolutions.html")
  await page.getByRole("button", { name: "Aperçu de Guide fictif" }).click()
  await expect(page.getByText("Aperçu indisponible. Vous pouvez télécharger le fichier.")).toBeVisible()
  await page.getByRole("button", { name: "Réessayer" }).click()
  await expect.poll(() => calls).toBe(2)
  await expect(page.getByText("Aperçu indisponible. Vous pouvez télécharger le fichier.")).toBeVisible()
  await expect(page.getByRole("link", { name: "Télécharger", exact: true })).toBeVisible()
})

test("a rejected PDF chunk stays local and reload recovers the module", async ({ page }) => {
  await mock(page)
  await page.route("**/api/v1/downloads/*.pdf", (route) => route.fulfill({ contentType: "application/pdf", body: pdfFixture() }))
  let failed = true
  await page.route("**/assets/PdfPreview-*.js", (route) => failed ? route.abort("failed") : route.continue())
  await page.goto("/e2e/fixtures/evolutions.html")
  await page.getByRole("button", { name: "Aperçu de Guide fictif" }).click()
  await expect(page.getByText("Le lecteur PDF n’a pas pu être chargé. Rechargez la page pour réessayer.")).toBeVisible()
  await expect(page.getByRole("link", { name: "Télécharger", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Fermer", exact: true })).toBeVisible()
  failed = false
  await page.getByRole("button", { name: "Recharger la page" }).click()
  await expect(page.getByRole("heading", { name: "Évolutions locales fictives" })).toBeVisible()
  await page.getByRole("button", { name: "Aperçu de Guide fictif" }).click()
  await expect(page.getByText("Page 1 sur 2", { exact: true })).toBeVisible()
  await expect(page.getByText("Le lecteur PDF n’a pas pu être chargé. Rechargez la page pour réessayer.")).not.toBeVisible()
})
