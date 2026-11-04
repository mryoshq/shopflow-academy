import { StudentSummary, type StudentSummaryData } from "./StudentSummary"
import { ActivityTime, activityRelative } from "../shared/ActivityTime"
import { msg, t, tn } from "../i18n"
import { useCallback, useEffect, useRef, useState } from "react"
import { Badge, Box, Button, Flex, Heading, NativeSelect, Stack, Table, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { SidePanel } from "./SidePanel"
import { StudentRewardsSummary } from "../rewards/Rewards"
import type { Rewards } from "../rewards/types"
import { ErrorState, Icon, LoadingState, Panel, StatusBadge, formatPoints } from "../student/ui"
import type { MissionStatus } from "../student/types"

export const REFRESH_MS = 5000

export type ClassSummary = { id: number; cohort: string; course_title: string; version: number; paused: boolean; student_count: number }
export type OverviewStudent = {
  id: number; display_name: string; completed: number; total: number; lessons_read?: number; lessons_total?: number; core_points: number; core_possible: number; bonus_points: number
  attempts: number; hints: number; current_mission: string | null; last_activity: string | null; active: boolean; needs_help: string[]
  /** ADR-0027: attempts marked « rapide » (no sanction). */
  fast_attempts?: number
}
export type Overview = {
  generated_at: string; assignment_id: number; cohort: string; course_title: string; version: number; paused: boolean
  missions: { mission_version_id: number; title: string }[]; students: OverviewStudent[]
}
type StudentDetail = {
  id: number; display_name: string; summary?: StudentSummaryData
  rewards?: Rewards
  missions: { mission_version_id: number; title: string; status: MissionStatus; locked_by: string[]; unlocked_by_teacher: boolean; best_points: number; possible: number; bonus: boolean; lesson?: boolean; block_open?: boolean; attempts: number; hints: number; fast_attempts?: number }[]
  attempts: { id: number; mission: string; created_at: string; correct: boolean; points: number; fast?: boolean; percent?: number | null }[]
}
type Intervention = { id: number; action: string; actor: string; created_at: string; details: Record<string, string> }

const ACTIONS: Record<string, string> = {
  "class.pause": msg("Séquence mise en pause"), "class.resume": msg("Séquence reprise"),
  "mission.unlock": msg("Mission débloquée"), "class.export": msg("Export CSV des notes"),
  "block.open": msg("Bloc ouvert"), "block.close": msg("Bloc fermé"), "help.handled": msg("Demande d’aide traitée"),
  "release.assign": msg("Version donnée à la classe"), "release.move": msg("Classe passée à la nouvelle version"),
  "student.password_reset": msg("Mot de passe réinitialisé"),
}

/** Class tracking. With ``assignmentId`` (the single class) there is no class selector. */
export function TeacherDashboard({ assignmentId = null, studentId = null, onStudent }: {
  assignmentId?: number | null
  /** ADR-0031: the student whose panel is open (from the address), and how to change it. */
  studentId?: number | null
  onStudent?: (id: number | null) => void
} = {}) {
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
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const [reset, setReset] = useState<{ student: string; password: string; sessions_revoked: number } | null>(null)
  const [copied, setCopied] = useState(false)

  const loadClasses = useCallback(async () => {
    setError(null)
    try {
      const items = await api<ClassSummary[]>("/teacher/classes")
      setClasses(items)
      setSelected((current) => assignmentId ?? current ?? items[0]?.id ?? null)
    } catch (reason) {
      if (!(reason instanceof ApiError && reason.status === 401)) setError(t("Impossible de charger vos classes."))
    }
  }, [])

  const refresh = useCallback(async (id: number) => {
    try {
      const [data, events] = await Promise.all([
        api<Overview>(`/teacher/classes/${id}/overview`), api<Intervention[]>(`/teacher/classes/${id}/interventions`),
      ])
      if (selectedRef.current !== id) return
      setOverview(data)
      setLog(events)
      setStale(false)
      const requestedStudent = detailId.current
      if (requestedStudent) {
        const student = await api<StudentDetail>(`/teacher/classes/${id}/students/${requestedStudent}`)
        if (selectedRef.current === id && detailId.current === requestedStudent) setDetail(student)
      }
    } catch (reason) {
      if (selectedRef.current === id && !(reason instanceof ApiError && reason.status === 401)) setStale(true)
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
      setNotice(reason instanceof ApiError ? `Action impossible : ${reason.message}` : t("Connexion interrompue. Réessayez."))
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword(id: number, name: string) {
    if (!selected || !window.confirm(t("Créer un nouveau mot de passe pour {{name}} ? L’ancien ne fonctionnera plus et ses sessions ouvertes seront fermées.", { name }))) return
    setBusy(true)
    setNotice("")
    setCopied(false)
    try {
      setReset(await api<{ student: string; password: string; sessions_revoked: number }>(`/teacher/classes/${selected}/students/${id}/reset-password`, "POST"))
      await refresh(selected)
    } catch (reason) {
      setNotice(reason instanceof ApiError ? `Action impossible : ${reason.message}` : t("Connexion interrompue. Réessayez."))
    } finally {
      setBusy(false)
    }
  }

  function closeStudent() {
    setDetail(null); setReset(null); detailId.current = null
    onStudent?.(null)
  }

  useEffect(() => {
    if (studentId !== null && selected && detailId.current !== studentId) void openStudent(studentId, false)
    if (studentId === null && onStudent && detailId.current !== null) { setDetail(null); setReset(null); detailId.current = null }
  }, [studentId, selected])

  async function openStudent(id: number, notify = true) {
    if (!selected) return
    if (notify) onStudent?.(id)
    detailId.current = id
    setDetail(null)
    const requestedClass = selected
    try {
      const student = await api<StudentDetail>(`/teacher/classes/${requestedClass}/students/${id}`)
      if (selectedRef.current === requestedClass && detailId.current === id) setDetail(student)
    }
    catch { setNotice(t("Impossible de charger le détail de cet étudiant.")) }
  }

  if (error) return <ErrorState message={error} onRetry={() => void loadClasses()} />
  if (!classes) return <LoadingState label={t("Chargement du suivi de classe…")} />
  if (classes.length === 0) return <Panel><Stack gap="2">
    <Text fontWeight="semibold">{t("Aucune classe à suivre")}</Text>
    <Text color="app.muted">{t("Publiez un de vos cours puis attribuez-le à une cohorte dans le studio. Seuls les cours que vous avez créés apparaissent ici.")}</Text>
  </Stack></Panel>

  const helpCount = overview?.students.filter((row) => row.needs_help.length > 0).length ?? 0
  const activeCount = overview?.students.filter((row) => row.active).length ?? 0

  return <Stack gap="6" aria-label={t("Suivi de classe")}>
    <Flex gap="4" wrap="wrap" align="end" justify="space-between">
      {assignmentId ? <Heading as="h3" size="md">{t("Suivi des étudiants")}</Heading> : <Stack gap="1.5" minW="72">
        <label htmlFor="class-select"><Text as="span" fontWeight="semibold" fontSize="sm">{t("Classe suivie")}</Text></label>
        <NativeSelect.Root maxW="xl"><NativeSelect.Field id="class-select" value={selected ?? ""} onChange={(event) => setSelected(Number(event.target.value))}>
          {classes.map((item) => <option key={item.id} value={item.id}>{item.course_title} · v{item.version} · {item.cohort} ({item.student_count} {t("étudiants)")}{item.paused ? t(" · en pause") : ""}</option>)}
        </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
      </Stack>}
      <Flex gap="2" wrap="wrap" align="center">
        <Text fontSize="sm" color={stale ? "red.fg" : "app.muted"} aria-live="polite">
          {stale ? t("Connexion perdue : données possiblement anciennes") : t("Actualisé {{p0}}", { p0: activityRelative(overview?.generated_at, now) })}
        </Text>
        <Button size="sm" variant="ghost" onClick={() => setAutoRefresh(!autoRefresh)} aria-pressed={autoRefresh}>
          {autoRefresh ? t("Suspendre l’actualisation") : t("Reprendre l’actualisation")}</Button>
        <Button size="sm" variant="outline" onClick={() => { setNotice(""); if (selected) void refresh(selected) }}><Icon name="retry" size={16} />{t("Actualiser")}</Button>
      </Flex>
    </Flex>

    {!overview ? <LoadingState label={t("Chargement de la classe…")} /> : <>
      <Flex gap="4" wrap="wrap">
        <Panel flex="1" minW="56"><Text fontSize="sm" color="app.muted">{t("Étudiants actifs (5 dernières min)")}</Text><Text fontSize="3xl" fontWeight="bold">{activeCount} / {overview.students.length}</Text></Panel>
        <Panel flex="1" minW="56" borderColor={helpCount ? "saffron.400" : "app.border"}><Text fontSize="sm" color="app.muted">{t("Besoin d’aide")}</Text><Text fontSize="3xl" fontWeight="bold" color={helpCount ? "saffron.fg" : undefined}>{helpCount}</Text></Panel>
        <Panel flex="2" minW="72">
          <Stack gap="2">
            <Flex gap="2" align="center"><Text fontWeight="semibold">{t("Séquence")}</Text>
              <Badge colorPalette={overview.paused ? "saffron" : "green"} variant="subtle" rounded="full">{overview.paused ? t("En pause") : t("Ouverte")}</Badge></Flex>
            <Flex gap="2" wrap="wrap">
              {overview.paused
                ? <Button size="sm" colorPalette="brand" loading={busy} onClick={() => void act("/resume", undefined, t("Séquence reprise : les étudiants peuvent répondre."))}>{t("Reprendre la séquence")}</Button>
                : <Button size="sm" variant="outline" colorPalette="saffron" loading={busy} onClick={() => void act("/pause", undefined, t("Séquence en pause : les réponses sont bloquées."))}>{t("Mettre en pause")}</Button>}
              <Button size="sm" variant="outline" asChild><a href={`/api/v1/teacher/classes/${overview.assignment_id}/export.csv`} download>{t("Exporter les notes (CSV)")}</a></Button>
            </Flex>
          </Stack>
        </Panel>
      </Flex>
      {notice && <Text role="status" color="brand.fg" fontWeight="medium">{notice}</Text>}

      <Panel p="0" overflow="hidden">
        <Box overflowX="auto" tabIndex={0} role="region" aria-label={t("Tableau de progression (défilement horizontal)")}>
          <Table.Root size="sm" variant="line" aria-label={t("Progression de la classe {{cohort}}", { cohort: overview.cohort })}>
            <Table.Header><Table.Row bg="app.sunken">
              {[t("Étudiant"), t("Missions réussies"), t("Score"), t("Mission en cours"), t("Dernière activité"), t("Signal"), ""].map((label, index) => <Table.ColumnHeader key={index} scope="col">{label}</Table.ColumnHeader>)}
            </Table.Row></Table.Header>
            <Table.Body>{overview.students.map((row) => <Table.Row key={row.id} bg={row.needs_help.length ? "saffron.subtle" : undefined}>
              <Table.Cell fontWeight="semibold"><Flex gap="2" align="center" wrap="wrap">{row.display_name}<FastBadge count={row.fast_attempts} /></Flex></Table.Cell>
              <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{row.completed} / {row.total}{row.lessons_total ? <Text as="span" display="block" fontSize="xs" color="app.muted">{t("leçons lues")}{" "}{row.lessons_read}/{row.lessons_total}</Text> : null}</Table.Cell>
              <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{formatPoints(row.core_points)} / {row.core_possible}{row.bonus_points > 0 ? ` (+${formatPoints(row.bonus_points)} bonus)` : ""}</Table.Cell>
              <Table.Cell>{row.current_mission ?? "—"}</Table.Cell>
              <Table.Cell color="app.muted"><ActivityTime value={row.last_activity} now={now} /></Table.Cell>
              <Table.Cell>{row.needs_help.length ? <Badge colorPalette="saffron" variant="solid" rounded="full" title={row.needs_help.join(", ")}>{t("Besoin d’aide")}</Badge>
                : row.active ? <Badge colorPalette="green" variant="subtle" rounded="full">{t("Actif")}</Badge> : <Badge variant="subtle" rounded="full">{t("Inactif")}</Badge>}</Table.Cell>
              <Table.Cell><Button size="xs" variant="outline" onClick={() => void openStudent(row.id)} aria-label={t("Détail de {{display_name}}", { display_name: row.display_name })}>{t("Détail")}</Button></Table.Cell>
            </Table.Row>)}</Table.Body>
          </Table.Root>
        </Box>
        {overview.students.length === 0 && <Text p="5" color="app.muted">{t("Aucun étudiant inscrit dans cette cohorte.")}</Text>}
      </Panel>

      {/* ADR-0031: the student's detail opens in a right-hand panel, without leaving the view. */}
      <SidePanel open={detail !== null} title={detail ? t("Détail : {{display_name}}", { display_name: detail.display_name }) : t("Détail")} onClose={closeStudent}>
        {detail && <Stack gap="4">
          <Flex gap="2" wrap="wrap"><Button size="sm" variant="outline" colorPalette="saffron" loading={busy} onClick={() => void resetPassword(detail.id, detail.display_name)}>{t("Réinitialiser le mot de passe")}</Button></Flex>
          {detail.rewards && <StudentRewardsSummary rewards={detail.rewards} />}
          {reset && reset.student === detail.display_name && <Box role="status" p="4" rounded="lg" bg="saffron.subtle" borderWidth="1px" borderColor="saffron.solid">
            <Text fontWeight="semibold">{t("Nouveau mot de passe de")}{" "}{reset.student}</Text>
            <Flex gap="3" align="center" wrap="wrap" mt="2">
              <Box as="code" fontSize="xl" fontWeight="bold" letterSpacing="0.06em" px="3" py="1" rounded="md" bg="app.surface" aria-label={t("Nouveau mot de passe")}>{reset.password}</Box>
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(reset.password).then(() => setCopied(true)).catch(() => setCopied(false)) }}>{copied ? t("Copié") : t("Copier")}</Button>
              <Button size="sm" colorPalette="brand" onClick={() => setReset(null)}>{t("J’ai noté le mot de passe")}</Button>
            </Flex>
            <Text fontSize="sm" mt="2">{t("Il ne sera plus affiché.")}{" "}{reset.sessions_revoked ? t("Les sessions ouvertes de l’étudiant ont été fermées.") : ""} {t("Transmettez-le en personne.")}</Text>
          </Box>}
          {detail.summary && <StudentSummary data={detail.summary} now={now} />}
          <Stack gap="2" as="ul" listStyleType="none" p="0" m="0">
            {detail.missions.map((mission) => <Flex as="li" key={mission.mission_version_id} gap="3" align="center" wrap="wrap" p="3" borderWidth="1px" borderColor="app.border" rounded="lg">
              <Text flex="1" fontWeight="medium">{mission.title}</Text>
              <StatusBadge status={mission.status} />
              {mission.lesson ? <Badge variant="outline">{t("Leçon")}</Badge> : mission.bonus ? <Badge variant="outline">{t("Bonus")}</Badge> : null}
              {mission.block_open === false && <Badge variant="outline">{t("Bloc fermé")}</Badge>}
              {mission.unlocked_by_teacher && <Badge variant="outline" rounded="full">{t("Débloquée par l’enseignant")}</Badge>}
              <FastBadge count={mission.fast_attempts} />
              <Text fontSize="sm" color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }}>{formatPoints(mission.best_points)} / {mission.possible} {t("pts ·")}{" "}{tn("{{count}} essai", mission.attempts)} · {tn("{{count}} indice", mission.hints)}</Text>
              {mission.status === "locked" && <Button size="xs" colorPalette="brand" loading={busy}
                onClick={() => void act("/unlocks", { user_id: detail.id, mission_version_id: mission.mission_version_id }, t("« {{title}} » débloquée pour {{display_name}}.", { title: mission.title, display_name: detail.display_name }))}>{t("Débloquer pour cet étudiant")}</Button>}
            </Flex>)}
          </Stack>
          <Text fontWeight="semibold">{t("Derniers essais")}</Text>
          {detail.attempts.length === 0 ? <Text color="app.muted" fontSize="sm">{t("Aucun essai pour le moment.")}</Text>
            : <Stack as="ol" gap="1" listStyleType="none" p="0" m="0" fontSize="sm">{detail.attempts.slice(0, 15).map((item) => <Flex as="li" key={item.id} justify="space-between" gap="3">
              <Text>{item.mission}</Text><Text color="app.muted"><ActivityTime value={item.created_at} now={now} /> · {item.correct ? t("réussi") : t("à revoir")} · {formatPoints(item.points)} {t("pts")}{item.percent != null ? ` (${item.percent} %)` : ""}{item.fast ? " · clic rapide" : ""}</Text>
            </Flex>)}</Stack>}
        </Stack>}
      </SidePanel>

      <Panel as="section" aria-labelledby="interventions-title">
        <Stack gap="2">
          <Heading as="h3" size="sm" id="interventions-title">{t("Journal des interventions")}</Heading>
          {log.length === 0 ? <Text color="app.muted" fontSize="sm">{t("Aucune intervention enregistrée.")}</Text>
            : <Stack as="ul" gap="1" listStyleType="none" p="0" m="0" fontSize="sm">{log.slice(0, 20).map((item) => <Flex as="li" key={item.id} gap="3" justify="space-between">
              <Text>{t(ACTIONS[item.action] ?? item.action)}{item.action === "student.password_reset" ? ` : ${item.details.student}` : ""}{item.details.block ? ` : « ${item.details.block} »` : ""}{item.details.mission ? t(" : « {{mission}} » pour {{student}}", { mission: item.details.mission, student: item.details.student }) : ""}</Text>
              <Text color="app.muted">{item.actor} · <ActivityTime value={item.created_at} now={now} /></Text>
            </Flex>)}</Stack>}
        </Stack>
      </Panel>
    </>}
  </Stack>
}

/** ADR-0027: « clics rapides » (attempt < 5 s after opening, or 3 attempts in 30 s). Information only. */
export function FastBadge({ count }: { count?: number }) {
  if (!count) return null
  return <Badge colorPalette="saffron" variant="outline" rounded="full" title={t("Essai moins de 5 s après l’ouverture, ou 3 essais en moins de 30 s")}>
    {t("Clics rapides :")}{" "}{count}</Badge>
}
