import { test, expect, type APIRequestContext, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"

/** Issue #107: no milestone dates; deposits stay open until the team's defence starts, the teacher can reopen. */
const credentialsPath = process.env.SHOPFLOW_DEMO_CREDENTIALS ?? "../.local/test-stack-credentials.json"
const accounts = JSON.parse(readFileSync(credentialsPath, "utf8")) as { username: string; password: string }[]
const account = (name: string) => accounts.find((item) => item.username === name)!
type Member = { id: number; name: string }

async function signIn(page: Page, name: string) {
  await page.goto("/")
  await page.getByRole("textbox", { name: "Identifiant" }).fill(name)
  await page.getByLabel("Mot de passe").fill(account(name).password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page.getByRole("heading", { name: `Bonjour, ${name}` })).toBeVisible()
}

type View = { cohort_id: number; teams: { id: number; members: Member[] }[]; alone: Member[]; slots: { team_id: number | null }[] }

/** The teacher's class whose project the demo students see (a long-lived test stack can hold more classes). */
async function teacherApi(request: APIRequestContext, cohort: number) {
  expect((await request.post("/api/v1/auth/login", { data: { username: "demo.enseignant", password: account("demo.enseignant").password } })).status()).toBe(200)
  const csrf = (await request.storageState()).cookies.find((cookie) => cookie.name === "academy_csrf")!.value
  for (const item of await (await request.get("/api/v1/teacher/classes")).json() as { id: number }[]) {
    const view = await (await request.get(`/api/v1/teacher/classes/${item.id}/project`)).json() as View
    if (view.cohort_id === cohort) return { csrf, assignment: item.id, view }
  }
  throw new Error("class of the demo students not found")
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations === Infinity))
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  return results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => item.id)
}

test("deposits close when the defence starts; the teacher reopens a team for an hour", async ({ browser, request, playwright, baseURL }) => {
  const probe = await playwright.request.newContext({ baseURL })
  await probe.post("/api/v1/auth/login", { data: { username: "demo.etudiant01", password: account("demo.etudiant01").password } })
  const cohort = (await (await probe.get("/api/v1/student/project")).json()).cohort_id as number
  await probe.dispose()
  const { csrf, assignment, view } = await teacherApi(request, cohort)
  const headers = { "X-CSRF-Token": csrf }
  const demo = (member: Member) => accounts.some((item) => item.username === member.name)
  const booked = new Set(view.slots.map((slot) => slot.team_id))
  let team = view.teams.find((item) => item.members.length >= 2 && item.members.every(demo) && !booked.has(item.id))
  let created = 0
  if (!team) {
    const two = view.alone.filter(demo).slice(0, 2)
    expect(two).toHaveLength(2)
    const response = await request.post(`/api/v1/teacher/classes/${assignment}/project/teams`, { data: { user_ids: two.map((item) => item.id) }, headers })
    created = (await response.json()).team_id
    team = { id: created, members: two }
  }
  const milestone = (await (await request.post(`/api/v1/teacher/classes/${assignment}/project/milestones`, { data: { title: "Rendu e2e #107" }, headers })).json()).id as number
  const now = Date.now()
  const slot = (await (await request.post(`/api/v1/teacher/classes/${assignment}/project/slots`,
    { data: { starts_at: new Date(now - 5 * 60_000).toISOString(), ends_at: new Date(now + 15 * 60_000).toISOString(), team_id: team.id }, headers })).json()).id as number
  try {
    const context = await browser.newContext({ locale: "fr-FR", reducedMotion: "reduce" })
    const page = await context.newPage()
    await signIn(page, team.members[0].name)
    await expect(page.getByText("Les dépôts sont fermés : votre soutenance a commencé.")).toBeVisible()
    const card = page.getByTestId("milestone-card").filter({ hasText: "Rendu e2e #107" })
    await expect(card.getByText("Jusqu’à votre soutenance")).toBeVisible()
    await expect(card.getByRole("button", { name: "Déposer" })).toHaveCount(0)
    expect(await serious(page)).toEqual([])

    expect((await request.put(`/api/v1/teacher/project/teams/${team.id}/deposits`, { data: { until: new Date(now + 3600_000).toISOString() }, headers })).status()).toBe(200)
    await page.reload()
    await expect(page.getByText(/^Dépôts ouverts jusqu’au /)).toBeVisible()
    await expect(card.getByRole("button", { name: "Déposer" })).toBeVisible()
    await context.close()
  } finally {
    await request.put(`/api/v1/teacher/project/teams/${team.id}/deposits`, { data: { until: null }, headers })
    await request.delete(`/api/v1/teacher/project/slots/${slot}`, { headers })
    await request.delete(`/api/v1/teacher/project/milestones/${milestone}`, { headers })
    if (created) await request.delete(`/api/v1/teacher/project/teams/${created}`, { headers })
  }
})
