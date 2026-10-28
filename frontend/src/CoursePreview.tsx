import { useEffect, useState } from "react"
import { Badge, Box, Button, Flex, Heading, NativeSelect, Stack, Text } from "@chakra-ui/react"
import type { MissionDefinition, StudentDefinition, StudentMission, CourseModule } from "./studioTypes"

export type PreviewTree = { title: string; description: string; modules: CourseModule<StudentMission>[] }

function DisplayData({ data }: { data: StudentDefinition["display_data"] }) {
  if (!data) return null
  if (data.kind === "table") return <Box overflowX="auto" borderWidth="1px" rounded="md" bg="white">
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead><tr>{data.columns.map((column, index) => <th key={index} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #d8dfd9" }}>{column}</th>)}</tr></thead>
      <tbody>{data.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index} style={{ padding: 10, borderBottom: "1px solid #edf0ec" }}>{cell === null ? "—" : String(cell)}</td>)}</tr>)}</tbody>
    </table>
  </Box>
  const max = Math.max(1, ...data.values.map((value) => Math.abs(value)))
  return <Stack gap="3" p="4" borderWidth="1px" rounded="md" bg="white" aria-label={data.title}>
    <Text fontWeight="semibold">{data.title}</Text>
    {data.labels.map((label, index) => <Flex key={index} align="center" gap="3"><Text minW="28">{label}</Text><Box flex="1" bg="gray.100" rounded="sm"><Box bg="teal.500" h="5" width={`${Math.max(2, Math.abs(data.values[index]) / max * 100)}%`} rounded="sm" /></Box><Text minW="20" textAlign="right">{data.values[index]} {data.unit}</Text></Flex>)}
  </Stack>
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value))
}

export function MissionPreview({ mission, correction }: { mission: StudentMission; correction?: MissionDefinition }) {
  const definition = mission.definition
  const [selected, setSelected] = useState<string[]>([])
  const [pairs, setPairs] = useState<Record<string, string>>({})
  const [message, setMessage] = useState("")
  useEffect(() => {
    setSelected(definition?.kind === "reorder" ? definition.choices.map((choice) => choice.id) : [])
    setPairs({})
    setMessage("")
  }, [mission.id])
  if (!definition) return <Text>Cette mission n’a pas encore de définition. Revenez à l’éditeur.</Text>

  function simulate() {
    if (!definition || !correction) return
    let correct = false
    if (definition.kind === "matching") {
      correct = definition.choices.every((choice) => pairs[choice.id] === correction.correct_pairs[choice.id])
    } else if (definition.kind === "reorder") {
      correct = selected.join("|") === correction.correct_ids.join("|")
    } else if (definition.kind === "multiple_choice") {
      correct = sameSet(selected, correction.correct_ids)
    } else correct = selected[0] === correction.correct_ids[0]
    setMessage(correct ? "Cette sélection correspond à la correction privée." : "Cette sélection diffère de la correction privée.")
  }

  function moveChoice(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= selected.length) return
    const copy = [...selected]
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
    setSelected(copy)
    setMessage("")
  }

  return <Stack gap="5" p="6" bg="white" borderWidth="1px" rounded="xl" aria-label={`Aperçu de ${mission.title}`}>
    <Flex justify="space-between" align="center" gap="3" wrap="wrap"><Heading as="h4" size="md">{mission.title}</Heading><Badge colorPalette="teal" variant="subtle">{definition.kind.replaceAll("_", " ")}</Badge></Flex>
    <Text whiteSpace="pre-wrap">{definition.scenario}</Text>
    <DisplayData data={definition.display_data} />
    <Text fontWeight="semibold" whiteSpace="pre-wrap">{definition.instructions}</Text>
    {definition.kind === "reorder" ? <Stack gap="2">{selected.map((id, index) => <Flex key={id} gap="2" align="center"><Text flex="1">{index + 1}. {definition.choices.find((choice) => choice.id === id)?.label}</Text><Button size="sm" variant="outline" onClick={() => moveChoice(index, -1)} disabled={index === 0}>Monter</Button><Button size="sm" variant="outline" onClick={() => moveChoice(index, 1)} disabled={index === selected.length - 1}>Descendre</Button></Flex>)}</Stack>
      : definition.kind === "matching" ? <Stack gap="3">{definition.choices.map((choice) => <Flex key={choice.id} align="center" gap="3"><Text flex="1">{choice.label}</Text><NativeSelect.Root maxW="52"><NativeSelect.Field aria-label={`Associer ${choice.label}`} value={pairs[choice.id] ?? ""} onChange={(event) => { setPairs({ ...pairs, [choice.id]: event.target.value }); setMessage("") }}><option value="">Choisir une cible</option>{definition.match_targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Flex>)}</Stack>
        : <Stack gap="2">{definition.choices.map((choice) => <label key={choice.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, border: "1px solid #d8dfd9", borderRadius: 8 }}><input type={definition.kind === "multiple_choice" ? "checkbox" : "radio"} name={`preview-${mission.id}`} checked={selected.includes(choice.id)} onChange={() => { setSelected(definition.kind === "multiple_choice" ? selected.includes(choice.id) ? selected.filter((id) => id !== choice.id) : [...selected, choice.id] : [choice.id]); setMessage("") }} />{choice.label}</label>)}</Stack>}
    {definition.hints.length > 0 && <Box><Text fontWeight="semibold">Indices disponibles</Text><Stack gap="1" mt="2">{definition.hints.map((hint, index) => <Text key={index}>{index + 1}. {hint}</Text>)}</Stack></Box>}
    {definition.resources.length > 0 && <Box><Text fontWeight="semibold">Ressources</Text><Stack gap="1" mt="2">{definition.resources.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" style={{ color: "#0f766e", textDecoration: "underline" }}>{url}</a>)}</Stack></Box>}
    {correction ? <><Button alignSelf="start" variant="outline" onClick={simulate}>Simuler cette réponse</Button><Text role="status" minH="5">{message || "Mode aperçu : aucune tentative et aucun point ne sont enregistrés."}</Text></> : <Text color="gray.600">La réponse et la notation seront disponibles dans le lecteur étudiant.</Text>}
  </Stack>
}

export function CoursePreview({ course, corrections }: { course: PreviewTree; corrections?: Record<number, MissionDefinition> }) {
  const missions = course.modules.flatMap((module) => module.chapters.flatMap((chapter) => chapter.missions))
  const [selectedId, setSelectedId] = useState<number | null>(missions[0]?.id ?? null)
  useEffect(() => setSelectedId(missions[0]?.id ?? null), [course.title, missions.map((mission) => mission.id).join(",")])
  const mission = missions.find((item) => item.id === selectedId)
  return <Stack gap="5"><Box><Heading as="h3" size="lg">{course.title}</Heading>{course.description && <Text mt="2">{course.description}</Text>}</Box>
    {missions.length === 0 ? <Text>Aucune mission à prévisualiser.</Text> : <><NativeSelect.Root maxW="md"><NativeSelect.Field aria-label="Mission à prévisualiser" value={selectedId ?? ""} onChange={(event) => setSelectedId(Number(event.target.value))}>{missions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>{mission && <MissionPreview key={mission.id} mission={mission} correction={corrections?.[mission.id]} />}</>}
  </Stack>
}
