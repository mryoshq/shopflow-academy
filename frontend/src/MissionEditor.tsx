import { t, msg } from "./i18n"
import { useEffect, useState } from "react"
import { Badge, Box, Button, Field, Flex, Heading, Input, NativeSelect, Stack, Text, Textarea } from "@chakra-ui/react"
import type { BarChartDisplay, Choice, CourseTree, DisplayData, Mission, MissionDefinition, MissionKind, TableDisplay } from "./studioTypes"

const kinds: { value: MissionKind; label: string }[] = [
  { value: "single_choice", label: msg("Choix unique") },
  { value: "multiple_choice", label: msg("Choix multiples") },
  { value: "true_false", label: msg("Vrai ou faux") },
  { value: "reorder", label: msg("Remettre en ordre") },
  { value: "matching", label: msg("Associer des éléments") },
  { value: "data_interpretation", label: msg("Lire des données") },
  { value: "scenario_choice", label: msg("Décision sur un scénario") },
  { value: "guided_simulation", label: msg("Simulation guidée") },
]

const actions = [
  { value: "choose_shipping_rule", label: msg("Choisir une règle de livraison") },
  { value: "choose_quality_rule", label: msg("Choisir une règle de qualité") },
  { value: "choose_incident_response", label: msg("Réagir à un incident") },
]

function defaultDraft(objectiveId?: number): MissionDefinition {
  return {
    schema_version: 1, kind: "single_choice", scenario: "", instructions: "",
    objective_ids: objectiveId ? [objectiveId] : [], prerequisite_mission_ids: [],
    choices: [{ id: "option-1", label: "" }, { id: "option-2", label: "" }],
    correct_ids: ["option-1"], match_targets: [], correct_pairs: {}, action_id: null,
    display_data: null, resources: [], hints: [], feedback: {}, max_points: 10,
    estimated_duration_minutes: 15, bonus: false, explanation: "", scoring: "all_or_nothing",
  }
}

function isDefinition(value: unknown): value is MissionDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  const choices = (list: unknown) => Array.isArray(list) && list.every((entry) =>
    entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.label === "string")
  const numbers = (list: unknown) => Array.isArray(list) && list.every((entry) => typeof entry === "number")
  const strings = (list: unknown) => Array.isArray(list) && list.every((entry) => typeof entry === "string")
  const display = item.display_data
  const validDisplay = display === null || (typeof display === "object" && display !== null && (
    ("kind" in display && display.kind === "table" && "columns" in display && strings(display.columns) && "rows" in display && Array.isArray(display.rows) && display.rows.every((row) => Array.isArray(row) && row.every((cell) => cell === null || ["string", "number", "boolean"].includes(typeof cell)))) ||
    ("kind" in display && display.kind === "bar_chart" && "title" in display && typeof display.title === "string" && "unit" in display && typeof display.unit === "string" && "labels" in display && strings(display.labels) && "values" in display && numbers(display.values))
  ))
  return item.schema_version === 1 && kinds.some((kind) => kind.value === item.kind) &&
    typeof item.scenario === "string" && typeof item.instructions === "string" &&
    numbers(item.objective_ids) && numbers(item.prerequisite_mission_ids) &&
    choices(item.choices) && strings(item.correct_ids) && choices(item.match_targets) &&
    !!item.correct_pairs && typeof item.correct_pairs === "object" && !Array.isArray(item.correct_pairs) && Object.values(item.correct_pairs).every((entry) => typeof entry === "string") &&
    (item.action_id === null || typeof item.action_id === "string") && validDisplay &&
    strings(item.resources) && strings(item.hints) && !!item.feedback &&
    typeof item.feedback === "object" && !Array.isArray(item.feedback) && Object.values(item.feedback).every((entry) => typeof entry === "string") &&
    typeof item.max_points === "number" && typeof item.estimated_duration_minutes === "number" &&
    typeof item.bonus === "boolean"
}

function nextId(items: Choice[], prefix: string): string {
  let index = 1
  while (items.some((item) => item.id === `${prefix}-${index}`)) index += 1
  return `${prefix}-${index}`
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= items.length) return items
  const copy = [...items]
  ;[copy[index], copy[target]] = [copy[target], copy[index]]
  return copy
}

function TableEditor({ value, onChange }: { value: TableDisplay; onChange: (value: TableDisplay) => void }) {
  function updateColumn(index: number, text: string) {
    const columns = [...value.columns]
    columns[index] = text
    onChange({ ...value, columns })
  }
  function updateCell(rowIndex: number, columnIndex: number, text: string) {
    const rows = value.rows.map((row) => [...row])
    rows[rowIndex][columnIndex] = text
    onChange({ ...value, rows })
  }
  return <Stack gap="3" p="4" bg="app.sunken" rounded="md" borderWidth="1px">
    <Text fontWeight="semibold">{t("Tableau de démonstration")}</Text>
    <Flex gap="2" wrap="wrap">
      {value.columns.map((column, index) => <Input key={index} aria-label={t("Nom de la colonne {{p0}}", { p0: index + 1 })} value={column} onChange={(event) => updateColumn(index, event.target.value)} maxW="44" bg="app.surface" />)}
      <Button size="sm" variant="outline" onClick={() => onChange({ ...value, columns: [...value.columns, ""], rows: value.rows.map((row) => [...row, ""]) })} disabled={value.columns.length >= 12}>{t("Ajouter une colonne")}</Button>
      {value.columns.length > 1 && <Button size="sm" variant="ghost" onClick={() => onChange({ ...value, columns: value.columns.slice(0, -1), rows: value.rows.map((row) => row.slice(0, -1)) })}>{t("Retirer la dernière colonne")}</Button>}
    </Flex>
    {value.rows.map((row, rowIndex) => <Flex key={rowIndex} gap="2" wrap="wrap">
      {row.map((cell, columnIndex) => <Input key={columnIndex} aria-label={t("Ligne {{p0}}, colonne {{p1}}", { p0: rowIndex + 1, p1: columnIndex + 1 })} value={cell === null ? "" : String(cell)} onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)} maxW="44" bg="app.surface" />)}
      <Button size="sm" variant="ghost" onClick={() => onChange({ ...value, rows: value.rows.filter((_, index) => index !== rowIndex) })} disabled={value.rows.length <= 1}>{t("Retirer la ligne")}</Button>
    </Flex>)}
    <Button size="sm" variant="outline" alignSelf="start" onClick={() => onChange({ ...value, rows: [...value.rows, value.columns.map(() => "")] })} disabled={value.rows.length >= 100}>{t("Ajouter une ligne")}</Button>
  </Stack>
}

function ChartEditor({ value, onChange }: { value: BarChartDisplay; onChange: (value: BarChartDisplay) => void }) {
  return <Stack gap="3" p="4" bg="app.sunken" rounded="md" borderWidth="1px">
    <Field.Root><Field.Label>{t("Titre du graphique")}</Field.Label><Input value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} bg="app.surface" /></Field.Root>
    <Field.Root><Field.Label>{t("Unité")}</Field.Label><Input value={value.unit} onChange={(event) => onChange({ ...value, unit: event.target.value })} placeholder={t("DH")} bg="app.surface" /></Field.Root>
    {value.labels.map((label, index) => <Flex key={index} gap="2" align="end" wrap="wrap">
      <Field.Root maxW="52"><Field.Label>{t("Catégorie")}{" "}{index + 1}</Field.Label><Input value={label} onChange={(event) => onChange({ ...value, labels: value.labels.map((item, i) => i === index ? event.target.value : item) })} bg="app.surface" /></Field.Root>
      <Field.Root maxW="40"><Field.Label>{t("Valeur")}{" "}{index + 1}</Field.Label><Input type="number" value={value.values[index] ?? 0} onChange={(event) => onChange({ ...value, values: value.values.map((item, i) => i === index ? Number(event.target.value) : item) })} bg="app.surface" /></Field.Root>
      <Button size="sm" variant="ghost" onClick={() => onChange({ ...value, labels: value.labels.filter((_, i) => i !== index), values: value.values.filter((_, i) => i !== index) })} disabled={value.labels.length <= 1}>{t("Retirer")}</Button>
    </Flex>)}
    <Button size="sm" variant="outline" alignSelf="start" onClick={() => onChange({ ...value, labels: [...value.labels, ""], values: [...value.values, 0] })} disabled={value.labels.length >= 20}>{t("Ajouter une catégorie")}</Button>
  </Stack>
}

type EditorProps = {
  mission: Mission; course: CourseTree; busy: boolean;
  onSave: (title: string, definition: MissionDefinition) => Promise<void>;
}

/** Activities written in the Markdown course (lessons, SQL challenges, runs, charts, code) are edited in the source file. */
export function isMarkdownOnly(definition: MissionDefinition | null): boolean {
  if (!definition) return false
  return !kinds.some((kind) => kind.value === definition.kind) || (definition.run?.length ?? 0) > 0
    || (definition.display_data !== null && !["table", "bar_chart"].includes(definition.display_data.kind))
}

export function MissionEditor(props: EditorProps) {
  if (isMarkdownOnly(props.mission.definition)) return <Stack gap="3">
    <Heading as="h4" size="md">{props.mission.title}</Heading>
    <Badge alignSelf="start" colorPalette="saffron" variant="subtle">{t("Écrite dans le cours Markdown")}</Badge>
    <Text>{t("Cette activité (")}{props.mission.definition?.kind.replaceAll("_", " ")}{t(") utilise des éléments du format Markdown (leçon, défi SQL, exécution de code, graphique ou code). Modifiez-la dans le fichier source du cours, puis réimportez-le. Consultez-la dans l’onglet « Aperçu ».")}</Text>
  </Stack>
  return <ChoiceMissionEditor {...props} />
}

function ChoiceMissionEditor({ mission, course, busy, onSave }: EditorProps) {
  const [title, setTitle] = useState(mission.title)
  const [draft, setDraft] = useState<MissionDefinition>(mission.definition ?? defaultDraft(course.objectives[0]?.id))
  const [importError, setImportError] = useState("")
  useEffect(() => {
    setTitle(mission.title)
    setDraft(mission.definition ?? defaultDraft(course.objectives[0]?.id))
    setImportError("")
  }, [mission.id])
  const otherMissions = course.modules.flatMap((module) => module.chapters.flatMap((chapter) => chapter.missions)).filter((item) => item.id !== mission.id)
  const single = !["multiple_choice", "reorder", "matching"].includes(draft.kind)

  function setKind(kind: MissionKind) {
    const scoring = ["multiple_choice", "reorder", "matching"].includes(kind) ? draft.scoring : "all_or_nothing"
    const base = { ...draft, scoring }
    if (kind === "true_false") {
      setDraft({ ...base, kind, choices: [{ id: "true", label: "Vrai" }, { id: "false", label: "Faux" }], correct_ids: ["true"], match_targets: [], correct_pairs: {}, action_id: null, feedback: {} })
      return
    }
    const choices = draft.kind === "true_false" ? defaultDraft().choices : draft.choices
    if (kind === "matching") {
      const targets = choices.map((_, index) => ({ id: `target-${index + 1}`, label: "" }))
      setDraft({ ...base, kind, choices, correct_ids: [], match_targets: targets,
        correct_pairs: Object.fromEntries(choices.map((choice, index) => [choice.id, targets[index].id])), action_id: null })
      return
    }
    setDraft({ ...base, kind, choices, correct_ids: kind === "reorder" ? choices.map((choice) => choice.id) : [choices[0].id],
      match_targets: [], correct_pairs: {}, action_id: kind === "guided_simulation" ? actions[0].value : null })
  }

  function addChoice() {
    const id = nextId(draft.choices, "option")
    const choices = [...draft.choices, { id, label: "" }]
    if (draft.kind === "matching") {
      const targetId = nextId(draft.match_targets, "target")
      setDraft({ ...draft, choices, match_targets: [...draft.match_targets, { id: targetId, label: "" }], correct_pairs: { ...draft.correct_pairs, [id]: targetId } })
    } else if (draft.kind === "reorder") {
      setDraft({ ...draft, choices, correct_ids: [...draft.correct_ids, id] })
    } else setDraft({ ...draft, choices })
  }

  function removeChoice(id: string) {
    if (draft.choices.length <= 2) return
    const index = draft.choices.findIndex((choice) => choice.id === id)
    const choices = draft.choices.filter((choice) => choice.id !== id)
    const feedback = { ...draft.feedback }
    delete feedback[id]
    if (draft.kind === "matching") {
      const targetId = draft.correct_pairs[id]
      const pairs = { ...draft.correct_pairs }
      delete pairs[id]
      setDraft({ ...draft, choices, match_targets: draft.match_targets.filter((target) => target.id !== targetId), correct_pairs: pairs, feedback })
    } else {
      const remaining = draft.correct_ids.filter((item) => item !== id)
      setDraft({ ...draft, choices, correct_ids: single && remaining.length === 0 ? [choices[0].id] : remaining, feedback })
    }
    if (index < 0) return
  }

  function toggleObjective(id: number) {
    setDraft({ ...draft, objective_ids: draft.objective_ids.includes(id) ? draft.objective_ids.filter((item) => item !== id) : [...draft.objective_ids, id] })
  }

  function submit() {
    const cleaned: MissionDefinition = {
      ...draft,
      hints: draft.hints.map((hint) => hint.trim()).filter(Boolean),
      resources: draft.resources.map((url) => url.trim()).filter(Boolean),
      feedback: Object.fromEntries(Object.entries(draft.feedback).filter(([, value]) => value.trim())),
    }
    return onSave(title.trim(), cleaned)
  }

  async function importDefinition(file: File | undefined) {
    if (!file) return
    setImportError("")
    if (file.size > 64_000) { setImportError(t("Le fichier JSON dépasse 64 Ko.")); return }
    try {
      const value: unknown = JSON.parse(await file.text())
      if (!isDefinition(value)) throw new Error("definition format")
      setDraft(value)
    } catch {
      setImportError(t("Définition JSON invalide. Vérifiez le format, puis enregistrez pour la validation serveur."))
    }
  }

  function exportDefinition() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${mission.slug}-definition.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return <Stack gap="6" as="section" aria-label={t("Éditeur de mission")}>
    <Flex align="center" justify="space-between" wrap="wrap" gap="3"><Heading as="h3" size="lg">{t("Éditer une mission")}</Heading><Badge colorPalette="brand">{t("Brouillon")}</Badge></Flex>
    <Box bg="app.sunken" p="4" rounded="md"><Stack gap="2"><Text fontWeight="semibold">{t("Définition JSON facultative")}</Text><Text fontSize="sm">{t("Importez un brouillon existant ou exportez celui-ci. Le serveur vérifie le contenu à l’enregistrement.")}</Text><input type="file" accept=".json,application/json" aria-label={t("Importer une définition JSON")} onChange={(event) => { void importDefinition(event.target.files?.[0]); event.target.value = "" }} /><Button size="sm" variant="outline" alignSelf="start" onClick={exportDefinition}>{t("Exporter la définition JSON")}</Button>{importError && <Text role="alert" color="red.fg">{importError}</Text>}</Stack></Box>
    <Field.Root required><Field.Label>{t("Titre de la mission")}</Field.Label><Input value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} /></Field.Root>
    <Field.Root required><Field.Label>{t("Type d’activité")}</Field.Label><NativeSelect.Root disabled={busy}><NativeSelect.Field value={draft.kind} onChange={(event) => setKind(event.target.value as MissionKind)}>{kinds.map((kind) => <option key={kind.value} value={kind.value}>{t(kind.label)}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>
    <Box><Text fontWeight="semibold" mb="2">{t("Objectifs pédagogiques")}</Text>{course.objectives.length === 0 ? <Text color="orange.fg">{t("Créez un objectif dans l’onglet Structure avant de compléter cette mission.")}</Text> : <Flex gap="4" wrap="wrap">{course.objectives.map((objective) => <label key={objective.id}><input type="checkbox" checked={draft.objective_ids.includes(objective.id)} onChange={() => toggleObjective(objective.id)} /> {objective.code} — {objective.statement}</label>)}</Flex>}</Box>
    {otherMissions.length > 0 && <Box><Text fontWeight="semibold" mb="2">{t("Missions préalables")}</Text><Flex gap="4" wrap="wrap">{otherMissions.map((item) => <label key={item.id}><input type="checkbox" checked={draft.prerequisite_mission_ids.includes(item.id)} onChange={() => setDraft({ ...draft, prerequisite_mission_ids: draft.prerequisite_mission_ids.includes(item.id) ? draft.prerequisite_mission_ids.filter((id) => id !== item.id) : [...draft.prerequisite_mission_ids, item.id] })} /> {item.title}</label>)}</Flex></Box>}
    <Field.Root required><Field.Label>{t("Situation")}</Field.Label><Textarea value={draft.scenario} onChange={(event) => setDraft({ ...draft, scenario: event.target.value })} rows={4} placeholder={t("Une commande fictive arrive à Rabat…")} disabled={busy} /></Field.Root>
    <Field.Root required><Field.Label>{t("Consigne")}</Field.Label><Textarea value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} rows={3} placeholder={t("Que doit faire l’équipe ?")} disabled={busy} /></Field.Root>
    <Stack gap="3"><Heading as="h4" size="md">{t("Propositions")}</Heading>{draft.choices.map((choice, index) => <Flex key={choice.id} gap="2" align="center"><Input aria-label={t("Proposition {{p0}}", { p0: index + 1 })} value={choice.label} onChange={(event) => setDraft({ ...draft, choices: draft.choices.map((item) => item.id === choice.id ? { ...item, label: event.target.value } : item) })} disabled={busy || draft.kind === "true_false"} /><Button size="sm" variant="ghost" onClick={() => removeChoice(choice.id)} disabled={busy || draft.kind === "true_false" || draft.choices.length <= 2}>{t("Retirer")}</Button></Flex>)}<Button size="sm" variant="outline" alignSelf="start" onClick={addChoice} disabled={busy || draft.kind === "true_false" || draft.choices.length >= 16}>{t("Ajouter une proposition")}</Button></Stack>
    {single && <Field.Root required><Field.Label>{t("Réponse attendue")}</Field.Label><NativeSelect.Root><NativeSelect.Field value={draft.correct_ids[0] ?? ""} onChange={(event) => setDraft({ ...draft, correct_ids: [event.target.value] })}>{draft.choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label || `Proposition ${draft.choices.indexOf(choice) + 1}`}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>}
    {draft.kind === "multiple_choice" && <Box><Text fontWeight="semibold" mb="2">{t("Réponses attendues")}</Text><Stack gap="2">{draft.choices.map((choice) => <label key={choice.id}><input type="checkbox" checked={draft.correct_ids.includes(choice.id)} onChange={() => setDraft({ ...draft, correct_ids: draft.correct_ids.includes(choice.id) ? draft.correct_ids.filter((id) => id !== choice.id) : [...draft.correct_ids, choice.id] })} /> {choice.label || choice.id}</label>)}</Stack></Box>}
    {draft.kind === "reorder" && <Box><Text fontWeight="semibold" mb="2">{t("Ordre attendu")}</Text><Stack gap="2">{draft.correct_ids.map((id, index) => <Flex key={id} align="center" gap="2"><Text minW="6">{index + 1}.</Text><Text flex="1">{draft.choices.find((item) => item.id === id)?.label || id}</Text><Button size="sm" variant="outline" aria-label={t("Monter l’étape {{p0}}", { p0: index + 1 })} disabled={index === 0} onClick={() => setDraft({ ...draft, correct_ids: move(draft.correct_ids, index, -1) })}>{t("Monter")}</Button><Button size="sm" variant="outline" aria-label={t("Descendre l’étape {{p0}}", { p0: index + 1 })} disabled={index === draft.correct_ids.length - 1} onClick={() => setDraft({ ...draft, correct_ids: move(draft.correct_ids, index, 1) })}>{t("Descendre")}</Button></Flex>)}</Stack></Box>}
    {draft.kind === "matching" && <Stack gap="3"><Heading as="h4" size="md">{t("Éléments à associer")}</Heading>{draft.match_targets.map((target, index) => <Field.Root key={target.id}><Field.Label>{t("Cible")}{" "}{index + 1}</Field.Label><Input value={target.label} onChange={(event) => setDraft({ ...draft, match_targets: draft.match_targets.map((item) => item.id === target.id ? { ...item, label: event.target.value } : item) })} /></Field.Root>)}{draft.choices.map((choice) => <Field.Root key={choice.id}><Field.Label>{t("Associer «")}{" "}{choice.label || choice.id} » à</Field.Label><NativeSelect.Root><NativeSelect.Field value={draft.correct_pairs[choice.id] ?? ""} onChange={(event) => setDraft({ ...draft, correct_pairs: { ...draft.correct_pairs, [choice.id]: event.target.value } })}>{draft.match_targets.map((target) => <option key={target.id} value={target.id}>{target.label || target.id}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>)}</Stack>}
    {draft.kind === "guided_simulation" && <Field.Root><Field.Label>{t("Opération approuvée")}</Field.Label><NativeSelect.Root><NativeSelect.Field value={draft.action_id ?? actions[0].value} onChange={(event) => setDraft({ ...draft, action_id: event.target.value })}>{actions.map((action) => <option key={action.value} value={action.value}>{t(action.label)}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>}
    <Field.Root><Field.Label>{t("Données visibles")}</Field.Label><NativeSelect.Root><NativeSelect.Field value={draft.display_data?.kind ?? "none"} onChange={(event) => { const kind = event.target.value; const data: DisplayData | null = kind === "table" ? { kind: "table", columns: ["Colonne 1"], rows: [[""]] } : kind === "bar_chart" ? { kind: "bar_chart", title: t("Graphique"), labels: [t("Catégorie 1")], values: [0], unit: "" } : null; setDraft({ ...draft, display_data: data }) }}><option value="none">{t("Aucune donnée visuelle")}</option><option value="table">{t("Tableau")}</option><option value="bar_chart">{t("Graphique en barres")}</option></NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>
    {draft.display_data?.kind === "table" && <TableEditor value={draft.display_data} onChange={(value) => setDraft({ ...draft, display_data: value })} />}
    {draft.display_data?.kind === "bar_chart" && <ChartEditor value={draft.display_data} onChange={(value) => setDraft({ ...draft, display_data: value })} />}
    <Flex gap="4" wrap="wrap"><Field.Root maxW="40" required><Field.Label>{t("Points")}</Field.Label><Input type="number" min={1} max={100} value={draft.max_points} onChange={(event) => setDraft({ ...draft, max_points: Number(event.target.value) })} /></Field.Root><Field.Root maxW="40" required><Field.Label>{t("Durée indicative (min)")}</Field.Label><Input type="number" min={1} max={120} value={draft.estimated_duration_minutes} onChange={(event) => setDraft({ ...draft, estimated_duration_minutes: Number(event.target.value) })} /></Field.Root><label style={{ alignSelf: "end", paddingBottom: 10 }}><input type="checkbox" checked={draft.bonus} onChange={(event) => setDraft({ ...draft, bonus: event.target.checked })} /> {t("Activité bonus")}</label></Flex>
    <Field.Root><Field.Label>{t("Barème")}</Field.Label><NativeSelect.Root maxW="md"><NativeSelect.Field value={draft.scoring ?? "all_or_nothing"} onChange={(event) => setDraft({ ...draft, scoring: event.target.value as "all_or_nothing" | "partial" })}><option value="all_or_nothing">{t("Tout ou rien : points seulement si la réponse est entièrement juste")}</option>{["multiple_choice", "reorder", "matching"].includes(draft.kind) && <option value="partial">{t("Partiel : points au prorata des éléments justes")}</option>}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root><Field.HelperText>{t("Le meilleur essai de l’étudiant est conservé. Les activités bonus sont comptées à part.")}</Field.HelperText></Field.Root>
    <Field.Root><Field.Label>{t("Explication")}</Field.Label><Textarea value={draft.explanation ?? ""} onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} rows={3} placeholder={t("Pourquoi la bonne réponse est juste…")} disabled={busy} /><Field.HelperText>{t("Montrée à l’étudiant après une réponse juste ou après trois essais.")}</Field.HelperText></Field.Root>
    <Stack gap="2"><Heading as="h4" size="md">{t("Indices progressifs")}</Heading>{draft.hints.map((hint, index) => <Flex key={index} gap="2"><Input aria-label={t("Indice {{p0}}", { p0: index + 1 })} value={hint} onChange={(event) => setDraft({ ...draft, hints: draft.hints.map((item, i) => i === index ? event.target.value : item) })} /><Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, hints: draft.hints.filter((_, i) => i !== index) })}>{t("Retirer")}</Button></Flex>)}<Button size="sm" variant="outline" alignSelf="start" onClick={() => setDraft({ ...draft, hints: [...draft.hints, ""] })} disabled={draft.hints.length >= 5}>{t("Ajouter un indice")}</Button></Stack>
    <Stack gap="2"><Heading as="h4" size="md">{t("Feedback par proposition")}</Heading>{draft.choices.map((choice) => <Field.Root key={choice.id}><Field.Label>{choice.label || choice.id}</Field.Label><Textarea value={draft.feedback[choice.id] ?? ""} onChange={(event) => setDraft({ ...draft, feedback: { ...draft.feedback, [choice.id]: event.target.value } })} rows={2} /></Field.Root>)}</Stack>
    <Stack gap="2"><Heading as="h4" size="md">{t("Ressources HTTPS")}</Heading>{draft.resources.map((url, index) => <Flex key={index} gap="2"><Input aria-label={t("Ressource {{p0}}", { p0: index + 1 })} value={url} onChange={(event) => setDraft({ ...draft, resources: draft.resources.map((item, i) => i === index ? event.target.value : item) })} placeholder="https://…" /><Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, resources: draft.resources.filter((_, i) => i !== index) })}>{t("Retirer")}</Button></Flex>)}<Button size="sm" variant="outline" alignSelf="start" onClick={() => setDraft({ ...draft, resources: [...draft.resources, ""] })} disabled={draft.resources.length >= 10}>{t("Ajouter une ressource")}</Button></Stack>
    <Button colorPalette="brand" alignSelf="start" onClick={submit} loading={busy} disabled={course.status === "archived" || course.objectives.length === 0}>{t("Enregistrer la mission")}</Button>
  </Stack>
}
