import { useEffect, useState } from "react"
import { Badge, Box, Flex, Heading, NativeSelect, Stack, Table, Tabs, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { CoursePreview, type PreviewTree } from "../CoursePreview"
import type { MissionDefinition } from "../studioTypes"
import { Results } from "../teacher/Results"
import { TeacherProject } from "../project/TeacherProject"
import { ErrorState, LoadingState } from "../student/ui"

type Me = { owner: string; named: boolean; show_answers: boolean; project_access?: boolean }
type ObservedClass = { id: number; cohort: string; course_title: string; version: number; paused: boolean; student_count: number }
type ObservedCourse = PreviewTree & { show_answers: boolean; corrections: Record<string, MissionDefinition> }
type ProgressRow = { position: number; display_name: string; completed: number; total: number; lessons_read: number; lessons_total: number
  core_points: number; core_possible: number; bonus_points: number; attempts: number; current_mission: string | null; active: boolean; needs_help: string[] }
type Progress = { generated_at: string; paused: boolean; named: boolean; students: ProgressRow[] }

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 })

function useLoad<T>(path: string | null): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!path) return
    let active = true
    setData(null)
    setError(null)
    api<T>(path).then((value) => { if (active) setData(value) })
      .catch((reason: unknown) => { if (active && !(reason instanceof ApiError && reason.status === 401)) setError("Chargement impossible. Réessayez dans un instant.") })
    return () => { active = false }
  }, [path])
  return { data, error }
}

/** Read-only observer (ADR-0025): course preview, progress and results of the teacher's classes; no action. */
export function ObserverHome() {
  const me = useLoad<Me>("/observer/me")
  const classes = useLoad<ObservedClass[]>("/observer/classes")
  const [selected, setSelected] = useState<number | null>(null)
  const [tab, setTab] = useState("cours")
  const current = classes.data?.find((item) => item.id === selected) ?? classes.data?.[0] ?? null
  if (classes.error) return <ErrorState message={classes.error} onRetry={() => window.location.reload()} />
  if (!classes.data || !me.data) return <LoadingState label="Chargement de l’espace observateur…" />
  return <Stack gap="6">
    <Stack gap="2">
      <Heading as="h1" size={{ base: "2xl", md: "3xl" }}>Espace observateur</Heading>
      <Box role="note" p="3" rounded="lg" bg="app.sunken" borderWidth="1px" borderColor="app.border" fontSize="sm">
        Accès en <strong>lecture seule</strong> aux classes de {me.data.owner}. Vos consultations sont enregistrées et visibles par l’enseignant.
        {" "}Résultats {me.data.named ? "nominatifs" : "anonymisés"} ; corrigés {me.data.show_answers ? "visibles" : "masqués"}.
      </Box>
    </Stack>
    {classes.data.length === 0 || !current ? <Text>Aucune classe publiée pour le moment.</Text> : <>
      {classes.data.length > 1 && <NativeSelect.Root maxW="md"><NativeSelect.Field aria-label="Classe observée" value={current.id}
        onChange={(event) => setSelected(Number(event.target.value))}>{classes.data.map((item) => <option key={item.id} value={item.id}>{item.cohort} · {item.course_title}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>}
      <Flex gap="2" align="center" wrap="wrap"><Text fontWeight="semibold">{current.cohort}</Text><Text color="app.muted">· {current.course_title} · version {current.version} · {current.student_count} étudiants</Text>
        {current.paused && <Badge colorPalette="saffron" variant="subtle">En pause</Badge>}</Flex>
      <Tabs.Root value={tab} onValueChange={(event) => setTab(event.value)} variant="line" colorPalette="brand" lazyMount>
        <Tabs.List aria-label="Espace observateur">
          <Tabs.Trigger value="cours">Aperçu du cours</Tabs.Trigger>
          <Tabs.Trigger value="progression">Progression</Tabs.Trigger>
          <Tabs.Trigger value="resultats">Résultats</Tabs.Trigger>
          {me.data.project_access && <Tabs.Trigger value="projet">Projet</Tabs.Trigger>}
        </Tabs.List>
        <Tabs.Content value="cours" pt="6"><ObservedCoursePanel assignmentId={current.id} /></Tabs.Content>
        <Tabs.Content value="progression" pt="6"><ProgressPanel assignmentId={current.id} /></Tabs.Content>
        <Tabs.Content value="resultats" pt="6"><Results assignmentId={current.id} scope="observer" /></Tabs.Content>
        {me.data.project_access && <Tabs.Content value="projet" pt="6"><TeacherProject assignmentId={current.id} readOnly /></Tabs.Content>}
      </Tabs.Root>
    </>}
  </Stack>
}

function ObservedCoursePanel({ assignmentId }: { assignmentId: number }) {
  const { data, error } = useLoad<ObservedCourse>(`/observer/classes/${assignmentId}/course`)
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />
  if (!data) return <LoadingState label="Chargement du cours…" />
  const corrections = data.show_answers ? Object.fromEntries(Object.entries(data.corrections).map(([id, value]) => [Number(id), value])) : undefined
  return <Stack gap="3">
    <Text fontSize="sm" color="app.muted">{data.show_answers ? "Corrigés affichés avec l’accord de l’enseignant." : "Vue étudiante : les corrigés ne sont pas affichés."} Aucune exécution ni réponse n’est enregistrée.</Text>
    <CoursePreview course={data} corrections={corrections} readOnly />
  </Stack>
}

function ProgressPanel({ assignmentId }: { assignmentId: number }) {
  const { data, error } = useLoad<Progress>(`/observer/classes/${assignmentId}/progress`)
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />
  if (!data) return <LoadingState label="Chargement de la progression…" />
  return <Stack gap="3">
    <Text fontSize="sm" color="app.muted">Mise à jour : {new Date(data.generated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}. Noms {data.named ? "affichés" : "anonymisés"}.</Text>
    <Box overflowX="auto" tabIndex={0} role="region" aria-label="Progression de la classe" borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface">
      <Table.Root size="sm" aria-label="Progression de la classe">
        <Table.Header><Table.Row bg="app.sunken">{["Étudiant", "Missions réussies", "Leçons lues", "Points principaux", "Points bonus", "Essais", "En cours", "Besoin d’aide"].map((label) =>
          <Table.ColumnHeader key={label} scope="col" whiteSpace="nowrap">{label}</Table.ColumnHeader>)}</Table.Row></Table.Header>
        <Table.Body>{data.students.map((row) => <Table.Row key={row.position}>
          <Table.Cell fontWeight="semibold" whiteSpace="nowrap">{row.display_name}{row.active ? " · actif" : ""}</Table.Cell>
          <Table.Cell>{row.completed} / {row.total}</Table.Cell>
          <Table.Cell>{row.lessons_read} / {row.lessons_total}</Table.Cell>
          <Table.Cell>{number.format(row.core_points)} / {row.core_possible}</Table.Cell>
          <Table.Cell>{number.format(row.bonus_points)}</Table.Cell>
          <Table.Cell>{row.attempts}</Table.Cell>
          <Table.Cell>{row.current_mission ?? "—"}</Table.Cell>
          <Table.Cell>{row.needs_help.length ? row.needs_help.join(", ") : "—"}</Table.Cell>
        </Table.Row>)}</Table.Body>
      </Table.Root>
    </Box>
  </Stack>
}
