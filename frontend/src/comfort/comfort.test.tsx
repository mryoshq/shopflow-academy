import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { PwaBanner } from "../pwa"
import { ComfortButton, DEFAULT_POMODORO, clampMinutes, clock, tick } from "./Comfort"

const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it("pomodoro: counts down, switches work → break → work, minutes are bounded", () => {
  const start = 1_000_000
  const running = { ...DEFAULT_POMODORO, running: true, endsAt: start + 25 * 60_000 }
  expect(tick(running, start + 60_000).remaining).toBe(24 * 60)
  const rest = tick(running, start + 25 * 60_000)
  expect([rest.phase, rest.remaining]).toEqual(["break", 5 * 60])
  expect(tick(rest, rest.endsAt!).phase).toBe("work")
  expect(tick({ ...DEFAULT_POMODORO }, start)).toEqual(DEFAULT_POMODORO) // paused: unchanged
  expect([clock(25 * 60), clock(65), clampMinutes(90, 15, 50), clampMinutes(Number("x"), 3, 15)]).toEqual(["25:00", "01:05", 50, 3])
})

it("radio: nothing loads before « Écouter », then the stream starts muted; none configured → a short note", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ streams: [{ id: "abcDEF12345", label: "Lofi calme", url: "https://www.youtube-nocookie.com/embed/abcDEF12345" }] })))
  const { container } = wrap(<ComfortButton />)
  fireEvent.click(screen.getByRole("button", { name: "Confort : minuteur et radio" }))
  fireEvent.click(await screen.findByRole("button", { name: "Écouter" }))
  const frame = container.querySelector("iframe")!
  expect(frame.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/abcDEF12345?autoplay=1&mute=1&playsinline=1&rel=0")
  fireEvent.click(screen.getByRole("button", { name: "Arrêter" }))
  expect(container.querySelector("iframe")).toBeNull()
  cleanup()
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ streams: [] })))
  const second = wrap(<ComfortButton />)
  expect(await screen.findByText("Aucune radio proposée par votre enseignant.")).toBeInTheDocument()
  expect(second.container.querySelector("iframe")).toBeNull()
})

it("pomodoro in the header: the button shows the time left while it runs", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ streams: [] })))
  wrap(<ComfortButton />)
  fireEvent.click(screen.getByRole("button", { name: "Confort : minuteur et radio" }))
  fireEvent.click(screen.getByRole("button", { name: "Démarrer" }))
  await act(async () => { await vi.advanceTimersByTimeAsync(2_100) })
  expect(screen.getByRole("button", { name: /^Confort : travail, 24:5\d restantes$/ })).toBeInTheDocument()
})

/** Runs public/sw.js against a fake worker scope and returns which requests it answers. */
function serviceWorker() {
  const listeners: Record<string, (event: unknown) => void> = {}
  const scope = { location: { origin: "https://shopflow.example" }, addEventListener: (type: string, fn: (e: unknown) => void) => { listeners[type] = fn },
    skipWaiting: vi.fn(), clients: { claim: vi.fn(), matchAll: vi.fn(async () => []) }, registration: { showNotification: vi.fn() } }
  new Function("self", "caches", "fetch", readFileSync(`${process.cwd()}/public/sw.js`, "utf8"))(scope, { match: vi.fn(async () => undefined), open: vi.fn(async () => ({ put: vi.fn() })) }, vi.fn(async () => ({ ok: true, clone() { return this } })))
  const answers = (url: string, mode = "no-cors", method = "GET") => {
    const respondWith = vi.fn()
    listeners.fetch({ request: { url, mode, method }, respondWith })
    return respondWith.mock.calls.length > 0
  }
  return { answers, listeners, scope }
}

it("service worker: never answers for the API, media, other origins or writes; pages, build files and icons only", () => {
  const { answers, listeners, scope } = serviceWorker()
  expect(answers("https://shopflow.example/api/v1/student/missions/3")).toBe(false)
  expect(answers("https://shopflow.example/api/v1/notifications", "navigate")).toBe(false)
  expect(answers("https://shopflow.example/media/0123456789abcdef.mp4")).toBe(false)
  expect(answers("https://www.youtube-nocookie.com/embed/x")).toBe(false)
  expect(answers("https://shopflow.example/", "navigate", "POST")).toBe(false)
  expect(answers("https://shopflow.example/", "navigate")).toBe(true)
  expect(answers("https://shopflow.example/assets/index-abc123.js")).toBe(true)
  expect(answers("https://shopflow.example/icons/icon-192.png")).toBe(true)
  listeners.message({ data: "academy:update" })
  expect(scope.skipWaiting).toHaveBeenCalled()
})

it("update notice reloads on demand; the install offer can be dismissed for good", async () => {
  const worker = { postMessage: vi.fn() } as unknown as ServiceWorker
  wrap(<PwaBanner register={async (onUpdate) => onUpdate(worker)} />)
  expect(await screen.findByText("Nouvelle version disponible.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Recharger" }))
  expect(worker.postMessage).toHaveBeenCalledWith("academy:update")
  const event = Object.assign(new Event("beforeinstallprompt"), { prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome: "accepted" }) })
  act(() => { window.dispatchEvent(event) })
  expect(screen.getByRole("button", { name: "Installer l’application" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Ne plus proposer l’installation" }))
  expect(screen.queryByRole("button", { name: "Installer l’application" })).not.toBeInTheDocument()
  expect(localStorage.getItem("shopflow:install-dismissed")).toBe("1")
})

it("manifest and theme: installable app, form fields with a 3:1 border token", () => {
  const manifest = JSON.parse(readFileSync(`${process.cwd()}/public/manifest.webmanifest`, "utf8")) as { display: string; lang: string; icons: { purpose: string }[] }
  expect([manifest.display, manifest.lang]).toEqual(["standalone", "fr"])
  expect(manifest.icons.map((icon) => icon.purpose)).toContain("maskable")
  expect(system.token("colors.app.field")).toBeTruthy()
})
