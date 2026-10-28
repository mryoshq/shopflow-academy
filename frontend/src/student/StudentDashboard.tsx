import { useCallback, useEffect, useState } from "react"
import { Badge, Box, Button, Flex, Grid, Heading, Link, Stack, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { lastMission } from "./storage"
import type { Dashboard, DashboardBlock, DashboardCourse, DashboardMission } from "./types"
import { DemoBadge, ErrorState, Icon, LoadingState, Panel, ScoreBar, StatusBadge, formatPoints } from "./ui"

type Props = { navigate: (path: string) => void }

/** First mission not yet solved in the open blocks (main missions before bonus), else the last one visited. */
export function continueTarget(dashboard: Dashboard, remembered: number | null): DashboardMission | null {
  const all = dashboard.courses.flatMap((course) => course.missions)
  const open = all.filter((mission) => mission.status !== "locked")
  const todo = open.find((mission) => !mission.bonus && mission.status !== "completed")
    ?? open.find((mission) => mission.status !== "completed")
  return todo ?? open.find((mission) => mission.mission_version_id === remembered) ?? open[0] ?? null
}

export function StudentDashboard({ navigate }: Props) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setData(null)
    try { setData(await api<Dashboard>("/student/dashboard")) }
    catch (reason) {
      if (!(reason instanceof ApiError && reason.status === 401)) setError("Impossible de charger votre tableau de bord.")
    }
  }, [])
  useEffect(() => { void load() }, [load])

  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (!data) return <LoadingState label="Chargement de votre espace…" />

  const target = continueTarget(data, lastMission())

  return <Stack gap="8">
    <Flex gap="6" justify="space-between" align={{ base: "start", md: "end" }} direction={{ base: "column", md: "row" }}>
      <Stack gap="2">
        <Heading as="h1" size={{ base: "3xl", md: "4xl" }} letterSpacing="-0.01em">Bonjour, {data.display_name}</Heading>
        <Text fontSize="lg" color="app.muted">{data.courses.length === 0 ? "Votre enseignant ne vous a pas encore attribué de cours." : "Reprenez là où vous vous êtes arrêté."}</Text>
      </Stack>
      {target && <Button colorPalette="brand" size="lg" onClick={() => navigate(`/mission/${target.mission_version_id}`)}>
        Continuer : {target.title}<Icon name="arrow-right" />
      </Button>}
    </Flex>

    {data.courses.length === 0 ? <Panel>
      <Stack gap="2"><Text fontWeight="semibold">Aucun cours pour le moment</Text>
        <Text color="app.muted">Dès qu’un cours vous sera attribué, il apparaîtra ici. Vous pouvez rafraîchir la page pendant la séance.</Text>
        <Button alignSelf="start" variant="outline" colorPalette="brand" onClick={() => void load()}><Icon name="retry" />Actualiser</Button>
      </Stack>
    </Panel> : <Grid templateColumns={{ base: "1fr", lg: "minmax(0, 1fr) 18rem" }} gap="6" alignItems="start">
      <Stack gap="6">
        {data.courses.map((course) => <Panel as="section" key={course.release_id} aria-labelledby={`course-${course.release_id}`}>
          <Stack gap="5">
            <Stack gap="2">
              <Flex gap="2" align="center" wrap="wrap">{course.is_demo && <DemoBadge />}{course.paused && <Badge colorPalette="saffron" variant="solid" rounded="full">En pause</Badge>}<Text fontSize="sm" color="app.muted">Version {course.version}</Text></Flex>
              {course.paused && <Text fontSize="sm" color="saffron.fg">Votre enseignant a mis cette séquence en pause : vous pouvez relire les missions, les réponses reprendront à son signal.</Text>}
              <Heading as="h2" size="xl" id={`course-${course.release_id}`}>{course.title}</Heading>
              {course.description && <Text color="app.muted">{course.description}</Text>}
            </Stack>
            {course.modules && course.modules.length > 0
              ? <CourseBlocks course={course} navigate={navigate} />
              : <Stack gap="2.5" as="ol" listStyleType="none" p="0" m="0" aria-label="Missions">
                {course.missions.map((mission, index) => <MissionRow key={mission.mission_version_id} mission={mission} index={index} navigate={navigate} />)}
              </Stack>}
          </Stack>
        </Panel>)}
      </Stack>
      <Stack gap="4" as="aside" aria-label="Suivi">
        {data.courses.map((course) => <Panel key={course.release_id} aria-label={`Score : ${course.title}`}>
          <Stack gap="3">
            <Text fontWeight="semibold">{data.courses.length > 1 ? course.title : "Votre score"}</Text>
            <Text fontSize="3xl" fontWeight="bold" lineHeight="1" css={{ fontVariantNumeric: "tabular-nums" }}>
              {formatPoints(course.score.core_points)}<Text as="span" fontSize="lg" color="app.muted"> / {course.score.core_possible} pts</Text>
            </Text>
            <ScoreBar value={course.score.core_points} max={course.score.core_possible} label={`${formatPoints(course.score.core_points)} points sur ${course.score.core_possible}`} />
            <Text fontSize="sm" color="app.muted">{course.score.completed} mission{course.score.completed > 1 ? "s" : ""} réussie{course.score.completed > 1 ? "s" : ""} sur {course.score.total}. Votre meilleur essai compte.</Text>
            {course.score.bonus_possible > 0 && <Text fontSize="sm"><Text as="span" fontWeight="semibold">Bonus :</Text> {formatPoints(course.score.bonus_points)} / {course.score.bonus_possible} pts, comptés à part.</Text>}
          </Stack>
        </Panel>)}
        <Panel>
          <Stack gap="2">
            <Text fontWeight="semibold">Ressources</Text>
            {data.courses.flatMap((course) => course.resources).length === 0
              ? <Text fontSize="sm" color="app.muted">Les ressources de vos cours apparaîtront ici.</Text>
              : data.courses.flatMap((course) => course.resources).map((url) => <Link key={url} href={url} target="_blank" rel="noreferrer" color="brand.fg" textDecoration="underline" wordBreak="break-all" fontSize="sm">{url}</Link>)}
          </Stack>
        </Panel>
        {!data.ai_enabled && <Text fontSize="xs" color="app.muted" px="1">L’assistant IA est désactivé. Les indices de chaque mission restent disponibles.</Text>}
      </Stack>
    </Grid>}
  </Stack>
}

function MissionRow({ mission, index, navigate }: { mission: DashboardMission; index: number; navigate: (path: string) => void }) {
  const locked = mission.status === "locked"
  const accent = mission.status === "completed" ? "green.600" : mission.status === "in_progress" ? "saffron.400" : "app.border"
  return <Box as="li">
    <Flex gap="4" align="center" p="3.5" borderWidth="1px" borderColor="app.border" borderLeftWidth="4px" borderLeftColor={accent}
      rounded="lg" bg={locked ? "app.sunken" : "app.surface"} direction={{ base: "column", sm: "row" }}>
      <Flex align="center" justify="center" w="9" h="9" rounded="full" bg={locked ? "app.border" : "brand.subtle"} color="brand.fg"
        fontWeight="bold" flexShrink={0} aria-hidden="true">{locked ? <Icon name="lock" size={16} /> : index + 1}</Flex>
      <Stack gap="0.5" flex="1" minW="0">
        <Flex gap="2" align="center" wrap="wrap"><Text fontWeight="semibold">{mission.title}</Text>{mission.bonus && <Badge colorPalette="saffron" variant="outline" rounded="full">Bonus</Badge>}</Flex>
        <Text fontSize="sm" color="app.muted">{locked ? `Se débloque après : ${mission.locked_by.join(", ")}` : `${mission.chapter} · environ ${mission.estimated_duration_minutes ?? "?"} min · ${formatPoints(mission.best_points)} / ${mission.possible} pts${mission.bonus ? " (bonus)" : ""}`}</Text>
      </Stack>
      <StatusBadge status={mission.status} />
      <Button size="sm" variant={mission.status === "completed" ? "outline" : "solid"} colorPalette="brand" disabled={locked}
        onClick={() => navigate(`/mission/${mission.mission_version_id}`)} aria-label={`${locked ? "Verrouillée" : "Ouvrir"} : ${mission.title}`}>
        {locked ? "Verrouillée" : mission.status === "completed" ? "Revoir" : mission.status === "in_progress" ? "Reprendre" : "Commencer"}
      </Button>
    </Flex>
  </Box>
}

/** Modules, then their 15-minute blocks: open (with missions), done, or "Bientôt disponible". */
function CourseBlocks({ course, navigate }: { course: DashboardCourse; navigate: (path: string) => void }) {
  const byId = new Map(course.missions.map((mission) => [mission.mission_version_id, mission]))
  let number = 0
  return <Stack gap="5">
    {course.modules!.map((module, moduleIndex) => <Stack key={moduleIndex} gap="3" as="section" aria-label={`Module : ${module.title}`}>
      {course.modules!.length > 1 || module.title ? <Text fontSize="sm" fontWeight="bold" color="brand.fg" textTransform="uppercase" letterSpacing="0.08em">{module.title}</Text> : null}
      {module.blocks.map((block) => {
        const missions = block.mission_ids.map((id) => byId.get(id)).filter((item): item is DashboardMission => Boolean(item))
        const first = number
        number += missions.length
        return <BlockCard key={block.id} block={block} missions={missions} offset={first} navigate={navigate} />
      })}
    </Stack>)}
  </Stack>
}

function BlockCard({ block, missions, offset, navigate }: { block: DashboardBlock; missions: DashboardMission[]; offset: number; navigate: (path: string) => void }) {
  const state = block.done ? { label: "Terminé", palette: "green", variant: "solid" as const }
    : block.open ? { label: "Ouvert", palette: "brand", variant: "subtle" as const }
      : { label: "Bientôt disponible", palette: "gray", variant: "subtle" as const }
  return <Box borderWidth="1px" borderColor="app.border" rounded="lg" p="4" bg={block.open ? "app.surface" : "app.sunken"} aria-label={`Bloc : ${block.title}`} role="group">
    <Flex gap="3" align="center" wrap="wrap" mb={missions.length ? "3" : "0"}>
      <Text fontWeight="semibold" flex="1">{block.title}</Text>
      {block.open && block.mission_count > 0 && <Text fontSize="sm" color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }}>{block.completed_count} / {block.mission_count} mission{block.mission_count > 1 ? "s" : ""}{block.bonus_count ? ` · ${block.bonus_count} bonus` : ""}</Text>}
      <Badge colorPalette={state.palette} variant={state.variant} rounded="full" gap="1">{block.done && <Icon name="check" size={12} />}{!block.open && <Icon name="clock" size={12} />}{state.label}</Badge>
    </Flex>
    {!block.open && missions.length === 0 && <Text fontSize="sm" color="app.muted">Votre enseignant ouvrira ce bloc pendant la séance.</Text>}
    {missions.length > 0 && <Stack gap="2.5" as="ol" listStyleType="none" p="0" m="0" aria-label="Missions">
      {missions.map((mission, index) => <MissionRow key={mission.mission_version_id} mission={mission} index={offset + index} navigate={navigate} />)}
    </Stack>}
  </Box>
}
