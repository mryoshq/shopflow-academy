import { isUngraded } from "./studioTypes"
import { useEffect, useState } from "react"
import { Badge, Box, Button, Flex, Grid, Heading, NativeSelect, Stack, Text } from "@chakra-ui/react"
import type { MissionDefinition, StudentMission, CourseModule } from "./studioTypes"
import { DataView } from "./student/activities"
import { CodeBlock } from "./student/displays"
import { LessonView } from "./student/Lesson"
import { RichText } from "./student/RichText"
import { RunPanel } from "./student/RunPanel"
import { Icon } from "./student/ui"
import { CourseOutline } from "./studio/CourseOutline"

export type PreviewTree = { title: string; description: string; modules: CourseModule<StudentMission>[] }

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value))
}

export function MissionPreview({ mission, correction, readOnly = false }: { mission: StudentMission; correction?: MissionDefinition; readOnly?: boolean }) {
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

  return <Stack gap="5" p="6" bg="app.surface" borderWidth="1px" rounded="xl" aria-label={`Aperçu de ${mission.title}`}>
    <Flex justify="space-between" align="center" gap="3" wrap="wrap"><Heading as="h4" size="md">{mission.title}</Heading><Badge colorPalette="brand" variant="subtle">{definition.kind.replaceAll("_", " ")}</Badge></Flex>
    {isUngraded(definition.kind) ? <LessonView definition={definition} headingAs="h5" media={<>
      <DataView data={definition.display_data} />
      <RunPanel runs={definition.run} missionId={readOnly ? undefined : mission.id} endpoint="teacher" />
    </>} /> : <>
      {definition.scenario && <RichText text={definition.scenario} />}
      <DataView data={definition.display_data} />
      <RunPanel runs={definition.run} missionId={readOnly ? undefined : mission.id} endpoint="teacher" />
    </>}
    {definition.instructions && <RichText text={definition.instructions} fontWeight="semibold" />}
    {isUngraded(definition.kind) ? <Text color="app.muted">{definition.kind === "review" ? "Révision" : "Leçon"} non notée : l’étudiant clique « J’ai compris ».</Text>
      : definition.kind === "sql_challenge" ? <CodeBlock code={definition.starter_sql ?? ""} language="sql" title="Requête de départ (modifiable par l’étudiant)" />
      : definition.kind === "reorder" ? <Stack gap="2">{selected.map((id, index) => <Flex key={id} gap="2" align="center"><Text flex="1">{index + 1}. {definition.choices.find((choice) => choice.id === id)?.label}</Text><Button size="sm" variant="outline" onClick={() => moveChoice(index, -1)} disabled={index === 0}>Monter</Button><Button size="sm" variant="outline" onClick={() => moveChoice(index, 1)} disabled={index === selected.length - 1}>Descendre</Button></Flex>)}</Stack>
      : definition.kind === "matching" ? <Stack gap="3">{definition.choices.map((choice) => <Flex key={choice.id} align="center" gap="3"><Text flex="1">{choice.label}</Text><NativeSelect.Root maxW="52"><NativeSelect.Field aria-label={`Associer ${choice.label}`} value={pairs[choice.id] ?? ""} onChange={(event) => { setPairs({ ...pairs, [choice.id]: event.target.value }); setMessage("") }}><option value="">Choisir une cible</option>{definition.match_targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Flex>)}</Stack>
        : <Stack gap="2">{definition.choices.map((choice) => <label key={choice.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, border: "1px solid var(--chakra-colors-app-border)", borderRadius: 8 }}><input type={definition.kind === "multiple_choice" ? "checkbox" : "radio"} name={`preview-${mission.id}`} checked={selected.includes(choice.id)} onChange={() => { setSelected(definition.kind === "multiple_choice" ? selected.includes(choice.id) ? selected.filter((id) => id !== choice.id) : [...selected, choice.id] : [choice.id]); setMessage("") }} />{choice.label}</label>)}</Stack>}
    {definition.hints.length > 0 && <Box><Text fontWeight="semibold">Indices disponibles</Text><Stack gap="1" mt="2">{definition.hints.map((hint, index) => <Text key={index}>{index + 1}. {hint}</Text>)}</Stack></Box>}
    {definition.resources.length > 0 && <Box><Text fontWeight="semibold">Ressources</Text><Stack gap="1" mt="2">{definition.resources.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" style={{ color: "var(--chakra-colors-brand-fg)", textDecoration: "underline" }}>{url}</a>)}</Stack></Box>}
    {correction && !isUngraded(definition.kind) && definition.kind !== "sql_challenge" ? <><Button alignSelf="start" variant="outline" onClick={simulate}>Simuler cette réponse</Button><Text role="status" minH="5">{message || "Mode aperçu : aucune tentative et aucun point ne sont enregistrés."}</Text></> : <Text color="app.muted">La réponse et la notation seront disponibles dans le lecteur étudiant.</Text>}
  </Stack>
}

export function CoursePreview({ course, corrections, readOnly = false }: { course: PreviewTree; corrections?: Record<number, MissionDefinition>; readOnly?: boolean }) {
  const blocks = course.modules.flatMap((module) => module.chapters.filter((chapter) => chapter.missions.length > 0))
  const missions = blocks.flatMap((chapter) => chapter.missions)
  const [selectedId, setSelectedId] = useState<number | null>(missions[0]?.id ?? null)
  useEffect(() => setSelectedId(missions[0]?.id ?? null), [course.title, missions.map((mission) => mission.id).join(",")])
  const mission = missions.find((item) => item.id === selectedId)
  const blockIndex = blocks.findIndex((chapter) => chapter.missions.some((item) => item.id === selectedId))
  const goBlock = (index: number) => setSelectedId(blocks[index]?.missions[0]?.id ?? selectedId)
  return <Stack gap="5"><Box><Heading as="h3" size="lg">{course.title}</Heading>{course.description && <Text mt="2">{course.description}</Text>}</Box>
    {missions.length === 0 ? <Text>Aucune mission à prévisualiser.</Text> : <Grid templateColumns={{ base: "1fr", xl: "minmax(320px, 400px) minmax(0, 1fr)" }} gap="5" alignItems="start">
      <CourseOutline label="Plan de l’aperçu" modules={course.modules} privateDefinitions={corrections} selectedId={selectedId} onSelect={(item) => setSelectedId(item.id)} />
      <Stack gap="3" minW="0">
        <Flex as="nav" aria-label="Navigation par bloc" gap="2" align="center" wrap="wrap" justify="space-between">
          <Button size="sm" variant="outline" disabled={blockIndex <= 0} onClick={() => goBlock(blockIndex - 1)}><Icon name="arrow-left" size={16} />Bloc précédent</Button>
          <Text fontSize="sm" color="app.muted" textAlign="center">Bloc {blockIndex + 1} sur {blocks.length} : {blocks[blockIndex]?.title}</Text>
          <Button size="sm" variant="outline" disabled={blockIndex < 0 || blockIndex >= blocks.length - 1} onClick={() => goBlock(blockIndex + 1)}>Bloc suivant<Icon name="arrow-right" size={16} /></Button>
        </Flex>
        {mission && <MissionPreview key={mission.id} mission={mission} correction={corrections?.[mission.id]} readOnly={readOnly} />}
      </Stack>
    </Grid>}
  </Stack>
}
