import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { MissionPlayer } from "./MissionPlayer"
import { StudentDashboard, continueTarget } from "./StudentDashboard"
import { ChoiceActivity, DataView, MatchingActivity, ReorderActivity, isAnswerComplete } from "./activities"
import type { Answer, Dashboard, PlayerDefinition, PlayerMission } from "./types"

const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
const json = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })

const base: PlayerDefinition = {
  kind: "single_choice", scenario: "Une commande fictive à Tanzar.", instructions: "Que faites-vous ?",
  choices: [{ id: "c1", label: "Agréger avant la jointure" }, { id: "c2", label: "SUM(DISTINCT)" }],
  match_targets: [], display_data: null, resources: [], hint_count: 2, estimated_duration_minutes: 10,
}

function mission(overrides: Partial<PlayerMission> = {}): PlayerMission {
  return {
    mission_version_id: 11, release_id: 3, course_title: "Démonstration — Données ShopFlow", is_demo: true,
    module: "Module", chapter: "Chapitre", title: "Frais de livraison", position: 1, total: 3, previous_id: null, next_id: 12,
    ai_enabled: false, status: "not_started", locked_by: [], definition: base, hints: [], hint_count: 2,
    attempts_count: 0, last_attempt: null, explanation: null, score: { best: 0, possible: 10, bonus: false }, ...overrides,
  }
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  document.cookie = `academy_csrf=${"B".repeat(43)}; Path=/`
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it("single choice exposes a radio group usable with the keyboard", () => {
  const onChange = vi.fn()
  wrap(<ChoiceActivity definition={base} answer={{ choice_ids: [], pairs: {} }} onChange={onChange} name="m" />)
  const radios = screen.getAllByRole("radio")
  expect(radios).toHaveLength(2)
  fireEvent.click(screen.getByLabelText("SUM(DISTINCT)"))
  expect(onChange).toHaveBeenCalledWith({ choice_ids: ["c2"], pairs: {} })
})

it("multiple choice toggles several checkboxes and says so", () => {
  const definition = { ...base, kind: "multiple_choice" as const }
  let answer: Answer = { choice_ids: ["c1"], pairs: {} }
  const onChange = vi.fn((next: Answer) => { answer = next })
  wrap(<ChoiceActivity definition={definition} answer={answer} onChange={onChange} name="m" />)
  expect(screen.getAllByRole("checkbox")).toHaveLength(2)
  fireEvent.click(screen.getByLabelText("SUM(DISTINCT)"))
  expect(answer.choice_ids).toEqual(["c1", "c2"])
  expect(screen.getByText("Plusieurs réponses peuvent être justes.")).toBeInTheDocument()
})

it("reorder moves steps with buttons and announces the new position", () => {
  const definition = { ...base, kind: "reorder" as const, choices: [{ id: "a", label: "Lire" }, { id: "b", label: "Charger" }, { id: "c", label: "Valider" }] }
  let answer: Answer = { choice_ids: ["a", "b", "c"], pairs: {} }
  const { rerender } = wrap(<ReorderActivity definition={definition} answer={answer} onChange={(next) => { answer = next }} name="m" />)
  expect(screen.getByRole("button", { name: "Monter « Lire »" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "Monter « Valider »" }))
  expect(answer.choice_ids).toEqual(["a", "c", "b"])
  expect(screen.getByText("« Valider » est maintenant en position 2 sur 3.")).toBeInTheDocument()
  rerender(<ChakraProvider value={system}><ReorderActivity definition={definition} answer={answer} onChange={() => undefined} name="m" /></ChakraProvider>)
  expect(within(screen.getByRole("list", { name: "Étapes à ordonner" })).getAllByRole("listitem")[1]).toHaveTextContent("Valider")
})

it("matching uses one labelled select per item and requires every pair", () => {
  const definition = { ...base, kind: "matching" as const, match_targets: [{ id: "t1", label: "Dédupliquer" }, { id: "t2", label: "Rejeter" }] }
  let answer: Answer = { choice_ids: [], pairs: {} }
  wrap(<MatchingActivity definition={definition} answer={answer} onChange={(next) => { answer = next }} name="m" />)
  fireEvent.change(screen.getByLabelText("Associer « Agréger avant la jointure »"), { target: { value: "t2" } })
  expect(answer.pairs).toEqual({ c1: "t2" })
  expect(isAnswerComplete(definition, answer)).toBe(false)
  expect(isAnswerComplete(definition, { choice_ids: [], pairs: { c1: "t2", c2: "t1" } })).toBe(true)
})

it("charts always offer an accessible table", () => {
  wrap(<DataView data={{ kind: "bar_chart", title: "Ventes par ville", labels: ["Tanzar", "Oued Lmal"], values: [120, 80], unit: "DH" }} />)
  expect(screen.getByText("Tanzar : 120 DH ; Oued Lmal : 80 DH")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Afficher les données en tableau" }))
  expect(screen.getByRole("table")).toHaveTextContent("Oued Lmal")
  expect(screen.getByRole("button", { name: "Afficher le graphique" })).toHaveAttribute("aria-expanded", "true")
})

it("dashboard shows courses, locked missions and a Continue target", async () => {
  const data: Dashboard = { display_name: "demo.etudiant01", ai_enabled: false, courses: [{
    release_id: 3, title: "Démonstration — Données ShopFlow", description: "", version: 1, is_demo: true, resources: [],
    score: { core_points: 12.5, core_possible: 20, bonus_points: 0, bonus_possible: 5, completed: 1, total: 3 },
    missions: [
      { mission_version_id: 11, title: "Frais", module: "M", chapter: "C", kind: "single_choice", estimated_duration_minutes: 10, status: "completed", locked_by: [], best_points: 10, possible: 10, bonus: false },
      { mission_version_id: 12, title: "CSV", module: "M", chapter: "C", kind: "multiple_choice", estimated_duration_minutes: 10, status: "in_progress", locked_by: [], best_points: 2.5, possible: 10, bonus: false },
      { mission_version_id: 13, title: "Ordre", module: "M", chapter: "C", kind: "reorder", estimated_duration_minutes: 8, status: "locked", locked_by: ["CSV"], best_points: 0, possible: 5, bonus: true },
    ] }] }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(data)))
  const navigate = vi.fn()
  wrap(<StudentDashboard navigate={navigate} />)
  expect(await screen.findByRole("heading", { name: "Bonjour, demo.etudiant01" })).toBeInTheDocument()
  expect(screen.getByText("Démonstration")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Verrouillée : Ordre" })).toBeDisabled()
  expect(screen.getByText("Se débloque après : CSV")).toBeInTheDocument()
  expect(screen.getByRole("img", { name: "12,5 points sur 20" })).toBeInTheDocument()
  expect(screen.getByText(/Bonus :/).parentElement).toHaveTextContent("Bonus : 0 / 5 pts, comptés à part.")
  expect(screen.getByText(/2,5 \/ 10 pts/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: /Continuer : CSV/ }))
  expect(navigate).toHaveBeenCalledWith("/mission/12")
  expect(continueTarget(data, 11)?.mission_version_id).toBe(12)
})

it("dashboard network error offers a retry", async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue(json({ display_name: "x", ai_enabled: false, courses: [] }))
  vi.stubGlobal("fetch", fetchMock)
  wrap(<StudentDashboard navigate={vi.fn()} />)
  expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de charger")
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
  expect(await screen.findByText("Aucun cours pour le moment")).toBeInTheDocument()
})

it("player submits with an idempotency key, shows server feedback and reuses the key after a network failure", async () => {
  const calls: { url: string; body?: { idempotency_key: string; answer: Answer } }[] = []
  let failNext = true
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url.endsWith("/attempts")) {
      if (failNext) { failNext = false; throw new TypeError("offline") }
      return json({ attempt_id: 5, correct: false, replayed: false, attempts_count: 1, explanation: null, points: 0, score: { best: 0, possible: 10, bonus: false },
        feedback: [{ choice_id: "c2", text: "Juste ici par hasard." }] }, 201)
    }
    return json(mission())
  }))
  wrap(<MissionPlayer missionId={11} navigate={vi.fn()} />)
  expect(await screen.findByRole("heading", { name: "Frais de livraison" })).toBeInTheDocument()
  expect(screen.getByText("Démonstration")).toBeInTheDocument()
  const submit = screen.getByRole("button", { name: "Tester ma décision" })
  expect(submit).toBeDisabled()
  fireEvent.click(screen.getByLabelText("SUM(DISTINCT)"))
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tester ma décision" })) })
  expect(await screen.findByText("Connexion interrompue : votre réponse n’a pas pu être envoyée.")).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Renvoyer ma décision" })) })
  expect(await screen.findByText("À revoir")).toBeInTheDocument()
  expect(screen.getByText("Juste ici par hasard.")).toBeInTheDocument()
  const attempts = calls.filter((call) => call.url.endsWith("/attempts"))
  expect(attempts).toHaveLength(2)
  expect(attempts[0].body?.idempotency_key).toBe(attempts[1].body?.idempotency_key)
  expect(attempts[0].body?.answer).toEqual({ choice_ids: ["c2"], pairs: {} })
  expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument()
  expect(screen.queryByText(/correct_ids/)).not.toBeInTheDocument()
})

it("player shows a correct result, explanation and next mission", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => url.endsWith("/attempts")
    ? json({ attempt_id: 6, correct: true, replayed: false, attempts_count: 1, feedback: [], explanation: "30 + 40 = 70 DH.", points: 10, score: { best: 10, possible: 10, bonus: false } }, 201)
    : json(mission())))
  const navigate = vi.fn()
  wrap(<MissionPlayer missionId={11} navigate={navigate} />)
  fireEvent.click(await screen.findByLabelText("Agréger avant la jointure"))
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tester ma décision" })) })
  expect(await screen.findByText("Bonne décision")).toBeInTheDocument()
  expect(screen.getByText("30 + 40 = 70 DH.")).toBeInTheDocument()
  expect(screen.getByText(/Meilleur score conservé : 10 pts/)).toBeInTheDocument()
  expect(screen.getByText("Meilleur score : 10 / 10 pts")).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole("button", { name: /Mission suivante/ })[0])
  expect(navigate).toHaveBeenCalledWith("/mission/12")
})

it("player reveals hints one at a time and remembers consumed hints", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => url.endsWith("/hints")
    ? json({ hints: ["Comptez les lignes de C-101."], hint_count: 2 })
    : json(mission())))
  wrap(<MissionPlayer missionId={11} navigate={vi.fn()} />)
  const hintButton = await screen.findByRole("button", { name: "Afficher un indice (1/2)" })
  await act(async () => { fireEvent.click(hintButton) })
  expect(await screen.findByText("Comptez les lignes de C-101.")).toBeInTheDocument()
  expect(screen.getByText(/Indice déjà consulté/)).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Indice suivant (2/2)" })).toBeInTheDocument()
  expect(screen.getByText(/Assistant IA désactivé/)).toBeInTheDocument()
})

it("player shows the locked state without content", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(mission({ status: "locked", locked_by: ["Valider un import CSV"], definition: null }))))
  wrap(<MissionPlayer missionId={13} navigate={vi.fn()} />)
  expect(await screen.findByText("Mission verrouillée")).toBeInTheDocument()
  expect(screen.getByText("Terminez d’abord : Valider un import CSV.")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Tester ma décision" })).not.toBeInTheDocument()
})

it("player restores a draft saved before the session expired and shows already-solved state", async () => {
  sessionStorage.setItem("shopflow:draft:11", JSON.stringify({ choice_ids: ["c2"], pairs: {} }))
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(mission({ status: "completed", hints: ["Indice 1"], last_attempt: { correct: true, created_at: "2026-10-28T08:00:00Z" } }))))
  wrap(<MissionPlayer missionId={11} navigate={vi.fn()} />)
  expect(await screen.findByLabelText("SUM(DISTINCT)")).toBeChecked()
  expect(screen.getByText("Vous avez déjà réussi cette mission.")).toBeInTheDocument()
  expect(screen.getByText("Indice 1")).toBeInTheDocument()
})

it("player reports a mission that is not assigned", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "mission not found" }, 404)))
  wrap(<MissionPlayer missionId={99} navigate={vi.fn()} />)
  expect(await screen.findByRole("alert")).toHaveTextContent("ne vous est pas attribuée")
})

it("player shows the attempt history on demand", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => url.endsWith("/attempts")
    ? json([{ id: 2, created_at: "2026-10-28T08:05:00Z", correct: true, points: 10 }, { id: 1, created_at: "2026-10-28T08:00:00Z", correct: false, points: 0 }])
    : json(mission({ attempts_count: 2, status: "completed", score: { best: 10, possible: 10, bonus: false } }))))
  wrap(<MissionPlayer missionId={11} navigate={vi.fn()} />)
  const toggle = await screen.findByRole("button", { name: "Historique de vos essais (2)" })
  await act(async () => { fireEvent.click(toggle) })
  expect(await screen.findByText("Réussi · 10 pts")).toBeInTheDocument()
  expect(screen.getByText("À revoir · 0 pts")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Masquer l’historique" })).toHaveAttribute("aria-expanded", "true")
})
