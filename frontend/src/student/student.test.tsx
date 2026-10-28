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
    ai_enabled: false, paused: false, status: "not_started", locked_by: [], definition: base, hints: [], hint_count: 2,
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
    score: { core_points: 12.5, core_possible: 20, bonus_points: 0, bonus_possible: 5, completed: 1, total: 3 }, paused: false,
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

it("dashboard groups missions in blocks: open blocks list them, closed blocks are 'Bientôt disponible'", async () => {
  const row = (id: number, title: string, bonus = false) => ({ mission_version_id: id, title, module: "SQL", chapter: "Bloc 1", kind: "single_choice" as const,
    estimated_duration_minutes: 15, status: "not_started" as const, locked_by: [], best_points: 0, possible: 5, bonus, block_id: 1 })
  const dashboard: Dashboard = { display_name: "salma", ai_enabled: false, courses: [{
    release_id: 1, title: "Cours principal", description: "", version: 2, is_demo: false, resources: [], paused: false,
    score: { core_points: 0, core_possible: 10, bonus_points: 0, bonus_possible: 5, completed: 0, total: 3 },
    modules: [{ title: "Module SQL", blocks: [
      { id: 1, title: "Bloc 1 : le grain", open: true, mission_count: 1, bonus_count: 1, completed_count: 0, done: false, mission_ids: [21, 22] },
      { id: 2, title: "Bloc 2 : fenêtres", open: false, mission_count: 1, bonus_count: 0, completed_count: 0, done: false, mission_ids: [] },
    ] }],
    missions: [row(22, "Défi bonus", true), row(21, "Pourquoi 70 DH deviennent 100 DH")],
  }] }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(dashboard)))
  wrap(<StudentDashboard navigate={vi.fn()} />)
  const open = await screen.findByRole("group", { name: "Bloc : Bloc 1 : le grain" })
  expect(within(open).getByText("Ouvert")).toBeInTheDocument()
  expect(within(open).getByText("Bonus")).toBeInTheDocument()
  const closed = screen.getByRole("group", { name: "Bloc : Bloc 2 : fenêtres" })
  expect(within(closed).getByText("Bientôt disponible")).toBeInTheDocument()
  expect(within(closed).queryByRole("button")).not.toBeInTheDocument()
  // "Continuer" goes to the first main mission not solved, before the bonus.
  expect(screen.getByRole("button", { name: /Continuer : Pourquoi 70 DH/ })).toBeInTheDocument()
  expect(continueTarget(dashboard, 22)?.mission_version_id).toBe(21)
})

it("player sends a help request with an optional message and shows 'reçue'", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/student/missions/11") && init?.method === "GET") return json(mission())
    if (url.endsWith("/student/missions/11/help") && init?.method === "POST") return json({ id: 4, status: "pending", message: "Le total", created_at: new Date().toISOString(), handled_at: null }, 201)
    throw new Error(`Unexpected ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<MissionPlayer missionId={11} navigate={vi.fn()} />)
  fireEvent.click(await screen.findByRole("button", { name: "J’ai besoin d’une explication" }))
  fireEvent.change(screen.getByLabelText("Ce qui vous bloque (facultatif)"), { target: { value: "Le total" } })
  fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }))
  expect(await screen.findByText("Demande reçue")).toBeInTheDocument()
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/help"))
  expect(JSON.parse(call![1].body)).toEqual({ message: "Le total" })
  expect(call![1].headers["X-CSRF-Token"]).toBe("B".repeat(43))
  expect(screen.queryByRole("button", { name: "J’ai besoin d’une explication" })).not.toBeInTheDocument()
})

it("player shows a handled help request and lets the student ask again", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(mission({ help_request: { id: 4, status: "handled", message: "", created_at: "2026-10-28T09:00:00Z", handled_at: "2026-10-28T09:05:00Z" } }))))
  wrap(<MissionPlayer missionId={11} navigate={vi.fn()} />)
  expect(await screen.findByText("Demande traitée")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "J’ai besoin d’une explication" })).toBeInTheDocument()
})

it("renders a line chart with gaps, a table alternative, code, comparison and lesson lists", async () => {
  const { DataView } = await import("./activities")
  const { LessonBody, tokenize } = await import("./displays")
  wrap(<DataView data={{ kind: "line_chart", title: "Rejets", labels: ["Lun", "Mar", "Mer"], unit: "lignes",
    series: [{ name: "Avant", values: [40, null, 42] }, { name: "Après", values: [10, null, 9] }] }} />)
  expect(screen.getByText("Rejets")).toBeInTheDocument()
  expect(screen.getByText(/donnée absente \(ce n’est pas zéro\)/)).toBeInTheDocument()
  expect(screen.getByText(/Avant : Lun 40 lignes, Mar donnée absente/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Afficher les données en tableau" }))
  expect(screen.getByRole("columnheader", { name: "Après (lignes)" })).toBeInTheDocument()
  cleanup()
  wrap(<DataView data={{ kind: "comparison", items: [
    { kind: "code", language: "sql", title: "Script de Hamza", code: "INSERT INTO orders VALUES (1, 'a'); -- simple" },
    { kind: "table", title: "Résultat", columns: ["total"], rows: [[70]] }] }} />)
  expect(screen.getByRole("group", { name: "Comparaison côte à côte" })).toBeInTheDocument()
  expect(screen.getByLabelText("Script de Hamza (SQL, 1 ligne)")).toHaveTextContent("INSERT INTO orders VALUES (1, 'a'); -- simple")
  expect(screen.getByText("Résultat")).toBeInTheDocument()
  expect(tokenize("SELECT 'a' -- c", "sql").map((token) => token.kind)).toEqual(["keyword", "plain", "string", "plain", "comment"])
  cleanup()
  wrap(<LessonBody body={"Le grain d'une table.\n\nDans ShopFlow :\n- orders : une commande ;\n- order_items : un article."} />)
  expect(screen.getAllByRole("listitem")).toHaveLength(2)
})

it("a lesson is marked as understood once and offers the next mission", async () => {
  const lesson = mission({ definition: { ...base, kind: "lesson", scenario: "", instructions: "", choices: [], body: "Le grain d'une table.", hint_count: 0 }, hint_count: 0 })
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/understood") && init?.method === "POST") return json({ attempt_id: 1, correct: true, replayed: false, attempts_count: 1, points: 0, score: { best: 0, possible: 0, bonus: false }, feedback: [], explanation: null }, 201)
    return json(lesson)
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<MissionPlayer missionId={11} navigate={vi.fn()} />)
  expect(await screen.findByText("Le grain d'une table.")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Tester ma décision" })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "J’ai compris" }))
  expect(await screen.findByText("Leçon comprise")).toBeInTheDocument()
  expect(screen.getAllByRole("button", { name: /Mission suivante/ }).length).toBeGreaterThan(0)
})

it("preconfigured runs show their code; a SQL challenge shows its starting query", async () => {
  const withRun = mission({ definition: { ...base, run: [{ id: "q1", label: "Exécuter la requête actuelle", language: "sql", code: "SELECT SUM(total) FROM orders;" }] } })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(withRun)))
  wrap(<MissionPlayer missionId={11} navigate={vi.fn()} />)
  expect(await screen.findByLabelText(/Exécuter la requête actuelle \(SQL/)).toHaveTextContent("SELECT SUM(total) FROM orders;")
  cleanup()
  const challenge = mission({ definition: { ...base, kind: "sql_challenge", choices: [], starter_sql: "SELECT city FROM customers;" } })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(challenge)))
  wrap(<MissionPlayer missionId={11} navigate={vi.fn()} />)
  expect(await screen.findByLabelText("Votre requête")).toHaveValue("SELECT city FROM customers;")
  expect(screen.queryByRole("button", { name: "Tester ma décision" })).not.toBeInTheDocument()
})

it("a preconfigured run shows its result table, and a timeout is explained", async () => {
  const withRun = mission({ definition: { ...base, run: [{ id: "q1", label: "Exécuter la requête actuelle", language: "sql", code: "SELECT 1;" }] } })
  let calls = 0
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/runs/q1") && init?.method === "POST") {
      calls += 1
      return calls === 1 ? json({ kind: "sql", columns: ["total"], rows: [[100]], truncated: false, elapsed_ms: 4 }) : json({ detail: "délai dépassé (3 secondes au plus)" }, 504)
    }
    return json(withRun)
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<MissionPlayer missionId={11} navigate={vi.fn()} />)
  fireEvent.click(await screen.findByRole("button", { name: "Exécuter : Exécuter la requête actuelle" }))
  expect(await screen.findByRole("columnheader", { name: "total" })).toBeInTheDocument()
  expect(screen.getByText(/Résultat : 1 ligne/)).toBeInTheDocument()
  expect(fetchMock.mock.calls.find(([url]) => String(url).endsWith("/runs/q1"))?.[1].body).toBeUndefined()
  fireEvent.click(screen.getByRole("button", { name: "Exécuter : Exécuter la requête actuelle" }))
  expect(await screen.findByText("La requête a dépassé le délai de 3 secondes.")).toBeInTheDocument()
})

it("the SQL challenge sends the edited query, encourages after a miss and congratulates on success", async () => {
  const challenge = mission({ definition: { ...base, kind: "sql_challenge", choices: [], starter_sql: "SELECT city FROM customers;" }, score: { best: 0, possible: 5, bonus: true } })
  let attempt = 0
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/sql") && init?.method === "POST") {
      attempt += 1
      const correct = attempt === 2
      return json({ attempt_id: attempt, correct, replayed: false, attempts_count: attempt, points: correct ? 5 : 0, score: { best: correct ? 5 : 0, possible: 5, bonus: true },
        feedback: [], explanation: correct ? "Il fallait trier." : null, result: { columns: ["city"], rows: [["Tanzar"]], truncated: false, elapsed_ms: 3 } }, 201)
    }
    return json(challenge)
  })
  vi.stubGlobal("fetch", fetchMock)
  wrap(<MissionPlayer missionId={11} navigate={vi.fn()} />)
  const editor = await screen.findByLabelText("Votre requête")
  fireEvent.change(editor, { target: { value: "SELECT city FROM customers ORDER BY 1" } })
  fireEvent.click(screen.getByRole("button", { name: "Exécuter et vérifier" }))
  expect(await screen.findByText("Presque ! Le résultat diffère encore : réessayez.")).toBeInTheDocument()
  const sent = JSON.parse(fetchMock.mock.calls.find(([url]) => String(url).endsWith("/sql"))![1].body)
  expect(sent.sql).toBe("SELECT city FROM customers ORDER BY 1")
  fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true })
  expect(await screen.findByText(/Bravo, c’est le résultat attendu \(\+5 pts bonus\)/)).toBeInTheDocument()
  expect(screen.getByText("Il fallait trier.")).toBeInTheDocument()
})

it("the studio leaves Markdown-only activities to the course source", async () => {
  const { isMarkdownOnly } = await import("../MissionEditor")
  const choice = { schema_version: 1 as const, kind: "single_choice" as const, scenario: "s", instructions: "i", objective_ids: [1], prerequisite_mission_ids: [],
    choices: [], correct_ids: [], match_targets: [], correct_pairs: {}, action_id: null, display_data: null, resources: [], hints: [], feedback: {},
    max_points: 5, estimated_duration_minutes: 10, bonus: false }
  expect(isMarkdownOnly(choice)).toBe(false)
  expect(isMarkdownOnly({ ...choice, kind: "lesson" })).toBe(true)
  expect(isMarkdownOnly({ ...choice, display_data: { kind: "code", language: "sql", code: "SELECT 1" } })).toBe(true)
  expect(isMarkdownOnly({ ...choice, run: [{ id: "q", label: "q", sql: "SELECT 1" }] })).toBe(true)
})
