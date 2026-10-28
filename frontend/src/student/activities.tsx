import { Flashcards } from "./Flashcards"
import { isUngraded } from "../studioTypes"
import { useEffect, useRef, useState } from "react"
import { DescribedMedia } from "./Lesson"
import { Box, Button, Flex, NativeSelect, Stack, Text, VisuallyHidden } from "@chakra-ui/react"
import { CodeBlock, Comparison, DataTable, LineChart } from "./displays"
import { ImageView } from "./ImageView"
import { ExperienceCard } from "./ExperienceCard"
import { AnimationPlayer, FlowDiagram, MindMap, VideoView } from "./media"
import type { Choice, DisplayData } from "../studioTypes"
import type { Answer, PlayerDefinition } from "./types"

type ActivityProps = {
  definition: PlayerDefinition
  answer: Answer
  onChange: (answer: Answer) => void
  disabled?: boolean
  name: string
}

export function emptyAnswer(definition: PlayerDefinition): Answer {
  return { choice_ids: definition.kind === "reorder" ? definition.choices.map((choice) => choice.id) : [], pairs: {} }
}

export function isAnswerComplete(definition: PlayerDefinition, answer: Answer): boolean {
  if (isUngraded(definition.kind) || definition.kind === "sql_challenge") return false
  if (definition.kind === "matching") return definition.choices.every((choice) => Boolean(answer.pairs[choice.id]))
  if (definition.kind === "reorder") return answer.choice_ids.length === definition.choices.length
  return answer.choice_ids.length > 0
}

const optionStyles = {
  display: "flex", alignItems: "stretch", gap: "0", p: "0", borderWidth: "1px", borderColor: "app.border",
  rounded: "lg", bg: "app.surface", cursor: "pointer", transition: "border-color 120ms, background 120ms",
  _hover: { borderColor: "brand.300" },
  "&:has(input:checked)": { borderColor: "brand.solid", bg: "brand.subtle", boxShadow: "0 0 0 1px var(--chakra-colors-brand-solid)" },
  "&:has(input:focus-visible)": { outline: "3px solid", outlineColor: "brand.focusRing", outlineOffset: "2px" },
  "&:has(input:disabled)": { cursor: "default", opacity: 0.85 },
} as const

export function ChoiceActivity({ definition, answer, onChange, disabled, name }: ActivityProps) {
  const multiple = definition.kind === "multiple_choice"
  function toggle(id: string) {
    if (!multiple) return onChange({ ...answer, choice_ids: [id] })
    const next = answer.choice_ids.includes(id) ? answer.choice_ids.filter((item) => item !== id) : [...answer.choice_ids, id]
    onChange({ ...answer, choice_ids: next })
  }
  return <Box as="fieldset" border="0" p="0" m="0">
    <VisuallyHidden as="legend">{multiple ? "Choisissez une ou plusieurs réponses" : "Choisissez une réponse"}</VisuallyHidden>
    <Stack gap="2.5" role={multiple ? "group" : "radiogroup"} aria-label={multiple ? "Propositions, plusieurs réponses possibles" : "Propositions"}>
      {definition.choices.map((choice, index) => <Box key={choice.id} css={optionStyles}>
        <Box as="label" display="flex" alignItems="flex-start" gap="3" flex="1" p="3.5" cursor="inherit">
          <input type={multiple ? "checkbox" : "radio"} name={name} value={choice.id} disabled={disabled}
            checked={answer.choice_ids.includes(choice.id)} onChange={() => toggle(choice.id)}
            style={{ marginTop: 4, width: 18, height: 18, accentColor: "var(--chakra-colors-brand-solid)", flexShrink: 0 }} />
          <Text>{choice.label}</Text>
        </Box>
        {index < 9 && <Box as="kbd" aria-hidden="true" alignSelf="center" mr="3.5" fontSize="xs" color="app.muted" borderWidth="1px" borderColor="app.border" rounded="sm" px="1.5" lineHeight="1.6" fontFamily="inherit">{index + 1}</Box>}
      </Box>)}
    </Stack>
    {multiple && <Text mt="2" fontSize="sm" color="app.muted">Plusieurs réponses peuvent être justes.</Text>}
  </Box>
}

export function ReorderActivity({ definition, answer, onChange, disabled }: ActivityProps) {
  const [announcement, setAnnouncement] = useState("")
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const focusAfterMove = useRef<string | null>(null)
  const byId = new Map(definition.choices.map((choice) => [choice.id, choice]))
  // Reordering keyed DOM nodes blurs them: restore focus once React has committed the new order.
  useEffect(() => {
    if (focusAfterMove.current) refs.current[focusAfterMove.current]?.focus()
    focusAfterMove.current = null
  }, [answer.choice_ids])
  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= answer.choice_ids.length) return
    const next = [...answer.choice_ids]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange({ ...answer, choice_ids: next })
    const id = next[target]
    setAnnouncement(`« ${byId.get(id)?.label} » est maintenant en position ${target + 1} sur ${next.length}.`)
    const edge = target === 0 || target === next.length - 1
    focusAfterMove.current = `${id}:${edge ? (direction < 0 ? 1 : -1) : direction}`
  }
  return <Box><Stack gap="2" as="ol" listStyleType="none" m="0" p="0" aria-label="Étapes à ordonner">
    {answer.choice_ids.map((id, index) => <Flex as="li" key={id} align="center" gap="3" p="3" bg="app.surface"
      borderWidth="1px" borderColor="app.border" rounded="lg">
      <Flex align="center" justify="center" w="8" h="8" rounded="full" bg="brand.subtle" color="brand.fg" fontWeight="bold" flexShrink={0} aria-hidden="true">{index + 1}</Flex>
      <Text flex="1">{byId.get(id)?.label}</Text>
      <Button size="sm" variant="outline" disabled={disabled || index === 0} onClick={() => move(index, -1)}
        ref={(node) => { refs.current[`${id}:-1`] = node }} aria-label={`Monter « ${byId.get(id)?.label} »`}>Monter</Button>
      <Button size="sm" variant="outline" disabled={disabled || index === answer.choice_ids.length - 1} onClick={() => move(index, 1)}
        ref={(node) => { refs.current[`${id}:1`] = node }} aria-label={`Descendre « ${byId.get(id)?.label} »`}>Descendre</Button>
    </Flex>)}
  </Stack>
  <VisuallyHidden aria-live="polite">{announcement}</VisuallyHidden>
  </Box>
}

export function MatchingActivity({ definition, answer, onChange, disabled }: ActivityProps) {
  return <Stack gap="3">
    {definition.choices.map((choice: Choice) => <Flex key={choice.id} align={{ base: "stretch", md: "center" }} gap="3"
      direction={{ base: "column", md: "row" }} p="3" bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="lg">
      <Text flex="1" fontWeight="medium">{choice.label}</Text>
      <NativeSelect.Root maxW={{ md: "72" }} disabled={disabled}>
        <NativeSelect.Field aria-label={`Associer « ${choice.label} »`} value={answer.pairs[choice.id] ?? ""}
          onChange={(event) => onChange({ ...answer, pairs: { ...answer.pairs, [choice.id]: event.target.value } })}>
          <option value="">Choisir…</option>
          {definition.match_targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Flex>)}
  </Stack>
}

export function Activity(props: ActivityProps) {
  if (props.definition.kind === "reorder") return <ReorderActivity {...props} />
  if (props.definition.kind === "matching") return <MatchingActivity {...props} />
  return <ChoiceActivity {...props} />
}

export function DataView({ data }: { data: DisplayData | null }) {
  return <DescribedMedia data={data}><MediaBody data={data} /></DescribedMedia>
}

function MediaBody({ data }: { data: DisplayData | null }) {
  const [asTable, setAsTable] = useState(false)
  if (!data) return null
  if (data.kind === "table") return <DataTable columns={data.columns} rows={data.rows} caption={data.title || "Extrait de données fictives"} />
  if (data.kind === "line_chart") return <LineChart data={data} />
  if (data.kind === "code") return <CodeBlock code={data.code} language={data.language} title={data.title} />
  if (data.kind === "comparison") return <Comparison data={data} />
  if (data.kind === "animation") return <AnimationPlayer data={data} />
  if (data.kind === "mindmap") return <MindMap data={data} />
  if (data.kind === "flow") return <FlowDiagram data={data} />
  if (data.kind === "video") return <VideoView data={data} />
  if (data.kind === "flashcards") return <Flashcards data={data} />
  if (data.kind === "image") return <ImageView data={data} />
  if (data.kind === "experience") return <ExperienceCard data={data} />
  const max = Math.max(1, ...data.values.map((value) => Math.abs(value)))
  return <Stack gap="3">
    {asTable ? <DataTable caption={data.title} columns={["Libellé", data.unit ? `Valeur (${data.unit})` : "Valeur"]}
      rows={data.labels.map((label, index) => [label, data.values[index]])} />
      : <Box as="figure" m="0" p="4" borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface">
        <Text as="figcaption" fontWeight="semibold" mb="3">{data.title}</Text>
        <Stack gap="2.5" aria-hidden="true">
          {data.labels.map((label, index) => <Flex key={index} align="center" gap="3">
            <Text minW="28" fontSize="sm">{label}</Text>
            <Box flex="1" bg="app.sunken" rounded="sm"><Box bg="brand.solid" h="5" rounded="sm" width={`${Math.max(2, Math.abs(data.values[index]) / max * 100)}%`} /></Box>
            <Text minW="20" textAlign="right" fontSize="sm" css={{ fontVariantNumeric: "tabular-nums" }}>{data.values[index]} {data.unit}</Text>
          </Flex>)}
        </Stack>
        <VisuallyHidden>{data.labels.map((label, index) => `${label} : ${data.values[index]} ${data.unit}`).join(" ; ")}</VisuallyHidden>
      </Box>}
    <Button alignSelf="start" size="sm" variant="ghost" colorPalette="brand" aria-expanded={asTable} onClick={() => setAsTable(!asTable)}>
      {asTable ? "Afficher le graphique" : "Afficher les données en tableau"}
    </Button>
  </Stack>
}
