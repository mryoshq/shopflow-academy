import { formatDateTime, formatNumber, t } from "../i18n"
import { useCallback, useEffect, useRef, useState } from "react"
import { Box, Button, Flex, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { ErrorState, LoadingState, Panel, ScoreBar } from "../student/ui"

/** Issue #110: aggregates only (no student name, no individual grade). */
export type ClassStatsData = {
  course: { students: number; mean_progress: number | null; success_rate: number | null; work_minutes_mean: number; blocks_open: number; blocks_total: number
    missions: number; bonus_students: number; course_title: string; cohort: string; modules: { label: string; percent: number }[] }
  project: { teams: number; teams_of_2: number; teams_of_3: number; teams_other: number; students_in_team: number; students_without_team: number
    teams_with_deposit: number; teams_without_deposit: number; versions: number; milestones: { title: string; teams: number; versions: number }[]
    defences: { slots: number; assigned: number; done: number; current: number; upcoming: number; graded_teams: number; mean_base?: number | null } }
  generated_at: string
}

const REFRESH_MS = 30_000
const pct = (value: number | null) => value === null ? "—" : `${formatNumber(value)} %`
const duration = (minutes: number) => minutes < 60 ? t("{{minutes}} min", { minutes }) : t("{{hours}} h {{minutes}}", { hours: Math.floor(minutes / 60), minutes: String(minutes % 60).padStart(2, "0") })

function Tile({ label, value, detail, big }: { label: string; value: string; detail?: string; big: boolean }) {
  return <Panel as="section" aria-label={label} p={big ? "6" : "4"}><Stack gap="1">
    <Text fontSize={big ? "md" : "xs"} fontWeight="semibold" color="app.muted" textTransform="uppercase" letterSpacing="0.06em">{label}</Text>
    <Text fontSize={big ? "5xl" : "2xl"} fontWeight="bold" lineHeight="1.1" css={{ fontVariantNumeric: "tabular-nums" }}>{value}</Text>
    {detail && <Text fontSize={big ? "lg" : "xs"} color="app.muted">{detail}</Text>}
  </Stack></Panel>
}

function Bars({ title, rows, big }: { title: string; rows: { label: string; value: number; max: number; text: string }[]; big: boolean }) {
  const id = `stats-${title.replace(/\W+/g, "-")}`
  return <Panel as="section" aria-labelledby={id}><Stack gap="3">
    <Heading as="h3" size={big ? "xl" : "md"} id={id}>{title}</Heading>
    {rows.length === 0 ? <Text color="app.muted">{t("Pas encore de données.")}</Text>
      : <Stack as="ul" listStyleType="none" p="0" m="0" gap={big ? "4" : "2"}>{rows.map((row) => <Box as="li" key={row.label}>
        <Flex justify="space-between" gap="3" fontSize={big ? "xl" : "sm"}><Text fontWeight="medium">{row.label}</Text>
          <Text color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }} flexShrink={0}>{row.text}</Text></Flex>
        <ScoreBar value={row.value} max={Math.max(1, row.max)} label={`${row.label} : ${row.text}`} />
      </Box>)}</Stack>}
  </Stack></Panel>
}

/** The figures, shared by the teacher's page, the observer's tab and the projector. */
export function StatsBody({ data, big = false }: { data: ClassStatsData; big?: boolean }) {
  const { course, project } = data
  const defences = project.defences
  const columns = big ? { base: 2, md: 4 } : { base: 2, md: 4 }
  return <Stack gap={big ? "8" : "6"}>
    <Stack gap="3" as="section" aria-labelledby="stats-defences">
      <Heading as="h2" size={big ? "2xl" : "lg"} id="stats-defences">{t("Soutenances")}</Heading>
      <SimpleGrid columns={columns} gap="3">
        <Tile big={big} label={t("Passées")} value={`${defences.done} / ${defences.assigned}`} detail={t("équipes ayant soutenu")} />
        <Tile big={big} label={t("En cours")} value={String(defences.current)} />
        <Tile big={big} label={t("À venir")} value={String(defences.upcoming)} />
        <Tile big={big} label={t("Notées")} value={`${defences.graded_teams} / ${project.teams}`} detail={t("équipes dont la grille est complète")} />
        {/* The average stays off the projector (shown in front of the class). */}
        {defences.mean_base !== undefined && !big && <Tile big={big} label={t("Moyenne du projet")} value={defences.mean_base === null ? "—" : `${formatNumber(defences.mean_base)} / 20`}
          detail={t("socle, équipes notées seulement")} />}
      </SimpleGrid>
    </Stack>
    <Stack gap="3" as="section" aria-labelledby="stats-project">
      <Heading as="h2" size={big ? "2xl" : "lg"} id="stats-project">{t("Projet CampusEquip")}</Heading>
      <SimpleGrid columns={columns} gap="3">
        <Tile big={big} label={t("Équipes")} value={String(project.teams)} detail={t("{{two}} de 2 · {{three}} de 3", { two: project.teams_of_2, three: project.teams_of_3 })} />
        <Tile big={big} label={t("Étudiants en équipe")} value={`${project.students_in_team} / ${project.students_in_team + project.students_without_team}`} />
        <Tile big={big} label={t("Équipes ayant déposé")} value={`${project.teams_with_deposit} / ${project.teams}`} detail={t("{{n}} sans dépôt", { n: project.teams_without_deposit })} />
        <Tile big={big} label={t("Versions déposées")} value={String(project.versions)} />
      </SimpleGrid>
      <Bars big={big} title={t("Dépôts par jalon")} rows={project.milestones.map((item) => ({ label: item.title, value: item.teams, max: project.teams,
        text: t("{{teams}} / {{total}} équipes · {{versions}} versions", { teams: item.teams, total: project.teams, versions: item.versions }) }))} />
    </Stack>
    <Stack gap="3" as="section" aria-labelledby="stats-course">
      <Heading as="h2" size={big ? "2xl" : "lg"} id="stats-course">{t("Cours")}</Heading>
      <SimpleGrid columns={columns} gap="3">
        <Tile big={big} label={t("Étudiants")} value={String(course.students)} detail={t("{{n}} missions principales", { n: course.missions })} />
        <Tile big={big} label={t("Progression moyenne")} value={pct(course.mean_progress)} detail={t("missions principales réussies")} />
        <Tile big={big} label={t("Réussite")} value={pct(course.success_rate)} detail={t("essais justes sur l’ensemble des essais")} />
        <Tile big={big} label={t("Temps de travail")} value={duration(course.work_minutes_mean)} detail={t("moyenne estimée par étudiant")} />
      </SimpleGrid>
      <Bars big={big} title={t("Réussite par module")} rows={course.modules.map((item) => ({ label: item.label, value: item.percent, max: 100, text: pct(item.percent) }))} />
    </Stack>
  </Stack>
}

/** Issue #110: statistics page with a projection mode (full screen, large type, no names, refreshed every 30 s). */
export function ClassStats({ path }: { path: string }) {
  const [data, setData] = useState<ClassStatsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [projecting, setProjecting] = useState(false)
  const screen = useRef<HTMLDivElement>(null)
  const load = useCallback(async () => {
    try { setData(await api<ClassStatsData>(path)); setError(null) }
    catch (reason) { if (!(reason instanceof ApiError && reason.status === 401)) setError(t("Chargement impossible. Réessayez dans un instant.")) }
  }, [path])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!projecting) return
    const timer = window.setInterval(() => void load(), REFRESH_MS)
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setProjecting(false) }
    window.addEventListener("keydown", onKey)
    return () => { window.clearInterval(timer); window.removeEventListener("keydown", onKey) }
  }, [projecting, load])
  useEffect(() => {
    if (projecting) void screen.current?.requestFullscreen?.().catch(() => undefined)
    else if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined)
  }, [projecting])

  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (!data) return <LoadingState label={t("Chargement des statistiques…")} />
  const updated = t("Mis à jour à {{time}}", { time: formatDateTime(data.generated_at) })
  return <Stack gap="5">
    <Flex gap="3" align="center" wrap="wrap">
      <Text flex="1" minW="48" fontSize="sm" color="app.muted">{updated}</Text>
      <Button size="sm" variant="outline" onClick={() => void load()}>{t("Actualiser")}</Button>
      <Button size="sm" colorPalette="brand" onClick={() => setProjecting(true)}>{t("Mode projection")}</Button>
    </Flex>
    <StatsBody data={data} />
    {projecting && <Box ref={screen} role="dialog" aria-modal="true" aria-label={t("Statistiques en mode projection")} data-testid="stats-projection"
      position="fixed" inset="0" zIndex="modal" bg="app.canvas" color="app.ink" overflowY="auto" px={{ base: "4", md: "12" }} py="8">
      <Stack gap="8" maxW="7xl" mx="auto">
        <Flex gap="4" align="center" wrap="wrap">
          <Heading as="h1" size="4xl" flex="1">{t("Rapidfox Academy · Soutenances")}</Heading>
          <Text fontSize="lg" color="app.muted">{updated}</Text>
          <Button size="lg" variant="outline" onClick={() => setProjecting(false)} autoFocus>{t("Quitter la projection")}</Button>
        </Flex>
        <StatsBody data={data} big />
      </Stack>
    </Box>}
  </Stack>
}
