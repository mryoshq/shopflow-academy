import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"
import { teacherView } from "./teacher-nav"

/**
 * ADR-0047: Rafi on the student side (announcements in a bubble, eyes, folding), the countdown to the next deadline,
 * absent for the teacher except in « Vue étudiant ». It removes the milestone it creates.
 */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => accounts.find((item) => item.username === name)!
const shots = process.env.SHOPFLOW_SCREENSHOT_DIR
/** A demo student of the class, chosen at run time (the class composition differs between stacks). */
let STUDENT = ""

async function signIn(page: Page, name: string) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await page.getByLabel("Mot de passe").fill(account(name).password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${name}` })).toBeVisible()
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations === Infinity))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

async function teacherApi(request: APIRequestContext) {
  expect((await request.post("/api/v1/auth/login", { data: { username: "demo.enseignant", password: account("demo.enseignant").password } })).status()).toBe(200)
  const csrf = (await request.storageState()).cookies.find((cookie) => cookie.name === "academy_csrf")!.value
  const assignment = (await (await request.get("/api/v1/teacher/classes")).json())[0].id as number
  if (!STUDENT) {
    const view = await (await request.get(`/api/v1/teacher/classes/${assignment}/project`)).json()
    const names = [...view.alone, ...view.teams.flatMap((team: { members: { name: string }[] }) => team.members)].map((item: { name: string }) => item.name)
    STUDENT = names.filter((name) => accounts.some((a) => a.username === name)).sort().at(-1) ?? ""
    expect(STUDENT).not.toBe("")
  }
  return { csrf, assignment }
}

/** Reads the queue (« J’ai lu ») until the bubble shows this text. */
async function reach(page: Page, text: string) {
  const bubble = page.getByTestId("rafi-bubble")
  for (let i = 0; i < 15; i++) {
    await expect(bubble).toBeVisible({ timeout: 15_000 })
    if ((await bubble.textContent())?.includes(text)) return bubble
    await bubble.getByRole("button", { name: /^J’ai lu/ }).click()
    await page.waitForTimeout(150)
  }
  throw new Error(`announcement not reached: ${text}`)
}

const pupils = (page: Page) => page.getByTestId("rafi-eyes").locator("g[transform]").first().getAttribute("transform")

test.describe.serial("Rafi", () => {
  let milestone = 0

  test("announcements in a bubble, eyes that follow, folding remembered; the teacher has no Rafi", async ({ page, request, browser }) => {
    const { csrf, assignment } = await teacherApi(request)
    const due = new Date(Date.now() + 3 * 86400_000 + 5 * 3600_000).toISOString()
    milestone = (await (await request.post(`/api/v1/teacher/classes/${assignment}/project/milestones`,
      { data: { title: "Rendu Rafi", due_at: due }, headers: { "X-CSRF-Token": csrf } })).json()).id
    await signIn(page, STUDENT)
    await page.evaluate(() => window.localStorage.removeItem("shopflow:rafi:collapsed"))
    await page.reload()
    const rafi = page.getByTestId("rafi")
    await expect(rafi.getByRole("button", { name: /^Rafi/ })).toBeVisible()
    // Countdown to the next deadline.
    const next = page.getByRole("region", { name: "Prochaine échéance" })
    await expect(next).toContainText("Rendu Rafi")
    await expect(next).toContainText(/dans 3 j \d+ h/)

    // A teacher's message takes the same channel: Rafi presents it.
    const text = `Bonjour, pensez à la pause (${Date.now() % 1000}).`
    expect((await request.post(`/api/v1/teacher/classes/${assignment}/messages`, { data: { text }, headers: { "X-CSRF-Token": csrf } })).status()).toBe(201)
    await page.waitForTimeout(9000)  // next poll of the feed
    const bubble = await reach(page, text)
    await expect(bubble).toHaveAttribute("role", "status")

    // The pupils follow the cursor (a few pixels at most), the image is the owner's.
    const before = await pupils(page)
    await page.mouse.move(5, 5)
    await page.waitForTimeout(600)
    expect(await pupils(page)).not.toBe(before)
    expect(await rafi.locator("img").getAttribute("srcset")).toContain("/rafi/rafi-512.webp 512w")
    const box = await rafi.locator("img").boundingBox()
    expect(Math.round(box!.width)).toBe(72)

    await bubble.getByRole("button", { name: /^J’ai lu/ }).click()
    await rafi.getByRole("button", { name: "Replier Rafi" }).click()
    await page.reload()
    await expect(page.getByRole("button", { name: "Afficher Rafi" })).toBeVisible()
    await page.getByRole("button", { name: "Afficher Rafi" }).click()
    await expect(page.getByRole("button", { name: "Replier Rafi" })).toBeVisible()

    // No Rafi for the teacher, except in « Vue étudiant ».
    const teacher = await browser.newPage()
    await signIn(teacher, "demo.enseignant")
    await expect(teacher.getByTestId("rafi")).toHaveCount(0)
    await teacherView(teacher, "Vue étudiant")
    await expect(teacher.getByTestId("student-view-banner")).toBeVisible()
    await expect(teacher.getByTestId("rafi")).toHaveCount(1)
    await teacher.close()
  })

  for (const theme of ["light", "dark"] as const) {
    for (const width of [1366, 390]) {
      test(`AA and captures, ${theme}, ${width} px; frozen with « Réduire les animations »`, async ({ browser, request }) => {
        await captures(browser, request, theme, width)
      })
    }
  }

  test.afterAll(async ({ request }) => {
    const { csrf } = await teacherApi(request)
    if (milestone) await request.delete(`/api/v1/teacher/project/milestones/${milestone}`, { headers: { "X-CSRF-Token": csrf } })
  })
})

async function captures(browser: Browser, request: APIRequestContext, theme: "light" | "dark", width: number) {
  const { csrf, assignment } = await teacherApi(request)
  const name = `${theme === "light" ? "clair" : "sombre"}-${width}`
  const context = await browser.newContext({ locale: "fr-FR", viewport: { width, height: width > 500 ? 900 : 844 }, reducedMotion: "reduce" })
  await context.addInitScript((value) => { window.localStorage.setItem("shopflow:theme", value); window.localStorage.removeItem("shopflow:rafi:collapsed") }, theme)
  const page = await context.newPage()
  await signIn(page, STUDENT)
  await request.post(`/api/v1/teacher/classes/${assignment}/messages`, { data: { text: `Rafi ${name} : bonne séance !` }, headers: { "X-CSRF-Token": csrf } })
  const bubble = await reach(page, `Rafi ${name}`)
  // Frozen: the pupils stay where his own are.
  const before = await pupils(page)
  await page.mouse.move(2, 2)
  await page.waitForTimeout(400)
  expect(await pupils(page)).toBe(before)
  expect(await serious(page)).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  if (shots) {
    await page.screenshot({ path: `${shots}/rafi-tableau-${name}.png`, animations: "disabled" })
    await page.getByTestId("rafi").screenshot({ path: `${shots}/rafi-bulle-${name}.png`, animations: "disabled" })
  }
  await bubble.getByRole("button", { name: /^J’ai lu/ }).click()
  await context.close()
}
