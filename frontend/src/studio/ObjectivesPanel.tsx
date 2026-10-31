import { t, tn } from "../i18n"
import { useId, useState } from "react"
import { Badge, Box, Button, Flex, Heading, Input, Stack, Text } from "@chakra-ui/react"
import type { CourseModule, Mission, Objective } from "../studioTypes"
import { Icon } from "../student/ui"
import { BLOCK_CATEGORY, objectiveCategory } from "./kinds"

const ORDER = ["SQL", "Python"]

/** Objectives grouped by category, with the number of covering items (click → filter the outline). */
export function ObjectivesPanel({ objectives, modules, onFilter, form }: {
  objectives: Objective[]; modules: CourseModule<Mission>[]; onFilter: (objectiveId: number) => void; form?: React.ReactNode
}) {
  const missions = modules.flatMap((module) => module.chapters.flatMap((chapter) => chapter.missions))
  const coverage = (id: number) => missions.filter((mission) => mission.definition?.objective_ids.includes(id)).length
  const groups = new Map<string, Objective[]>()
  for (const objective of objectives) {
    const name = objectiveCategory(objective.code, objective.category)
    groups.set(name, [...(groups.get(name) ?? []), objective])
  }
  const names = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "fr"))
  const uncovered = objectives.filter((objective) => coverage(objective.id) === 0).length
  return <Stack gap="3">
    <Flex align="center" gap="2" wrap="wrap"><Heading as="h4" size="md" flex="1">{t("Objectifs pédagogiques")}</Heading>
      {uncovered > 0 && <Badge colorPalette="saffron" variant="subtle"><Icon name="alert" size={12} />{uncovered} {t("sans mission")}</Badge>}</Flex>
    {objectives.length === 0 && <Text color="app.muted">{t("Aucun objectif pour le moment.")}</Text>}
    {names.map((name) => <Group key={name} name={name} items={groups.get(name)!} coverage={coverage} onFilter={onFilter} />)}
    {form}
  </Stack>
}

function rank(name: string): number {
  const index = ORDER.indexOf(name)
  if (index >= 0) return index
  return name === BLOCK_CATEGORY ? 100 : name === "Autres objectifs" ? 50 : 10
}

function Group({ name, items, coverage, onFilter }: { name: string; items: Objective[]; coverage: (id: number) => number; onFilter: (id: number) => void }) {
  const id = useId()
  const [open, setOpen] = useState(name !== BLOCK_CATEGORY)
  const missing = items.filter((item) => coverage(item.id) === 0).length
  return <Box borderWidth="1px" borderColor="app.border" rounded="lg" overflow="hidden">
    <Button variant="ghost" w="full" justifyContent="start" rounded="0" bg="app.sunken" h="auto" minH="10" py="2" px="3" whiteSpace="normal" textAlign="start"
      aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <Box transform={open ? "rotate(90deg)" : undefined} transition="transform 150ms" color="app.muted"><Icon name="chevron" size={14} /></Box>
      <Text as="span" fontWeight="semibold" flex="1">{t(name)}</Text>
      <Text as="span" fontSize="xs" color="app.muted" fontWeight="normal">{tn("{{count}} objectif", items.length)}{missing ? t(" · {{missing}} sans mission", { missing }) : ""}</Text>
    </Button>
    <Box as="ul" id={id} hidden={!open} listStyleType="none" m="0" p="0">
      {items.map((objective) => {
        const count = coverage(objective.id)
        return <Flex as="li" key={objective.id} gap="2" align="center" wrap="wrap" px="3" py="2" borderTopWidth="1px" borderColor="app.border">
          <Badge variant="outline" colorPalette="brand" fontFamily="mono">{objective.code}</Badge>
          <Text flex="1" minW="48" fontSize="sm">{objective.statement}</Text>
          {count === 0
            ? <Flex gap="1" align="center" fontSize="xs" color="saffron.fg" fontWeight="semibold"><Icon name="alert" size={14} />{t("Aucune mission ne le couvre")}</Flex>
            : <Button size="xs" variant="outline" colorPalette="brand" onClick={() => onFilter(objective.id)}
              aria-label={tn("Afficher les {{count}} élément qui couvrent {{code}}", count, { code: objective.code })}>{tn("{{count}} élément", count)}</Button>}
        </Flex>
      })}
    </Box>
  </Box>
}

export function NewObjectiveFields(props: { code: string; statement: string; category: string; disabled: boolean; placeholder: string
  onCode: (value: string) => void; onStatement: (value: string) => void; onCategory: (value: string) => void }) {
  return <Flex gap="2" wrap="wrap">
    <Input aria-label={t("Code de l’objectif")} value={props.code} onChange={(event) => props.onCode(event.target.value)} placeholder={props.placeholder} maxW="40" disabled={props.disabled} />
    <Input aria-label={t("Description de l’objectif")} value={props.statement} onChange={(event) => props.onStatement(event.target.value)} placeholder={t("Ce que l’étudiant saura faire")} flex="1" minW="44" disabled={props.disabled} />
    <Input aria-label={t("Catégorie (facultatif)")} value={props.category} onChange={(event) => props.onCategory(event.target.value)} placeholder={t("Catégorie (facultatif)")} maxW="48" disabled={props.disabled} />
  </Flex>
}
