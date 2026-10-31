import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { AttemptRewardsNote, ClassGoalPanel, GoalSettings, ProgressPanel, StudentRewardsSummary, levelProgress } from "./Rewards"
import { chime, confetti, motionAllowed, readSound } from "./celebrate"
import type { AttemptRewards, Rewards } from "./types"
import { setLanguage } from "../i18n"
import { rewardText, serverText } from "../i18n/server"

const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })

const LEVEL = { number: 2, name: "Analyste Junior", xp: 45, floor: 30, next_name: "Analyste Data", next_at: 80, max_level: false }
const REWARDS: Rewards = {
  streak: 3, best_streak: 4, level: LEVEL, badge_count: 2,
  badges: [
    { key: "first-mission", label: "Première mission réussie", hint: "Réussir une mission.", earned: true, earned_at: "2026-10-30T10:00:00Z" },
    { key: "objective:SQL-1", label: "Objectif atteint : Lire une jointure", hint: "Réussir toutes les missions de cet objectif.", earned: true, earned_at: null },
    { key: "streak-5", label: "Série de 5", hint: "Réussir 5 missions de suite du premier coup.", earned: false, earned_at: null },
  ],
  class_goal: { metric: "missions", metric_label: "missions réussies", target: 200, value: 120, percent: 60, custom: false, default_target: 200, milestone: 50,
    text: "La classe a réussi 120 missions sur 200" },
}
const ATTEMPT: AttemptRewards = { streak: 5, best_streak: 5, streak_mark: 5, xp_gained: 10, level: LEVEL, level_up: null, block_finished: false,
  new_badges: [{ key: "streak-5", label: "Série de 5" }] }

beforeEach(() => { localStorage.clear(); document.documentElement.classList.remove("reduce-motion") })
afterEach(() => { setLanguage("fr"); cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.querySelectorAll(".academy-confetti").forEach((node) => node.remove()) })

it("progress panel: named level with a progress bar, streak, and a kind badge collection; never mixed with the score", () => {
  wrap(<ProgressPanel rewards={REWARDS} />)
  expect(screen.getByText("Analyste Junior")).toBeInTheDocument()
  expect(screen.getByText("Niveau 2")).toBeInTheDocument()
  expect(screen.getByRole("img", { name: "45 points d’expérience, 35 avant Analyste Data" })).toBeInTheDocument()
  expect(screen.getByText("Pour le plaisir : ne compte jamais dans la note.")).toBeInTheDocument()
  expect(screen.getByText(/Série : 3/)).toBeInTheDocument()
  expect(screen.getByText("Badges : 2 sur 3")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Voir ma collection" }))
  const list = screen.getByRole("list", { name: "Collection de badges" })
  expect(list).toHaveTextContent("Obtenu le 30/10/2026")
  expect(list).toHaveTextContent("À découvrir : Réussir 5 missions de suite du premier coup.")
  expect(levelProgress({ ...LEVEL, max_level: true, next_at: null })).toEqual({ current: 1, span: 1 })
})

it("no streak yet: an invitation, never a reproach", () => {
  wrap(<ProgressPanel rewards={{ ...REWARDS, streak: 0 }} />)
  expect(screen.getByText("Réussissez une mission du premier coup pour lancer une série.")).toBeInTheDocument()
})

it("class goal: one shared bar, no name", () => {
  wrap(<ClassGoalPanel goal={REWARDS.class_goal!} />)
  expect(screen.getByRole("img", { name: "La classe a réussi 120 missions sur 200, 60 %" })).toBeInTheDocument()
  expect(screen.getByText("Toute la classe avance ensemble : aucun nom n’est affiché.")).toBeInTheDocument()
})

it("after a success: streak mark, XP and new badge; nothing at all after a miss", () => {
  const { rerender } = wrap(<AttemptRewardsNote rewards={ATTEMPT} correct />)
  expect(screen.getByText("Série : 5")).toBeInTheDocument()
  expect(screen.getByText("+10 XP")).toBeInTheDocument()
  expect(screen.getByText("5 missions de suite du premier coup : belle série !")).toBeInTheDocument()
  expect(screen.getByText("Série de 5")).toBeInTheDocument()
  rerender(<ChakraProvider value={system}><AttemptRewardsNote rewards={{ ...ATTEMPT, streak: 0, streak_mark: null, xp_gained: 0, new_badges: [] }} correct={false} /></ChakraProvider>)
  expect(screen.queryByTestId("attempt-rewards")).toBeNull()
})

it("a finished block throws discreet confetti, skipped with « Réduire les animations »", () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  const animate = vi.fn(() => ({ onfinish: null }))
  const original = Element.prototype.animate
  Element.prototype.animate = animate as unknown as Element["animate"]
  wrap(<AttemptRewardsNote rewards={{ ...ATTEMPT, block_finished: true }} correct />)
  expect(screen.getByText("Bloc terminé : bravo !")).toBeInTheDocument()
  const layer = document.querySelector(".academy-confetti")!
  expect(layer).toHaveAttribute("aria-hidden", "true")
  expect(layer.children).toHaveLength(28)
  expect(animate).toHaveBeenCalledTimes(28)
  layer.remove()
  document.documentElement.classList.add("reduce-motion")
  expect(motionAllowed()).toBe(false)
  expect(confetti()).toBe(false)
  expect(document.querySelector(".academy-confetti")).toBeNull()
  Element.prototype.animate = original
})

it("the sound is off by default, opt-in in the settings, and always off with reduced motion", () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  const start = vi.fn()
  class FakeAudio {
    currentTime = 0
    destination = {}
    createOscillator() { return { type: "", frequency: { value: 0 }, connect: (n: unknown) => n, start, stop() {} } }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n } }
    close() { return Promise.resolve() }
  }
  vi.stubGlobal("AudioContext", FakeAudio)
  expect(readSound()).toBe(false)
  expect(chime()).toBe(false)
  localStorage.setItem("shopflow:sound", "on")
  expect(chime()).toBe(true)
  expect(start).toHaveBeenCalledTimes(2)
  document.documentElement.classList.add("reduce-motion")
  expect(chime()).toBe(false)
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
  expect(readSound()).toBe(false)
})

it("teacher settings: choose blocks or missions and a target, empty = default", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(json(REWARDS.class_goal))
    .mockResolvedValueOnce(json({ ...REWARDS.class_goal, metric: "blocks", target: 30, value: 4, percent: 13, custom: true, text: "La classe a terminé 4 blocs sur 30" }))
  vi.stubGlobal("fetch", fetchMock)
  wrap(<GoalSettings assignmentId={7} />)
  expect(await screen.findByPlaceholderText("Par défaut : 200")).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText("Ce qui compte"), { target: { value: "blocks" } })
  fireEvent.change(screen.getByLabelText("Cible"), { target: { value: "30" } })
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
  expect(await screen.findByText("Objectif enregistré.")).toBeInTheDocument()
  const [url, init] = fetchMock.mock.calls[1]
  expect(url).toContain("/teacher/classes/7/goal")
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ metric: "blocks", target: 30 })
  fireEvent.change(screen.getByLabelText("Cible"), { target: { value: "0" } })
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
  await waitFor(() => expect(screen.getByText("La cible est un nombre entier de 1 à 10 000.")).toBeInTheDocument())
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it("teacher panel: level, streaks and earned badges of the student", () => {
  wrap(<StudentRewardsSummary rewards={REWARDS} />)
  const group = screen.getByRole("group", { name: "Progression (hors note)" })
  expect(group).toHaveTextContent("Analyste Junior · 45 XP")
  expect(group).toHaveTextContent("Série : 3 (meilleure : 4)")
  expect(group).toHaveTextContent("Première mission réussie")
  expect(group).not.toHaveTextContent("Série de 5")
})

it("in English: progress, badges and the class goal; a badge named after an objective keeps the course's words", () => {
  setLanguage("en")
  wrap(<><ProgressPanel rewards={REWARDS} /><ClassGoalPanel goal={REWARDS.class_goal!} /></>)
  expect(screen.getByText("Your progress")).toBeTruthy()
  expect(screen.getByText("Junior Analyst")).toBeTruthy()
  expect(screen.getByText("Level 2")).toBeTruthy()
  expect(screen.getByText("Streak: 3")).toBeTruthy()
  expect(screen.getByText(/missions passed on the first try/)).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "See my collection" }))
  expect(screen.getByText("First mission passed")).toBeTruthy()
  expect(screen.getByText("Objective reached: Lire une jointure")).toBeTruthy()
  expect(screen.getByText("To discover: Pass 5 missions in a row on the first try.")).toBeTruthy()
  expect(screen.getByText("The class has passed 120 missions out of 200")).toBeTruthy()
  expect(screen.queryByText(/Série|Votre progression|La classe/)).toBeNull()
})

it("in English: the server's badge and class goal notifications", () => {
  setLanguage("en")
  expect(serverText("Nouveau badge : Série de 5")).toBe("New badge: Streak of 5")
  expect(serverText("Objectif de classe : 50 % ! La classe a réussi 100 missions sur 200. Continuez ensemble."))
    .toBe("Class goal: 50 %! The class has passed 100 missions out of 200. Keep going together.")
  expect(serverText("Objectif de classe atteint : la classe a terminé 20 blocs sur 20. Bravo à toutes et à tous !"))
    .toBe("Class goal reached: the class has finished 20 blocks out of 20. Well done, everyone!")
  expect(rewardText("Tous les bonus : Python")).toBe("All bonuses: Python")
  setLanguage("fr")
  expect(rewardText("Série de 5")).toBe("Série de 5")
})
