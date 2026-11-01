import { useState } from "react"
import { Badge, Box, Button, Field, Flex, Heading, Input, SimpleGrid, Stack, Table, Text, Textarea } from "@chakra-ui/react"
import { formatNumber, msg, t } from "../i18n"
import { Panel } from "../student/ui"
import type { GridLine, TeacherProjectData } from "./types"

type Team = TeacherProjectData["teams"][number]
type Act = (method: string, path: string, body: unknown, success: string) => Promise<boolean>

/** Labels of the grid, translated here (the server sends the same French text). */
const LABELS: Record<string, string> = {
  p1_model: msg("Modèle relationnel et contraintes"), p1_sql: msg("Trois analyses SQL, tableaux et graphique"),
  p1_python: msg("Contrôles Python, quarantaine et rapport"), p1_load: msg("Chargement transactionnel, rejeu et prise en charge automatique"),
  p1_proofs: msg("Preuves reproductibles et compréhension (commun)"),
  b1_plan: msg("Plan SQL avant et après index"), b1_recursive: msg("Analyse récursive ou précalcul"), b1_chunks: msg("Lecture par morceaux"), b1_api: msg("IoT ou API"),
  p2_airflow: msg("Airflow et reprise"), p2_mongo: msg("Événements MongoDB"), p2_redis: "Redis", p2_time: msg("Tentatives et analyse temporelle"),
  p2_repro: msg("Reproductibilité et explication du groupe"),
  b2_queue: msg("File avec acquittement"), b2_metrics: msg("Mesures et conservation"), b2_sensor: msg("Capteur local simulé"), b2_resume: msg("Reprise approfondie"),
}
const PART_TITLES: Record<string, string> = { part1: msg("Partie 1 (axes 1 et 2), socle sur 10"), part2: msg("Partie 2 (axes 3 et 4), socle sur 10, commun au groupe") }
const label = (line: GridLine) => LABELS[line.key] ? t(LABELS[line.key]) : line.label
const text = (value: number | null | undefined) => value === null || value === undefined ? "" : String(value).replace(".", ",")
const number = (value: string) => value.trim() === "" ? null : Number(value.replace(",", "."))
const shown = (value: number | null) => value === null ? "—" : formatNumber(value)

/** ADR-0046, Projet > Notes: the grid of the two subjects, by team, with the individual point of each student. */
export function ProjectGrades({ data, readOnly, act }: { data: TeacherProjectData; readOnly: boolean; act: Act }) {
  return <Stack gap="4">
    <Text fontSize="sm" color="app.muted">{t("Projet sur 20 (socle) + 10 (bonus). Partie 1 : socle 10, dont 1 point individuel par étudiant ; partie 2 : socle 10, commun au groupe. Bonus : 5 au plus par partie.")}</Text>
    {data.teams.length === 0 ? <Text color="app.muted">{t("Aucun binôme à noter.")}</Text>
      : data.teams.map((team) => <GradeForm key={team.id} team={team} data={data} readOnly={readOnly} act={act} />)}
  </Stack>
}

function GradeForm({ team, data, readOnly, act }: { team: Team; data: TeacherProjectData; readOnly: boolean; act: Act }) {
  const names = team.members.map((m) => m.name)
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(team.grade.criteria).map(([k, v]) => [k, text(v)])))
  const [individual, setIndividual] = useState<Record<string, string>>(() => Object.fromEntries(team.grade.students.map((s) => [String(s.id), text(s.individual)])))
  const [comment, setComment] = useState(team.grade.comment)
  const invalid = (line: GridLine) => { const v = number(values[line.key] ?? ""); return v !== null && (Number.isNaN(v) || v < 0 || v > line.max) }
  const lines = data.grid.parts.flatMap((part) => [...part.base, ...part.bonus])
  const individualMax = data.grid.parts[0]?.individual_max ?? 1
  const wrongIndividual = Object.values(individual).some((v) => { const n = number(v); return n !== null && (Number.isNaN(n) || n < 0 || n > individualMax) })
  const blocked = lines.some(invalid) || wrongIndividual

  const field = (line: GridLine) => <Field.Root key={line.key} invalid={invalid(line)}>
    <Field.Label fontSize="sm">{label(line)} <Text as="span" color="app.muted">/{line.max}</Text></Field.Label>
    <Input inputMode="decimal" size="sm" maxW="24" value={values[line.key] ?? ""} disabled={readOnly}
      onChange={(event) => setValues({ ...values, [line.key]: event.target.value })} />
  </Field.Root>

  return <Panel as="section" aria-label={t("Note de {{p0}}", { p0: names.join(" et ") })}><Stack gap="4">
    <Heading as="h3" size="sm">{names.join(" + ")}</Heading>
    <SimpleGrid columns={{ base: 1, lg: 2 }} gap="5">
      {data.grid.parts.map((part) => <Box key={part.key} as="fieldset" borderWidth="1px" borderColor="app.border" rounded="lg" p="3">
        <Text as="legend" px="1" fontWeight="semibold" fontSize="sm">{PART_TITLES[part.key] ? t(PART_TITLES[part.key]) : part.title}</Text>
        <Stack gap="2.5">
          {part.base.map(field)}
          {part.individual_max > 0 && team.grade.students.map((student) => <Field.Root key={student.id}>
            <Field.Label fontSize="sm">{t("Point individuel de {{name}}", { name: student.name })} <Text as="span" color="app.muted">/{part.individual_max}</Text></Field.Label>
            <Input inputMode="decimal" size="sm" maxW="24" value={individual[String(student.id)] ?? ""} disabled={readOnly}
              onChange={(event) => setIndividual({ ...individual, [String(student.id)]: event.target.value })} />
          </Field.Root>)}
          <Text fontSize="sm" fontWeight="semibold" pt="1">{t("Bonus (5 au plus)")}</Text>
          {part.bonus.map(field)}
        </Stack>
      </Box>)}
    </SimpleGrid>
    <Table.ScrollArea borderWidth="1px" borderColor="app.border" rounded="md" tabIndex={0} role="region" aria-label={t("Récapitulatif de {{p0}}", { p0: names.join(" et ") })}>
      <Table.Root size="sm" css={{ fontVariantNumeric: "tabular-nums" }}>
        <Table.Header><Table.Row><Table.ColumnHeader>{t("Étudiant")}</Table.ColumnHeader><Table.ColumnHeader>{t("Partie 1 /10")}</Table.ColumnHeader>
          <Table.ColumnHeader>{t("Partie 2 /10")}</Table.ColumnHeader><Table.ColumnHeader>{t("Socle /20")}</Table.ColumnHeader><Table.ColumnHeader>{t("Bonus /10")}</Table.ColumnHeader></Table.Row></Table.Header>
        <Table.Body>{team.grade.students.map((s) => <Table.Row key={s.id}><Table.Cell>{s.name}{!s.complete && s.base !== null ? <Badge ml="2" size="sm" variant="subtle">{t("incomplet")}</Badge> : null}</Table.Cell>
          <Table.Cell>{shown(s.part1)}</Table.Cell><Table.Cell>{shown(s.part2)}</Table.Cell><Table.Cell fontWeight="semibold">{shown(s.base)}</Table.Cell><Table.Cell>{shown(s.bonus)}</Table.Cell></Table.Row>)}</Table.Body>
      </Table.Root>
    </Table.ScrollArea>
    {team.grade.legacy && <LegacyGrade legacy={team.grade.legacy} />}
    <Field.Root><Field.Label fontSize="sm">{t("Commentaire")}</Field.Label><Textarea rows={2} value={comment} disabled={readOnly} onChange={(event) => setComment(event.target.value)} /></Field.Root>
    {!readOnly && <Flex gap="3" align="center" wrap="wrap">
      <Button colorPalette="brand" disabled={blocked} onClick={() => void act("PUT", `/teacher/project/teams/${team.id}/grade`, {
        criteria: Object.fromEntries(lines.map((line) => [line.key, number(values[line.key] ?? "")]).filter(([, v]) => v !== null)),
        individual: Object.fromEntries(Object.entries(individual).map(([k, v]) => [k, number(v)]).filter(([, v]) => v !== null)), comment,
      }, t("Note du projet enregistrée."))}>{t("Enregistrer la note")}</Button>
      {blocked && <Text fontSize="sm" color="red.fg" role="alert">{t("Une note dépasse son barème.")}</Text>}
    </Flex>}
  </Stack></Panel>
}

/** The former grid, untouched: shown so that the teacher can enter it again on the new grid. */
function LegacyGrade({ legacy }: { legacy: NonNullable<Team["grade"]["legacy"]> }) {
  const parts = [["SQL", legacy.sql, 4], ["Python", legacy.python, 4], [t("MongoDB et Redis"), legacy.nosql, 3], ["Airflow", legacy.airflow, 3],
    [t("Reproductibilité et preuves"), legacy.reproducibility, 2]] as const
  return <Box borderWidth="1px" borderStyle="dashed" borderColor="saffron.solid" bg="saffron.subtle" rounded="md" p="3" data-testid="legacy-grade">
    <Text fontWeight="semibold" fontSize="sm">{t("Ancienne grille, à reprendre")}</Text>
    <Text fontSize="xs" color="app.muted" mb="1">{t("Saisie sur l’ancienne grille : conservée telle quelle, elle ne compte plus.")}</Text>
    <Text fontSize="sm" css={{ fontVariantNumeric: "tabular-nums" }}>{parts.map(([name, value, max]) => `${name} ${shown(value)}/${max}`).join(" · ")}</Text>
    <Text fontSize="sm" css={{ fontVariantNumeric: "tabular-nums" }}>{legacy.students.map((s) => t("{{name}} : compréhension {{individual}}/4, total {{total}}/20",
      { name: s.name, individual: shown(s.individual), total: shown(s.total) })).join(" · ")}</Text>
  </Box>
}
