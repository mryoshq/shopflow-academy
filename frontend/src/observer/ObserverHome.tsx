import { formatDate, formatDateTime, formatNumber, t } from "../i18n"
import { useEffect, useMemo, useState } from "react"
import { Badge, Box, Button, Flex, Heading, Input, NativeSelect, SimpleGrid, Stack, Table, Tabs, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { CoursePreview, type PreviewTree } from "../CoursePreview"
import type { MissionDefinition } from "../studioTypes"
import { TeacherProject } from "../project/TeacherProject"
import { ErrorState, LoadingState, Panel, ScoreBar } from "../student/ui"
import { DataView } from "../student/activities"
import { DataTable } from "../student/displays"
import { SidePanel } from "../teacher/SidePanel"
import { KIND_LABEL, type ObserverKind } from "../teacher/ObserversPanel"

type Rights = { named: boolean; grades: boolean; export: boolean; project: boolean; student_file: boolean; answers: boolean }
type Me = { owner: string; full_name: string; kind: ObserverKind; rights: Rights }
type ObservedClass = { id: number; cohort: string; course_title: string; version: number; paused: boolean; student_count: number }
type ObservedCourse = PreviewTree & { show_answers: boolean; corrections: Record<string, MissionDefinition> }
type Dashboard = { students: number; mean_progress: number | null; success_rate: number | null; bonus_points: number; bonus_students: number
  work_minutes_total: number; work_minutes_mean: number; blocks_open: number; blocks_total: number; missions: number
  course_title: string; version: number; cohort: string; generated_at: string; named: boolean; progress: { name: string; completed: number; total: number }[] }
type Charts = { progression: { day: string; percent: number }[]; modules: { label: string; percent: number }[]; objectives: { label: string; percent: number }[]
  grades: { label: string; count: number }[]; activity: { day: string; attempts: number; hints: number; help: number }[] }
type GradeRow = { id: number; name: string; core_points: number; core_possible: number; percent: number; completed: number; total: number
  bonus_points: number; lessons_read: number; lessons_total: number; project_total: number | null }
type StudentFile = { id: number; name: string; percent: number; summary: { completed: number; total: number; core_points: number; core_possible: number; bonus_points: number }
  modules: { title: string; completed: number; total: number; points: number; possible: number }[]
  level: { number: number; name: string; xp: number }; badges: { key: string; label: string }[]; badge_count: number
  project: { partners: string[]; common: number | null; individual: number | null; total: number | null } | null }

function useLoad<T>(path: string | null): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!path) return
    let active = true
    setData(null); setError(null)
    api<T>(path).then((value) => { if (active) setData(value) })
      .catch((reason: unknown) => { if (active && !(reason instanceof ApiError && reason.status === 401)) setError(t("Chargement impossible. Réessayez dans un instant.")) })
    return () => { active = false }
  }, [path])
  return { data, error }
}

/** « Étudiant N » comes from the server in French (stable alias of a guest account). */
const alias = (name: string) => { const match = /^Étudiant (\d+)$/.exec(name); return match ? t("Étudiant {{n}}", { n: match[1] }) : name }
const pct = (value: number | null) => value === null ? "—" : `${formatNumber(value)} %`
const duration = (minutes: number) => minutes < 60 ? t("{{minutes}} min", { minutes }) : t("{{hours}} h {{minutes}}", { hours: Math.floor(minutes / 60), minutes: String(minutes % 60).padStart(2, "0") })

/** Professional observer space (ADR-0042): read only, rights by account type (« Administration » or « Invité »). */
export function ObserverHome() {
  const me = useLoad<Me>("/observer/me")
  const classes = useLoad<ObservedClass[]>("/observer/classes")
  const [selected, setSelected] = useState<number | null>(null)
  const [tab, setTab] = useState("tableau")
  const current = classes.data?.find((item) => item.id === selected) ?? classes.data?.[0] ?? null
  if (classes.error || me.error) return <ErrorState message={(classes.error ?? me.error)!} onRetry={() => window.location.reload()} />
  if (!classes.data || !me.data) return <LoadingState label={t("Chargement de l’espace observateur…")} />
  const rights = me.data.rights
  return <Stack gap="6">
    <Stack gap="2">
      <Flex gap="3" align="center" wrap="wrap"><Heading as="h1" size={{ base: "2xl", md: "3xl" }}>{t("Espace observateur")}</Heading>
        <Badge colorPalette={me.data.kind === "admin" ? "brand" : "gray"} variant="subtle" size="lg">{t(KIND_LABEL[me.data.kind])}</Badge></Flex>
      <Box role="note" p="3" rounded="lg" bg="app.sunken" borderWidth="1px" borderColor="app.border" fontSize="sm">
        {t("{{name}}, vous consultez en lecture seule les classes de {{owner}}. Vos consultations sont enregistrées et visibles par l’enseignant.", { name: me.data.full_name || t("Bonjour"), owner: me.data.owner })}{" "}
        {rights.named ? t("Noms réels ; notes et exports disponibles.") : t("Données anonymisées (Étudiant 1, 2…) ; pas de note individuelle ni d’export.")}
      </Box>
    </Stack>
    {classes.data.length === 0 || !current ? <Text>{t("Aucune classe publiée pour le moment.")}</Text> : <>
      {classes.data.length > 1 && <NativeSelect.Root maxW="md"><NativeSelect.Field aria-label={t("Classe observée")} value={current.id}
        onChange={(event) => setSelected(Number(event.target.value))}>{classes.data.map((item) => <option key={item.id} value={item.id}>{item.cohort} · {item.course_title}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>}
      <Flex gap="2" align="center" wrap="wrap"><Text fontWeight="semibold">{current.cohort}</Text><Text color="app.muted">· {current.course_title} {t("· version")}{" "}{current.version} · {current.student_count} {t("étudiants")}</Text>
        {current.paused && <Badge colorPalette="saffron" variant="subtle">{t("En pause")}</Badge>}</Flex>
      <Tabs.Root value={tab} onValueChange={(event) => setTab(event.value)} variant="line" colorPalette="brand" lazyMount>
        <Tabs.List aria-label={t("Espace observateur")} overflowX="auto">
          <Tabs.Trigger value="tableau">{t("Tableau de bord")}</Tabs.Trigger>
          <Tabs.Trigger value="graphiques">{t("Graphiques")}</Tabs.Trigger>
          {rights.grades && <Tabs.Trigger value="notes">{t("Notes")}</Tabs.Trigger>}
          <Tabs.Trigger value="cours">{t("Cours")}</Tabs.Trigger>
          {rights.project && <Tabs.Trigger value="projet">{t("Projet")}</Tabs.Trigger>}
        </Tabs.List>
        <Tabs.Content value="tableau" pt="6"><DashboardPanel assignmentId={current.id} /></Tabs.Content>
        <Tabs.Content value="graphiques" pt="6"><ChartsPanel assignmentId={current.id} /></Tabs.Content>
        {rights.grades && <Tabs.Content value="notes" pt="6"><GradesPanel assignmentId={current.id} /></Tabs.Content>}
        <Tabs.Content value="cours" pt="6"><ObservedCoursePanel assignmentId={current.id} /></Tabs.Content>
        {rights.project && <Tabs.Content value="projet" pt="6"><TeacherProject assignmentId={current.id} readOnly /></Tabs.Content>}
      </Tabs.Root>
    </>}
  </Stack>
}

function Indicator({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <Panel as="section" aria-label={label} p="4"><Stack gap="1">
    <Text fontSize="xs" fontWeight="semibold" color="app.muted" textTransform="uppercase" letterSpacing="0.06em">{label}</Text>
    <Text fontSize="2xl" fontWeight="bold" css={{ fontVariantNumeric: "tabular-nums" }}>{value}</Text>
    {detail && <Text fontSize="xs" color="app.muted">{detail}</Text>}
  </Stack></Panel>
}

function DashboardPanel({ assignmentId }: { assignmentId: number }) {
  const { data, error } = useLoad<Dashboard>(`/observer/classes/${assignmentId}/dashboard`)
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />
  if (!data) return <LoadingState label={t("Chargement du tableau de bord…")} />
  return <Stack gap="5">
    <Text fontSize="sm" color="app.muted">{t("Mis à jour le {{date}} · {{course}}, version {{version}}.", { date: formatDateTime(data.generated_at), course: data.course_title, version: data.version })}</Text>
    <SimpleGrid columns={{ base: 2, md: 3 }} gap="3">
      <Indicator label={t("Étudiants")} value={String(data.students)} detail={t("{{n}} missions principales", { n: data.missions })} />
      <Indicator label={t("Progression moyenne")} value={pct(data.mean_progress)} detail={t("missions principales réussies")} />
      <Indicator label={t("Réussite")} value={pct(data.success_rate)} detail={t("essais justes sur l’ensemble des essais")} />
      <Indicator label={t("Bonus")} value={formatNumber(data.bonus_points)} detail={t("points ; {{n}} étudiant(s) concerné(s)", { n: data.bonus_students })} />
      <Indicator label={t("Temps de travail")} value={duration(data.work_minutes_mean)} detail={t("moyenne estimée par étudiant")} />
      <Indicator label={t("Blocs ouverts")} value={`${data.blocks_open} / ${data.blocks_total}`} />
    </SimpleGrid>
    <Panel as="section" aria-labelledby="progress-title"><Stack gap="3">
      <Heading as="h2" size="md" id="progress-title">{t("Progression par étudiant")}</Heading>
      <Text fontSize="xs" color="app.muted">{data.named ? t("Noms réels.") : t("Anonymisé : chaque étudiant garde le même numéro pour votre compte.")}</Text>
      <Stack as="ul" listStyleType="none" p="0" m="0" gap="2">{data.progress.map((row) => <Box as="li" key={row.name}>
        <Flex justify="space-between" fontSize="sm" gap="2"><Text fontWeight="medium">{alias(row.name)}</Text><Text color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }}>{row.completed} / {row.total}</Text></Flex>
        <ScoreBar value={row.completed} max={Math.max(1, row.total)} label={t("{{name}} : {{completed}} missions sur {{total}}", { name: alias(row.name), completed: row.completed, total: row.total })} />
      </Box>)}</Stack>
    </Stack></Panel>
  </Stack>
}

function ChartsPanel({ assignmentId }: { assignmentId: number }) {
  const { data, error } = useLoad<Charts>(`/observer/classes/${assignmentId}/charts`)
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />
  if (!data) return <LoadingState label={t("Chargement des graphiques…")} />
  const empty = <Text fontSize="sm" color="app.muted">{t("Pas encore de données.")}</Text>
  return <SimpleGrid columns={{ base: 1, lg: 2 }} gap="4">
    <Box as="section" aria-label={t("Progression dans le temps")}>{data.progression.length ? <DataView data={{ kind: "line_chart", title: t("Progression dans le temps"), unit: "%",
      labels: data.progression.map((item) => formatDate(item.day, { day: "2-digit", month: "2-digit" })), series: [{ name: t("Missions réussies (classe)"), values: data.progression.map((item) => item.percent) }] }} /> : empty}</Box>
    <Box as="section" aria-label={t("Réussite par module")}>{data.modules.length ? <DataView data={{ kind: "bar_chart", title: t("Réussite par module"), unit: "%",
      labels: data.modules.map((item) => item.label), values: data.modules.map((item) => item.percent) }} /> : empty}</Box>
    <Box as="section" aria-label={t("Réussite par objectif")}>{data.objectives.length ? <DataView data={{ kind: "bar_chart", title: t("Réussite par objectif"), unit: "%",
      labels: data.objectives.map((item) => item.label), values: data.objectives.map((item) => item.percent) }} /> : empty}</Box>
    <Box as="section" aria-label={t("Répartition des notes")}><DataView data={{ kind: "bar_chart", title: t("Répartition des notes (sans nom)"), unit: t("étudiants"),
      labels: data.grades.map((item) => item.label), values: data.grades.map((item) => item.count) }} /></Box>
    <Box as="section" aria-label={t("Activité par séance")} gridColumn={{ lg: "1 / -1" }}>{data.activity.length
      ? <DataTable caption={t("Activité par séance (nombres seulement)")} columns={[t("Séance"), t("Essais"), t("Indices"), t("Demandes d’aide")]}
        rows={data.activity.map((item) => [formatDate(item.day), item.attempts, item.hints, item.help])} /> : empty}</Box>
  </SimpleGrid>
}

type SortKey = "name" | "percent" | "completed" | "bonus_points" | "project_total"

function GradesPanel({ assignmentId }: { assignmentId: number }) {
  const { data, error } = useLoad<{ generated_at: string; students: GradeRow[] }>(`/observer/classes/${assignmentId}/grades`)
  const [filter, setFilter] = useState("")
  const [sort, setSort] = useState<{ key: SortKey; down: boolean }>({ key: "name", down: false })
  const [open, setOpen] = useState<number | null>(null)
  const rows = useMemo(() => {
    const list = (data?.students ?? []).filter((row) => row.name.toLowerCase().includes(filter.trim().toLowerCase()))
    return [...list].sort((a, b) => {
      const x = a[sort.key] ?? -1, y = b[sort.key] ?? -1
      const order = typeof x === "string" ? x.localeCompare(String(y)) : Number(x) - Number(y)
      return sort.down ? -order : order
    })
  }, [data, filter, sort])
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />
  if (!data) return <LoadingState label={t("Chargement des notes…")} />
  const header = (key: SortKey, label: string) => <Table.ColumnHeader scope="col" aria-sort={sort.key === key ? (sort.down ? "descending" : "ascending") : "none"}>
    <Button variant="plain" size="sm" p="0" h="auto" fontWeight="semibold" onClick={() => setSort({ key, down: sort.key === key ? !sort.down : key !== "name" })}>
      {label}{sort.key === key ? (sort.down ? " ↓" : " ↑") : ""}</Button></Table.ColumnHeader>
  return <Stack gap="4">
    <Flex gap="3" wrap="wrap" align="end" justify="space-between">
      <Box maxW="xs" w="full"><Text asChild fontSize="sm" fontWeight="medium"><label htmlFor="grade-filter">{t("Filtrer par nom")}</label></Text>
        <Input id="grade-filter" size="sm" value={filter} onChange={(event) => setFilter(event.target.value)} /></Box>
      <Flex gap="2" wrap="wrap">
        <Button size="sm" variant="outline" asChild><a href={`/api/v1/observer/classes/${assignmentId}/grades.csv`} download>{t("Exporter (CSV)")}</a></Button>
        <Button size="sm" colorPalette="brand" asChild><a href={`/api/v1/observer/classes/${assignmentId}/report.pdf`} download>{t("Rapport de classe (PDF)")}</a></Button>
      </Flex>
    </Flex>
    <Text fontSize="xs" color="app.muted">{t("Note du cours et note du projet sur 20, séparées. Mis à jour le {{date}}.", { date: formatDateTime(data.generated_at) })}</Text>
    <Box overflowX="auto" tabIndex={0} role="region" aria-label={t("Notes de la classe")} borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface">
      <Table.Root size="sm" aria-label={t("Notes de la classe")}>
        <Table.Header><Table.Row bg="app.sunken">{header("name", t("Étudiant"))}{header("percent", t("Cours"))}{header("completed", t("Missions"))}
          {header("bonus_points", t("Bonus"))}{header("project_total", t("Projet /20"))}<Table.ColumnHeader scope="col">{t("Fiche")}</Table.ColumnHeader></Table.Row></Table.Header>
        <Table.Body>{rows.map((row) => <Table.Row key={row.id}>
          <Table.Cell fontWeight="semibold">{row.name}</Table.Cell>
          <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(row.core_points)} / {row.core_possible} ({pct(row.percent)})</Table.Cell>
          <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{row.completed} / {row.total}</Table.Cell>
          <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(row.bonus_points)}</Table.Cell>
          <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{row.project_total === null ? "—" : formatNumber(row.project_total)}</Table.Cell>
          <Table.Cell><Button size="xs" variant="outline" onClick={() => setOpen(row.id)} aria-label={t("Fiche de {{name}}", { name: row.name })}>{t("Fiche")}</Button></Table.Cell>
        </Table.Row>)}</Table.Body>
      </Table.Root>
    </Box>
    <StudentFilePanel assignmentId={assignmentId} studentId={open} onClose={() => setOpen(null)} />
  </Stack>
}

function StudentFilePanel({ assignmentId, studentId, onClose }: { assignmentId: number; studentId: number | null; onClose: () => void }) {
  const { data } = useLoad<StudentFile>(studentId === null ? null : `/observer/classes/${assignmentId}/students/${studentId}`)
  return <SidePanel open={studentId !== null} title={data ? t("Fiche : {{name}}", { name: data.name }) : t("Fiche de l’étudiant")} onClose={onClose}>
    {!data ? <LoadingState label={t("Chargement de la fiche…")} /> : <Stack gap="4">
      <Text>{t("Cours : {{points}} / {{possible}} points ({{percent}}), {{completed}} missions sur {{total}}, bonus {{bonus}}.", {
        points: formatNumber(data.summary.core_points), possible: data.summary.core_possible, percent: pct(data.percent),
        completed: data.summary.completed, total: data.summary.total, bonus: formatNumber(data.summary.bonus_points) })}</Text>
      <Stack gap="2"><Heading as="h3" size="sm">{t("Progression par module")}</Heading>
        {data.modules.map((module) => <Box key={module.title}><Flex justify="space-between" fontSize="sm"><Text>{module.title}</Text><Text color="app.muted">{module.completed} / {module.total}</Text></Flex>
          <ScoreBar value={module.completed} max={Math.max(1, module.total)} label={t("{{name}} : {{completed}} missions sur {{total}}", { name: module.title, completed: module.completed, total: module.total })} /></Box>)}</Stack>
      <Stack gap="1"><Heading as="h3" size="sm">{t("Niveau et badges")}</Heading>
        <Text fontSize="sm">{t("Niveau {{number}} : {{name}} ({{xp}} XP)", { number: data.level.number, name: data.level.name, xp: data.level.xp })}</Text>
        <Text fontSize="sm" color="app.muted">{data.badges.length ? data.badges.map((badge) => badge.label).join(" · ") : t("Aucun badge pour le moment.")}</Text></Stack>
      <Stack gap="1"><Heading as="h3" size="sm">{t("Projet")}</Heading>
        {data.project ? <Text fontSize="sm">{t("Binôme : {{partners}}. Note : {{total}} / 20.", { partners: data.project.partners.join(", ") || "—", total: data.project.total === null ? "—" : formatNumber(data.project.total) })}</Text>
          : <Text fontSize="sm" color="app.muted">{t("Pas encore de binôme.")}</Text>}</Stack>
    </Stack>}
  </SidePanel>
}

function ObservedCoursePanel({ assignmentId }: { assignmentId: number }) {
  const { data, error } = useLoad<ObservedCourse>(`/observer/classes/${assignmentId}/course`)
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />
  if (!data) return <LoadingState label={t("Chargement du cours…")} />
  const corrections = data.show_answers ? Object.fromEntries(Object.entries(data.corrections).map(([id, value]) => [Number(id), value])) : undefined
  return <Stack gap="3">
    <Text fontSize="sm" color="app.muted">{data.show_answers ? t("Corrigés affichés avec l’accord de l’enseignant.") : t("Vue étudiante : les corrigés ne sont pas affichés.")} {t("Aucune exécution ni réponse n’est enregistrée.")}</Text>
    <CoursePreview course={data} corrections={corrections} readOnly />
  </Stack>
}
