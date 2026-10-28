import { isUngraded } from "../studioTypes"
import { useEffect, useId, useMemo, useState, type ReactNode } from "react"
import { Badge, Box, Button, Flex, Grid, Input, NativeSelect, Stack, Text } from "@chakra-ui/react"
import type { Chapter, CourseModule, MissionDefinition, MissionKind, Objective, StudentDefinition } from "../studioTypes"
import { Icon } from "../student/ui"
import { KIND_META, fold } from "./kinds"

type AnyDefinition = MissionDefinition | StudentDefinition
export type OutlineMission = { id: number; title: string; definition: AnyDefinition | null }
export type OutlineFilter = "all" | "lesson" | "graded" | "bonus" | "run" | "todo"

const FILTERS: { value: OutlineFilter; label: string }[] = [
  { value: "all", label: "Tous les éléments" }, { value: "lesson", label: "Leçons" }, { value: "graded", label: "Missions notées" },
  { value: "bonus", label: "Bonus" }, { value: "run", label: "Avec exécution" }, { value: "todo", label: "À compléter ou en erreur" },
]

export type ItemFacts = {
  kind: MissionKind | null; lesson: boolean; bonus: boolean; run: boolean; points: number; duration: number
  state: "valid" | "todo" | "error"; stateLabel: string
}

/** Facts shown on one line; points come from the private definition when the caller has it. */
export function itemFacts(mission: OutlineMission, objectives?: Objective[], privateDefinition?: MissionDefinition | null): ItemFacts {
  const definition = mission.definition
  if (!definition) return { kind: null, lesson: false, bonus: false, run: false, points: 0, duration: 0, state: "todo", stateLabel: "À compléter" }
  const source = (privateDefinition ?? definition) as Partial<MissionDefinition>
  const lesson = isUngraded(definition.kind)
  const known = objectives ? new Set(objectives.map((item) => item.id)) : null
  const unknown = known ? definition.objective_ids.some((id) => !known.has(id)) : false
  return {
    kind: definition.kind, lesson, bonus: Boolean(definition.bonus), run: (definition.run?.length ?? 0) > 0,
    points: lesson ? 0 : source.max_points ?? 0, duration: definition.estimated_duration_minutes ?? 0,
    state: unknown ? "error" : "valid", stateLabel: unknown ? "Erreur : objectif inconnu" : "Valide",
  }
}

function matches(facts: ItemFacts, filter: OutlineFilter): boolean {
  if (filter === "lesson") return facts.lesson
  if (filter === "graded") return !facts.lesson && !facts.bonus && facts.kind !== null
  if (filter === "bonus") return facts.bonus
  if (filter === "run") return facts.run
  if (filter === "todo") return facts.state !== "valid"
  return true
}

type Props<M extends OutlineMission> = {
  modules: CourseModule<M>[]
  label: string
  objectives?: Objective[]
  privateDefinitions?: Record<number, MissionDefinition>
  selectedId?: number | null
  onSelect?: (mission: M) => void
  objectiveFilter?: number | null
  onClearObjectiveFilter?: () => void
  itemActions?: (mission: M, index: number, chapter: Chapter<M>) => ReactNode
  blockActions?: (chapter: Chapter<M>, index: number, module: CourseModule<M>) => ReactNode
  blockFooter?: (chapter: Chapter<M>) => ReactNode
  moduleActions?: (module: CourseModule<M>, index: number) => ReactNode
  moduleFooter?: (module: CourseModule<M>) => ReactNode
}

/**
 * Module → block → items, for the studio and the preview (ADR-0022): collapsible blocks
 * (the current one open), one line per item, filters, search and counters.
 */
export function CourseOutline<M extends OutlineMission>(props: Props<M>) {
  const { modules, objectives, privateDefinitions, selectedId, objectiveFilter } = props
  const baseId = useId()
  const [filter, setFilter] = useState<OutlineFilter>("all")
  const [query, setQuery] = useState("")
  const [opened, setOpened] = useState<Record<number, boolean>>({})

  const blocks = useMemo(() => modules.flatMap((module) => module.chapters.map((chapter) => ({ module, chapter }))), [modules])
  const facts = useMemo(() => {
    const map = new Map<number, ItemFacts>()
    for (const { chapter } of blocks) for (const mission of chapter.missions) map.set(mission.id, itemFacts(mission, objectives, privateDefinitions?.[mission.id]))
    return map
  }, [blocks, objectives, privateDefinitions])
  const currentBlock = blocks.find(({ chapter }) => chapter.missions.some((mission) => mission.id === selectedId))?.chapter.id ?? blocks[0]?.chapter.id
  useEffect(() => { if (currentBlock !== undefined) setOpened((state) => ({ ...state, [currentBlock]: true })) }, [currentBlock])

  const all = [...facts.values()]
  const totals = {
    blocks: blocks.length, lessons: all.filter((item) => item.lesson).length,
    missions: all.filter((item) => !item.lesson && !item.bonus && item.kind).length, bonus: all.filter((item) => item.bonus).length,
    points: all.filter((item) => !item.bonus).reduce((sum, item) => sum + item.points, 0),
    bonusPoints: all.filter((item) => item.bonus).reduce((sum, item) => sum + item.points, 0),
  }
  const needle = fold(query.trim())
  const narrowing = filter !== "all" || needle !== "" || Boolean(objectiveFilter)
  const visible = (mission: M) => {
    const item = facts.get(mission.id)!
    return matches(item, filter) && (!needle || fold(mission.title).includes(needle))
      && (!objectiveFilter || Boolean(mission.definition?.objective_ids.includes(objectiveFilter)))
  }
  const shown = blocks.reduce((sum, { chapter }) => sum + chapter.missions.filter(visible).length, 0)
  const objective = objectives?.find((item) => item.id === objectiveFilter)
  let number = 0

  return <Stack gap="4" aria-label={props.label}>
    <Grid templateColumns={{ base: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", xl: "repeat(5, 1fr)" }} gap="2" as="dl" m="0" aria-label="Compteurs du cours">
      {([["Blocs", totals.blocks], ["Missions", totals.missions], ["Leçons", totals.lessons], ["Bonus", totals.bonus],
        ["Points", `${totals.points}${totals.bonusPoints ? ` + ${totals.bonusPoints} bonus` : ""}`]] as [string, number | string][]).map(([name, value]) =>
        <Box key={name} p="2.5" rounded="md" bg="app.sunken" borderWidth="1px" borderColor="app.border">
          <Text as="dt" fontSize="xs" color="app.muted">{name}</Text>
          <Text as="dd" m="0" fontWeight="bold" fontSize="lg" css={{ fontVariantNumeric: "tabular-nums" }}>{value}</Text>
        </Box>)}
    </Grid>
    <Flex gap="2" wrap="wrap" align="center">
      <Box position="relative" flex="1" minW="44">
        <Box position="absolute" left="2.5" top="50%" transform="translateY(-50%)" color="app.muted" pointerEvents="none"><Icon name="search" size={16} /></Box>
        <Input pl="8" size="sm" type="search" aria-label="Rechercher un élément" placeholder="Rechercher un titre" value={query} onChange={(event) => setQuery(event.target.value)} />
      </Box>
      <NativeSelect.Root size="sm" maxW="56">
        <NativeSelect.Field aria-label="Filtrer par type" value={filter} onChange={(event) => setFilter(event.target.value as OutlineFilter)}>
          {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </NativeSelect.Field><NativeSelect.Indicator />
      </NativeSelect.Root>
    </Flex>
    {objective && <Flex gap="2" align="center" wrap="wrap" p="2" rounded="md" bg="brand.subtle" color="brand.fg" fontSize="sm" role="status">
      <Text>Éléments qui couvrent <Badge variant="outline" colorPalette="brand">{objective.code}</Badge> {objective.statement}</Text>
      <Button size="xs" variant="ghost" colorPalette="brand" onClick={props.onClearObjectiveFilter}>Retirer le filtre</Button>
    </Flex>}
    {narrowing && <Text fontSize="sm" color="app.muted" role="status">{shown} élément{shown > 1 ? "s" : ""} affiché{shown > 1 ? "s" : ""}</Text>}

    <Stack gap="5">
      {modules.map((module, moduleIndex) => {
        const moduleBlocks = module.chapters
        return <Box as="section" key={module.id} aria-label={`Module : ${module.title}`}>
          <Flex align="center" gap="2" wrap="wrap" mb="2">
            <Box color="brand.fg"><Icon name="layers" size={16} /></Box>
            <Text fontSize="sm" fontWeight="bold" color="brand.fg" textTransform="uppercase" letterSpacing="0.06em" flex="1">{module.title}</Text>
            {props.moduleActions?.(module, moduleIndex)}
          </Flex>
          <Stack gap="2">
            {moduleBlocks.map((chapter, chapterIndex) => {
              number += 1
              const items = chapter.missions.filter(visible)
              if (narrowing && items.length === 0) return null
              const chapterFacts = chapter.missions.map((mission) => facts.get(mission.id)!)
              const duration = chapterFacts.filter((item) => !item.bonus).reduce((sum, item) => sum + item.duration, 0)
              const points = chapterFacts.filter((item) => !item.bonus).reduce((sum, item) => sum + item.points, 0)
              const bonusPoints = chapterFacts.filter((item) => item.bonus).reduce((sum, item) => sum + item.points, 0)
              const isOpen = narrowing || chapter.missions.length === 0 || Boolean(opened[chapter.id])
              const panelId = `${baseId}-block-${chapter.id}`
              return <Box key={chapter.id} borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface" overflow="hidden">
                <Flex align="center" gap="2" pr="2" bg="app.sunken" wrap={{ base: "wrap", md: "nowrap" }}>
                  <Button variant="ghost" flex="1" flexBasis={{ base: "100%", md: "auto" }} justifyContent="start" h="auto" minH="11" py="2" px="3" rounded="0" whiteSpace="normal" textAlign="start"
                    aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpened((state) => ({ ...state, [chapter.id]: !isOpen }))}>
                    <Box transform={isOpen ? "rotate(90deg)" : undefined} transition="transform 150ms" color="app.muted"><Icon name="chevron" size={14} /></Box>
                    <Text as="span" fontWeight="bold" color="app.muted" minW="5" css={{ fontVariantNumeric: "tabular-nums" }}>{number}</Text>
                    <Flex as="span" flex="1" gap={{ base: "0.5", md: "3" }} direction={{ base: "column", md: "row" }} align={{ base: "start", md: "center" }}>
                      <Text as="span" fontWeight="semibold" flex="1">{chapter.title}</Text>
                      <Text as="span" fontSize="xs" color="app.muted" fontWeight="normal" css={{ fontVariantNumeric: "tabular-nums" }}>
                        {chapter.missions.length} élément{chapter.missions.length > 1 ? "s" : ""} · {duration} min · {points} pts{bonusPoints ? ` + ${bonusPoints} bonus` : ""}
                      </Text>
                    </Flex>
                  </Button>
                  {props.blockActions && <Box pl={{ base: "3", md: "0" }} pb={{ base: "2", md: "0" }}>{props.blockActions(chapter, chapterIndex, module)}</Box>}
                </Flex>
                <Box id={panelId} hidden={!isOpen}>
                  {chapter.missions.length === 0 && <Text px="3" py="2" fontSize="sm" color="app.muted">Bloc vide.</Text>}
                  <Box as="ul" listStyleType="none" m="0" p="0">
                    {chapter.missions.map((mission, index) => {
                      if (!visible(mission)) return null
                      const item = facts.get(mission.id)!
                      const meta = item.kind ? KIND_META[item.kind] : null
                      const selected = mission.id === selectedId
                      return <Flex as="li" key={mission.id} align="center" gap="2" wrap="wrap" px="3" py="2" borderTopWidth="1px" borderColor="app.border"
                        bg={selected ? "brand.subtle" : undefined} aria-current={selected ? "true" : undefined}>
                        <Button variant="ghost" size="sm" colorPalette="brand" h="auto" minH="8" py="1" px="1.5" whiteSpace="normal" textAlign="start" flex="1" minW="48" justifyContent="start"
                          onClick={() => props.onSelect?.(mission)} fontWeight={selected ? "semibold" : "medium"}>{mission.title}</Button>
                        <Flex gap="1.5" align="center" wrap="wrap" fontSize="xs">
                          {meta && !item.lesson && <Flex gap="1" align="center" color="app.muted" minW="28"><Icon name={meta.icon} size={14} />{meta.label}</Flex>}
                          {item.lesson && <Badge size="sm" colorPalette="brand" variant="subtle"><Icon name="book" size={12} />Leçon</Badge>}
                          {item.bonus && <Badge size="sm" colorPalette="saffron" variant="outline">Bonus</Badge>}
                          {item.run && <Badge size="sm" colorPalette="gray" variant="outline"><Icon name="play" size={10} />Exécution</Badge>}
                          <Text color="app.muted" minW="16" textAlign="right" css={{ fontVariantNumeric: "tabular-nums" }}>{item.lesson ? "—" : `${item.points} pts`} · {item.duration} min</Text>
                          <Flex gap="1" align="center" minW="20" color={item.state === "valid" ? "green.fg" : item.state === "error" ? "red.fg" : "saffron.fg"}>
                            <Icon name={item.state === "valid" ? "check" : "alert"} size={14} />{item.stateLabel}
                          </Flex>
                        </Flex>
                        {props.itemActions?.(mission, index, chapter)}
                      </Flex>
                    })}
                  </Box>
                  {props.blockFooter && <Box px="3" py="2" borderTopWidth="1px" borderColor="app.border">{props.blockFooter(chapter)}</Box>}
                </Box>
              </Box>
            })}
          </Stack>
          {props.moduleFooter && <Box mt="2">{props.moduleFooter(module)}</Box>}
        </Box>
      })}
    </Stack>
  </Stack>
}
