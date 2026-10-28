import { useCallback, useEffect, useRef, useState } from "react"
import { Badge, Box, Button, Flex, Heading, NativeSelect, Stack, Table, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { ErrorState, Icon, LoadingState, Panel, StatusBadge, formatPoints } from "../student/ui"
import type { MissionStatus } from "../student/types"

export const REFRESH_MS = 5000

export type ClassSummary = { id: number; cohort: string; course_title: string; version: number; paused: boolean; student_count: number }
export type OverviewStudent = {
  id: number; display_name: string; completed: number; total: number; core_points: number; core_possible: number; bonus_points: number
  attempts: number; hints: number; current_mission: string | null; last_activity: string | null; active: boolean; needs_help: string[]
  /** ADR-0027: attempts marked « rapide » (no sanction). */
  fast_attempts?: number
}
export type Overview = {
  generated_at: string; assignment_id: number; cohort: string; course_title: string; version: number; paused: boolean
  missions: { mission_version_id: number; title: string }[]; students: OverviewStudent[]
}
type StudentDetail = {
  id: number; display_name: string
  missions: { mission_version_id: number; title: string; status: MissionStatus; locked_by: string[]; unlocked_by_teacher: boolean; best_points: number; possible: number; bonus: boolean; attempts: number; hints: number; fast_attempts?: number }[]
  attempts: { id: number; mission: string; created_at: string; correct: boolean; points: number; fast?: boolean; percent?: number | null }[]
}
type Intervention = { id: number; action: string; actor: string; created_at: string; details: Record<string, string> }

const ACTIONS: Record<string, string> = {
  "class.pause": "Séquence mise en pause", "class.resume": "Séquence reprise",
  "mission.unlock": "Mission débloquée", "class.export": "Export CSV des notes",
  "block.open": "Bloc ouvert", "block.close": "Bloc fermé", "help.handled": "Demande d’aide traitée",
  "release.assign": "Version donnée à la classe", "release.move": "Classe passée à la nouvelle version",
  "student.password_reset": "Mot de passe réinitialisé",
}

function since(iso: string | null, now: number): string {
  if (!iso) return "Aucune activité"
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `il y a ${seconds} s`
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

/** Class tracking. With ``assignmentId`` (the single class) there is no class selector. */
export function TeacherDashboard({ assignmentId = null }: { assignmentId?: number | null } = {}) {
  const [classes, setClasses] = useState<ClassSummary[] | null>(null)
  const [selected, setSelected] = useState<number | null>(assignmentId)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [detail, setDetail] = useState<StudentDetail | null>(null)
  const [log, setLog] = useState<Intervention[]>([])
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [now, setNow] = useState(() => Date.now())
  const detailId = useRef<number | null>(null)
  const [reset, setReset] = useState<{ student: string; password: string; sessions_revoked: number } | null>(null)
  const [copied, setCopied] = useState(false)

  const loadClasses = useCallback(async () => {
    setError(null)
    try {
      const items = await api<ClassSummary[]>("/teacher/classes")
      setClasses(items)
      setSelected((current) => assignmentId ?? current ?? items[0]?.id ?? null)
    } catch (reason) {
      if (!(reason instanceof ApiError && reason.status === 401)) setError("Impossible de charger vos classes.")
    }
  }, [])

  const refresh = useCallback(async (id: number) => {
    try {
      const [data, events] = await Promise.all([
        api<Overview>(`/teacher/classes/${id}/overview`), api<Intervention[]>(`/teacher/classes/${id}/interventions`),
      ])
      setOverview(data)
      setLog(events)
      setStale(false)
      if (detailId.current) setDetail(await api<StudentDetail>(`/teacher/classes/${id}/students/${detailId.current}`))
    } catch (reason) {
      if (!(reason instanceof ApiError && reason.status === 401)) setStale(true)
    }
  }, [])

  useEffect(() => { void loadClasses() }, [loadClasses])
  useEffect(() => {
    if (!selected) return
    setOverview(null)
    setDetail(null)
    detailId.current = null
    void refresh(selected)
  }, [selected, refresh])
  useEffect(() => {
    if (!selected || !autoRefresh) return
    const timer = window.setInterval(() => { void refresh(selected) }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [selected, autoRefresh, refresh])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  async function act(path: string, body?: unknown, message?: string) {
    if (!selected) return
    setBusy(true)
    setNotice("")
    try {
      await api(`/teacher/classes/${selected}${path}`, "POST", body)
      if (message) setNotice(message)
      await refresh(selected)
      await loadClasses()
    } catch (reason) {
      setNotice(reason instanceof ApiError ? `Action impossible : ${reason.message}` : "Connexion interrompue. Réessayez.")
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword(id: number, name: string) {
    if (!selected || !window.confirm(`Créer un nouveau mot de passe pour ${name} ? L’ancien ne fonctionnera plus et ses sessions ouvertes seront fermées.`)) return
    setBusy(true)
    setNotice("")
    setCopied(false)
    try {
      setReset(await api<{ student: string; password: string; sessions_revoked: number }>(`/teacher/classes/${selected}/students/${id}/reset-password`, "POST"))
      await refresh(selected)
    } catch (reason) {
      setNotice(reason instanceof ApiError ? `Action impossible : ${reason.message}` : "Connexion interrompue. Réessayez.")
    } finally {
      setBusy(false)
    }
  }

  async function openStudent(id: number) {
    if (!selected) return
    detailId.current = id
    try { setDetail(await api<StudentDetail>(`/teacher/classes/${selected}/students/${id}`)) }
    catch { setNotice("Impossible de charger le détail de cet étudiant.") }
  }

  if (error) return <ErrorState message={error} onRetry={() => void loadClasses()} />
  if (!classes) return <LoadingState label="Chargement du suivi de classe…" />
  if (classes.length === 0) return <Panel><Stack gap="2">
    <Text fontWeight="semibold">Aucune classe à suivre</Text>
    <Text color="app.muted">Publiez un de vos cours puis attribuez-le à une cohorte dans le studio. Seuls les cours que vous avez créés apparaissent ici.</Text>
  </Stack></Panel>

  const generated = overview ? new Date(overview.generated_at).getTime() : now
  const helpCount = overview?.students.filter((row) => row.needs_help.length > 0).length ?? 0
  const activeCount = overview?.students.filter((row) => row.active).length ?? 0

  return <Stack gap="6" aria-label="Suivi de classe">
    <Flex gap="4" wrap="wrap" align="end" justify="space-between">
      {assignmentId ? <Heading as="h3" size="md">Suivi des étudiants</Heading> : <Stack gap="1.5" minW="72">
        <label htmlFor="class-select"><Text as="span" fontWeight="semibold" fontSize="sm">Classe suivie</Text></label>
        <NativeSelect.Root maxW="xl"><NativeSelect.Field id="class-select" value={selected ?? ""} onChange={(event) => setSelected(Number(event.target.value))}>
          {classes.map((item) => <option key={item.id} value={item.id}>{item.course_title} · v{item.version} · {item.cohort} ({item.student_count} étudiants){item.paused ? " · en pause" : ""}</option>)}
        </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
      </Stack>}
      <Flex gap="2" wrap="wrap" align="center">
        <Text fontSize="sm" color={stale ? "red.fg" : "app.muted"} aria-live="polite">
          {stale ? "Connexion perdue : données possiblement anciennes" : `Actualisé ${since(new Date(generated).toISOString(), now)}`}
        </Text>
        <Button size="sm" variant="ghost" onClick={() => setAutoRefresh(!autoRefresh)} aria-pressed={autoRefresh}>
          {autoRefresh ? "Suspendre l’actualisation" : "Reprendre l’actualisation"}</Button>
        <Button size="sm" variant="outline" onClick={() => { setNotice(""); if (selected) void refresh(selected) }}><Icon name="retry" size={16} />Actualiser</Button>
      </Flex>
    </Flex>

    {!overview ? <LoadingState label="Chargement de la classe…" /> : <>
      <Flex gap="4" wrap="wrap">
        <Panel flex="1" minW="56"><Text fontSize="sm" color="app.muted">Étudiants actifs (5 dernières min)</Text><Text fontSize="3xl" fontWeight="bold">{activeCount} / {overview.students.length}</Text></Panel>
        <Panel flex="1" minW="56" borderColor={helpCount ? "saffron.400" : "app.border"}><Text fontSize="sm" color="app.muted">Besoin d’aide</Text><Text fontSize="3xl" fontWeight="bold" color={helpCount ? "saffron.fg" : undefined}>{helpCount}</Text></Panel>
        <Panel flex="2" minW="72">
          <Stack gap="2">
            <Flex gap="2" align="center"><Text fontWeight="semibold">Séquence</Text>
              <Badge colorPalette={overview.paused ? "saffron" : "green"} variant="subtle" rounded="full">{overview.paused ? "En pause" : "Ouverte"}</Badge></Flex>
            <Flex gap="2" wrap="wrap">
              {overview.paused
                ? <Button size="sm" colorPalette="brand" loading={busy} onClick={() => void act("/resume", undefined, "Séquence reprise : les étudiants peuvent répondre.")}>Reprendre la séquence</Button>
                : <Button size="sm" variant="outline" colorPalette="saffron" loading={busy} onClick={() => void act("/pause", undefined, "Séquence en pause : les réponses sont bloquées.")}>Mettre en pause</Button>}
              <Button size="sm" variant="outline" asChild><a href={`/api/v1/teacher/classes/${overview.assignment_id}/export.csv`} download>Exporter les notes (CSV)</a></Button>
            </Flex>
          </Stack>
        </Panel>
      </Flex>
      {notice && <Text role="status" color="brand.fg" fontWeight="medium">{notice}</Text>}

      <Panel p="0" overflow="hidden">
        <Box overflowX="auto" tabIndex={0} role="region" aria-label="Tableau de progression (défilement horizontal)">
          <Table.Root size="sm" variant="line" aria-label={`Progression de la classe ${overview.cohort}`}>
            <Table.Header><Table.Row bg="app.sunken">
              {["Étudiant", "Missions réussies", "Score", "Mission en cours", "Dernière activité", "Signal", ""].map((label, index) => <Table.ColumnHeader key={index} scope="col">{label}</Table.ColumnHeader>)}
            </Table.Row></Table.Header>
            <Table.Body>{overview.students.map((row) => <Table.Row key={row.id} bg={row.needs_help.length ? "saffron.subtle" : undefined}>
              <Table.Cell fontWeight="semibold"><Flex gap="2" align="center" wrap="wrap">{row.display_name}<FastBadge count={row.fast_attempts} /></Flex></Table.Cell>
              <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{row.completed} / {row.total}</Table.Cell>
              <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{formatPoints(row.core_points)} / {row.core_possible}{row.bonus_points > 0 ? ` (+${formatPoints(row.bonus_points)} bonus)` : ""}</Table.Cell>
              <Table.Cell>{row.current_mission ?? "—"}</Table.Cell>
              <Table.Cell color="app.muted">{since(row.last_activity, now)}</Table.Cell>
              <Table.Cell>{row.needs_help.length ? <Badge colorPalette="saffron" variant="solid" rounded="full" title={row.needs_help.join(", ")}>Besoin d’aide</Badge>
                : row.active ? <Badge colorPalette="green" variant="subtle" rounded="full">Actif</Badge> : <Badge variant="subtle" rounded="full">Inactif</Badge>}</Table.Cell>
              <Table.Cell><Button size="xs" variant="outline" onClick={() => void openStudent(row.id)} aria-label={`Détail de ${row.display_name}`}>Détail</Button></Table.Cell>
            </Table.Row>)}</Table.Body>
          </Table.Root>
        </Box>
        {overview.students.length === 0 && <Text p="5" color="app.muted">Aucun étudiant inscrit dans cette cohorte.</Text>}
      </Panel>

      {detail && <Panel as="section" aria-labelledby="student-detail-title">
        <Stack gap="4">
          <Flex justify="space-between" align="center"><Heading as="h3" size="md" id="student-detail-title">Détail : {detail.display_name}</Heading>
            <Flex gap="2"><Button size="sm" variant="outline" colorPalette="saffron" loading={busy} onClick={() => void resetPassword(detail.id, detail.display_name)}>Réinitialiser le mot de passe</Button>
            <Button size="sm" variant="ghost" onClick={() => { setDetail(null); setReset(null); detailId.current = null }}>Fermer</Button></Flex></Flex>
          {reset && reset.student === detail.display_name && <Box role="status" p="4" rounded="lg" bg="saffron.subtle" borderWidth="1px" borderColor="saffron.solid">
            <Text fontWeight="semibold">Nouveau mot de passe de {reset.student}</Text>
            <Flex gap="3" align="center" wrap="wrap" mt="2">
              <Box as="code" fontSize="xl" fontWeight="bold" letterSpacing="0.06em" px="3" py="1" rounded="md" bg="app.surface" aria-label="Nouveau mot de passe">{reset.password}</Box>
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(reset.password).then(() => setCopied(true)).catch(() => setCopied(false)) }}>{copied ? "Copié" : "Copier"}</Button>
              <Button size="sm" colorPalette="brand" onClick={() => setReset(null)}>J’ai noté le mot de passe</Button>
            </Flex>
            <Text fontSize="sm" mt="2">Il ne sera plus affiché. {reset.sessions_revoked ? "Les sessions ouvertes de l’étudiant ont été fermées." : ""} Transmettez-le en personne.</Text>
          </Box>}
          <Stack gap="2" as="ul" listStyleType="none" p="0" m="0">
            {detail.missions.map((mission) => <Flex as="li" key={mission.mission_version_id} gap="3" align="center" wrap="wrap" p="3" borderWidth="1px" borderColor="app.border" rounded="lg">
              <Text flex="1" fontWeight="medium">{mission.title}</Text>
              <StatusBadge status={mission.status} />
              {mission.unlocked_by_teacher && <Badge variant="outline" rounded="full">Débloquée par l’enseignant</Badge>}
              <FastBadge count={mission.fast_attempts} />
              <Text fontSize="sm" color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }}>{formatPoints(mission.best_points)} / {mission.possible} pts · {mission.attempts} essai{mission.attempts > 1 ? "s" : ""} · {mission.hints} indice{mission.hints > 1 ? "s" : ""}</Text>
              {mission.status === "locked" && <Button size="xs" colorPalette="brand" loading={busy}
                onClick={() => void act("/unlocks", { user_id: detail.id, mission_version_id: mission.mission_version_id }, `« ${mission.title} » débloquée pour ${detail.display_name}.`)}>Débloquer pour cet étudiant</Button>}
            </Flex>)}
          </Stack>
          <Text fontWeight="semibold">Derniers essais</Text>
          {detail.attempts.length === 0 ? <Text color="app.muted" fontSize="sm">Aucun essai pour le moment.</Text>
            : <Stack as="ol" gap="1" listStyleType="none" p="0" m="0" fontSize="sm">{detail.attempts.slice(0, 15).map((item) => <Flex as="li" key={item.id} justify="space-between" gap="3">
              <Text>{item.mission}</Text><Text color="app.muted">{new Date(item.created_at).toLocaleTimeString("fr-FR")} · {item.correct ? "réussi" : "à revoir"} · {formatPoints(item.points)} pts{item.percent != null ? ` (${item.percent} %)` : ""}{item.fast ? " · clic rapide" : ""}</Text>
            </Flex>)}</Stack>}
        </Stack>
      </Panel>}

      <Panel as="section" aria-labelledby="interventions-title">
        <Stack gap="2">
          <Heading as="h3" size="sm" id="interventions-title">Journal des interventions</Heading>
          {log.length === 0 ? <Text color="app.muted" fontSize="sm">Aucune intervention enregistrée.</Text>
            : <Stack as="ul" gap="1" listStyleType="none" p="0" m="0" fontSize="sm">{log.slice(0, 20).map((item) => <Flex as="li" key={item.id} gap="3" justify="space-between">
              <Text>{ACTIONS[item.action] ?? item.action}{item.action === "student.password_reset" ? ` : ${item.details.student}` : ""}{item.details.block ? ` : « ${item.details.block} »` : ""}{item.details.mission ? ` : « ${item.details.mission} » pour ${item.details.student}` : ""}</Text>
              <Text color="app.muted">{item.actor} · {new Date(item.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</Text>
            </Flex>)}</Stack>}
        </Stack>
      </Panel>
    </>}
  </Stack>
}

/** ADR-0027: « clics rapides » (attempt < 5 s after opening, or 3 attempts in 30 s). Information only. */
export function FastBadge({ count }: { count?: number }) {
  if (!count) return null
  return <Badge colorPalette="saffron" variant="outline" rounded="full" title="Essai moins de 5 s après l’ouverture, ou 3 essais en moins de 30 s">
    Clics rapides : {count}</Badge>
}
