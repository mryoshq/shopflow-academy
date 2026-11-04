import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { setLanguage } from "../i18n"
import { serverText } from "../i18n/server"
import { NOTIFICATION_POLL_MS, NotificationProvider } from "../live/notifications"
import { dueText, timeLeft } from "../student/NextDeadline"
import { Rafi } from "./Rafi"

/** ADR-0047: Rafi presents the announcements; the owner's image is shown as it is. */
const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const note = (id: number, kind: string, text: string, data: Record<string, unknown> = {}) =>
  ({ id, kind, text, data, sender: kind === "message" ? "demo.enseignant" : null, created_at: new Date().toISOString(), read_at: null })
beforeEach(() => { document.cookie = `academy_csrf=${"E".repeat(43)}; Path=/`; window.localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

function stub(items: ReturnType<typeof note>[], sounds = true) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.startsWith("/api/v1/notifications?")) return json({ unread: items.length, items })
    if (url.endsWith("/student/rafi")) return json({ sounds })
    return json({ ok: true })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}
const wrap = () => render(<ChakraProvider value={system}><NotificationProvider><Rafi /></NotificationProvider></ChakraProvider>)

it("shows the owner's image as it is, presents the announcements in a queue, with their link", async () => {
  const fetchMock = stub([note(2, "message", "Pensez à la pause de 10 h."),
    note(1, "project_reminder", "Rappel : « Conception » est attendu le 21/11/2026 à 23:59. Il vous reste 3 jours.", { link: "#/projet" })])
  wrap()
  const bubble = await screen.findByTestId("rafi-bubble")
  expect(bubble).toHaveAttribute("role", "status")
  expect(bubble).toHaveTextContent("Rappel : « Conception »")
  expect(bubble).toHaveTextContent("1 sur 2")
  expect(within(bubble).getByRole("link", { name: "Ouvrir l’espace projet" })).toHaveAttribute("href", "#/projet")
  const image = screen.getByTestId("rafi").querySelector("img")!
  expect(image.getAttribute("srcset")).toBe("/rafi/rafi-144.webp 144w, /rafi/rafi-216.webp 216w, /rafi/rafi-512.webp 512w")
  expect(image.getAttribute("sizes")).toBe("72px")
  expect(screen.getByRole("button", { name: "Rafi : 2 annonces" })).toBeInTheDocument()
  // The announcements are Rafi's, not toasts.
  expect(within(screen.getByRole("region", { name: "Notifications récentes" })).queryByText(/Conception/)).toBeNull()
  fireEvent.click(within(bubble).getByRole("button", { name: "J’ai lu, suivante" }))
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/notifications/1/read", expect.objectContaining({ method: "POST" }))
  expect(await screen.findByText("Pensez à la pause de 10 h.")).toBeInTheDocument()
  expect(screen.getByTestId("rafi-bubble")).toHaveTextContent("Message · demo.enseignant")
  fireEvent.click(screen.getByRole("button", { name: "Fermer l’annonce" }))
  expect(screen.queryByTestId("rafi-bubble")).toBeNull()
})

it("ignores the former folded preference, has no toolbar, and still blinks", async () => {
  vi.useFakeTimers()
  vi.spyOn(Math, "random").mockReturnValue(0)  // first blink after 3.5 s
  stub([])
  window.localStorage.setItem("shopflow:rafi:collapsed", "1")
  wrap()
  await act(async () => { await vi.advanceTimersByTimeAsync(50) })
  const lid = screen.getByTestId("rafi-lid-l")
  expect(lid).toHaveAttribute("data-closed", "false")
  await act(async () => { await vi.advanceTimersByTimeAsync(3500) })
  expect(screen.getByTestId("rafi-lid-l")).toHaveAttribute("data-closed", "true")
  expect(screen.getByTestId("rafi-lid-r")).toHaveAttribute("data-closed", "true")
  await act(async () => { await vi.advanceTimersByTimeAsync(150) })
  expect(screen.getByTestId("rafi-lid-l")).toHaveAttribute("data-closed", "false")
  vi.useRealTimers()
  vi.restoreAllMocks()
  expect(screen.getByRole("button", { name: "Rafi, votre assistant" })).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /Replier Rafi|Afficher Rafi|sons de Rafi/ })).toBeNull()
  expect(screen.getByTestId("rafi").querySelector("img")!.style.clipPath).toMatch(/^polygon\(/)
})

it("« Réduire les animations » freezes him: no blink, no reaction", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  window.localStorage.setItem("shopflow:motion", "reduce")
  stub([])
  wrap()
  const face = await screen.findByRole("button", { name: "Rafi, votre assistant" })
  fireEvent.click(face)
  const pose = face.firstElementChild as HTMLElement
  await act(async () => { vi.advanceTimersByTime(9000) })
  expect(screen.getAllByTestId(/rafi-lid-/).every((item) => item.getAttribute("data-closed") === "false")).toBe(true)
  expect(pose.style.transform === "none" || pose.style.transform === "").toBe(true)
})

it("no sound before an interaction, and none when the teacher muted the class", async () => {
  const created = vi.fn()
  class FakeAudio { currentTime = 0; destination = {}
    constructor() { created() }
    createOscillator() { return { type: "", frequency: { value: 0 }, connect: (x: unknown) => x, start() {}, stop() {} } }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (x: unknown) => x } } }
  vi.stubGlobal("AudioContext", FakeAudio)
  stub([note(5, "open_blocks", "Le bloc « Données » vous attend : il reste des missions à terminer. On continue ?", { link: "#/mission/3" })], false)
  wrap()
  expect(await screen.findByTestId("rafi-bubble")).toHaveTextContent("Bloc à terminer")
  expect(within(screen.getByTestId("rafi-bubble")).getByRole("link", { name: "Y aller" })).toHaveAttribute("href", "#/mission/3")
  expect(created).not.toHaveBeenCalled()  // nothing before a click or a key
  fireEvent.pointerDown(document.body)
  fireEvent.click(screen.getByRole("button", { name: "Rafi : 1 annonce" }))
  expect(created).not.toHaveBeenCalled()  // the class is muted by the teacher
  expect(screen.queryByRole("button", { name: /sons de Rafi/ })).toBeNull()
})

it("countdown, Morocco date from the server, and the English texts of the announcements", () => {
  const now = Date.parse("2026-11-18T09:00:00Z")
  expect(timeLeft("2026-11-21T23:59:00Z", now)).toBe("dans 3 j 14 h")
  expect(timeLeft("2026-11-18T12:05:00Z", now)).toBe("dans 3 h 05")
  expect(timeLeft("2026-11-18T09:12:00Z", now)).toBe("dans 12 min")
  expect(dueText("2026-11-21T23:59")).toMatch(/samedi 21 novembre.*23:59/)
  setLanguage("en")
  try {
    expect(serverText("C’est aujourd’hui : « Rendu final » est attendu à 23:59. Vous y êtes presque !")).toBe("It’s today: “Rendu final” is due at 23:59. You’re almost there!")
    expect(serverText("Le bloc « Données » vous attend : il reste des missions à terminer. On continue ?"))
      .toBe("Block “Données” is waiting for you: some missions are still to finish. Shall we carry on?")
    expect(timeLeft("2026-11-21T23:59:00Z", now)).toBe("in 3 d 14 h")
  } finally { setLanguage("fr") }
})

it("« Que faire maintenant ? » : a click shows the next step computed by the server, with its link", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.startsWith("/api/v1/notifications?")) return json({ unread: 0, items: [] })
    if (url.endsWith("/student/rafi")) return json({ sounds: false, next: { kind: "mission", title: "Choisir le modèle document", link: "#/mission/42", started: false } })
    return json({ ok: true })
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap()
  fireEvent.click(await screen.findByRole("button", { name: "Rafi, votre assistant" }))
  const bubble = await screen.findByTestId("rafi-next")
  expect(bubble).toHaveAttribute("role", "status")
  expect(bubble).toHaveTextContent("Prochaine étape : « Choisir le modèle document ».")
  expect(within(bubble).getByRole("link", { name: "Y aller" })).toHaveAttribute("href", "#/mission/42")
  fireEvent.click(within(bubble).getByRole("button", { name: "Fermer" }))
  expect(screen.queryByTestId("rafi-next")).toBeNull()
})

it("next step texts cover a started mission, a bonus, a deadline and nothing to do", async () => {
  const { nextStepText } = await import("./Rafi")
  expect(nextStepText({ kind: "mission", title: "A", link: "#/mission/1", started: true })).toBe("Reprenez « A » : vous l’avez commencée.")
  expect(nextStepText({ kind: "bonus", title: "B", link: "#/mission/2", started: false })).toContain("Un bonus vous tente ? « B »")
  expect(nextStepText({ kind: "deadline", title: "Conception", due_local: "2026-11-21T23:59", link: "#/projet" })).toContain("le 21/11 à 23:59")
  expect(nextStepText({ kind: "done" })).toBe("Tout est à jour. Revoyez vos cartes ou profitez de la pause.")
})

it("closes an automatic bubble when class silence changes and keeps help and the queue available", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  let silent = false
  const items = [note(1, "session_recap", "Il vous reste 2 missions dans les blocs ouverts.")]
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
    if (url.includes("/notifications?")) return json({ unread: 1, items: url.endsWith("after=0") ? items : [] })
    if (url.includes("/student/rafi")) return json({ sounds: true, silent, scope: "fictif", next: { kind: "done" } })
    return json({ ok: true })
  }))
  wrap()
  expect(await screen.findByTestId("rafi-bubble")).toHaveTextContent("Récapitulatif de séance")
  silent = true
  await act(async () => { await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS) })
  expect(screen.queryByTestId("rafi-bubble")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Que faire maintenant ?" }))
  expect(await screen.findByText(/Tout est à jour/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Rafi : 1 annonce" }))
  expect(screen.getByTestId("rafi-bubble")).toHaveTextContent("Il vous reste 2 missions")
})
