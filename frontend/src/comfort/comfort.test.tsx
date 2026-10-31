import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { PwaBanner } from "../pwa"
import { ComfortButton, DEFAULT_POMODORO, clampMinutes, clock, loadVolume, tick } from "./Comfort"

const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

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

const STREAMS = { streams: [
  { id: "radio-1", label: "Nightride FM — Chillsynth", url: "https://stream.nightride.fm/chillsynth.mp3" },
  { id: "radio-2", label: "Nightwave Plaza", url: "https://radio.plaza.one/mp3" },
] }

/** jsdom has no media playback: record what the page asks the <audio> element to do. */
function mediaStub(play: () => Promise<void> = async () => undefined) {
  const calls = { play: vi.fn(play), pause: vi.fn(), load: vi.fn() }
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(calls.play)
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(calls.pause)
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(calls.load)
  return calls
}

async function openRadio(body: unknown = STREAMS) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(body)))
  localStorage.removeItem("shopflow:pomodoro")
  const view = wrap(<ComfortButton />)
  fireEvent.click(screen.getByRole("button", { name: "Confort : minuteur et radio" }))
  return view
}

it("radio: a platform <audio> player, nothing loads before « Lecture », pause drops the stream, two stations", async () => {
  const media = mediaStub()
  const { container } = await openRadio()
  expect(await screen.findByRole("combobox", { name: "Station" })).toHaveValue("radio-1")
  const audio = container.querySelector("audio")!
  expect(container.querySelector("iframe")).toBeNull()
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Nightride FM — Chillsynth", "Nightwave Plaza"])
  // Nothing starts on its own: no source, preload none, play never called.
  expect(audio.getAttribute("src")).toBeNull()
  expect(audio.getAttribute("preload")).toBe("none")
  expect(audio.hasAttribute("autoplay")).toBe(false)
  expect(media.play).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Lecture" }))
  expect(audio.getAttribute("src")).toBe("https://stream.nightride.fm/chillsynth.mp3")
  expect(media.play).toHaveBeenCalledTimes(1)
  expect(screen.getByText("Lecture : Nightride FM — Chillsynth")).toBeInTheDocument()
  // Another station while playing: it switches at once.
  fireEvent.change(screen.getByRole("combobox", { name: "Station" }), { target: { value: "radio-2" } })
  expect(audio.getAttribute("src")).toBe("https://radio.plaza.one/mp3")
  fireEvent.click(screen.getByRole("button", { name: "Pause" }))
  expect(media.pause).toHaveBeenCalled()
  expect(audio.getAttribute("src")).toBeNull()
  expect(screen.getByRole("button", { name: "Lecture" })).toBeInTheDocument()
})

it("radio: the volume is remembered in this browser, and storage errors are harmless", async () => {
  mediaStub()
  localStorage.setItem("shopflow:radio-volume", "30")
  const { container } = await openRadio()
  const slider = await screen.findByRole("slider", { name: /Volume/ })
  expect(slider).toHaveValue("30")
  expect(slider).toHaveAttribute("aria-valuetext", "30 %")
  fireEvent.change(slider, { target: { value: "70" } })
  expect(localStorage.getItem("shopflow:radio-volume")).toBe("70")
  fireEvent.click(screen.getByRole("button", { name: "Lecture" }))
  expect(container.querySelector("audio")!.volume).toBeCloseTo(0.7)
  cleanup()
  localStorage.setItem("shopflow:radio-volume", "abc")
  expect(loadVolume()).toBe(50)
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
  expect(loadVolume()).toBe(50)
  await openRadio()
  fireEvent.change(await screen.findByRole("slider", { name: /Volume/ }), { target: { value: "80" } })
  expect(screen.getByText("80 %")).toBeInTheDocument()
})

it("radio: a network error shows « Radio indisponible pour le moment » without blocking the page", async () => {
  mediaStub()
  const { container } = await openRadio()
  fireEvent.click(await screen.findByRole("button", { name: "Lecture" }))
  fireEvent.error(container.querySelector("audio")!)
  expect(screen.getByText("Radio indisponible pour le moment. Réessayez plus tard.")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Lecture" })).toBeEnabled()
  expect(container.querySelector("audio")!.getAttribute("src")).toBeNull()
  // The rest of the panel still works.
  fireEvent.click(screen.getByRole("button", { name: "Démarrer" }))
  expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument()
  cleanup()
  // A refused start (stream down) gives the same message; an aborted start (quick pause) does not.
  mediaStub(async () => { throw new DOMException("down", "NotSupportedError") })
  await openRadio()
  fireEvent.click(await screen.findByRole("button", { name: "Lecture" }))
  expect(await screen.findByText(/Radio indisponible pour le moment/)).toBeInTheDocument()
  cleanup()
  mediaStub(async () => { throw new DOMException("aborted", "AbortError") })
  await openRadio()
  fireEvent.click(await screen.findByRole("button", { name: "Lecture" }))
  await act(async () => { await Promise.resolve() })
  expect(screen.queryByText(/Radio indisponible/)).toBeNull()
})

it("radio: none configured → a short note and no player", async () => {
  const { container } = await openRadio({ streams: [] })
  expect(await screen.findByText("Aucune radio proposée par votre enseignant.")).toBeInTheDocument()
  expect(container.querySelector("audio, iframe")).toBeNull()
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
  expect(answers("https://stream.nightride.fm/chillsynth.mp3")).toBe(false)
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
