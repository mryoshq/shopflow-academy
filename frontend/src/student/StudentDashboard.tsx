import { locale, t, tn } from "../i18n"
import { useCallback, useEffect, useState } from "react"
import { Badge, Box, Button, Flex, Grid, Heading, Link, Stack, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { lastMission } from "./storage"
import type { Dashboard, DashboardBlock, DashboardCourse, DashboardMission } from "./types"
import { useNotificationFeed } from "../live/notifications"
import { VOYAGE_READY } from "../voyage"
import { CAMPUSEQUIP_READY } from "../campusequip"
import { DemoBadge, ErrorState, Icon, LoadingState, Panel, ScoreBar, StatusBadge, formatPoints } from "./ui"
import { ClassGoalPanel, ProgressPanel } from "../rewards/Rewards"

type Props = { navigate: (path: string) => void }

/** First mission not yet solved in the open blocks (main missions before bonus), else the last one visited. */
export function continueTarget(dashboard: Dashboard, remembered: number | null): DashboardMission | null {
  const all = dashboard.courses.flatMap((course) => course.missions)
  const open = all.filter((mission) => mission.status !== "locked")
  const todo = open.find((mission) => !mission.bonus && mission.status !== "completed")
    ?? open.find((mission) => mission.status !== "completed")
  return todo ?? open.find((mission) => mission.mission_version_id === remembered) ?? open[0] ?? null
}

/** ADR-0039: the progression shown is the main course's (the demonstration only when it is alone). */
export function rewardsCourse(dashboard: Dashboard): DashboardCourse | null {
  const withRewards = dashboard.courses.filter((course) => course.rewards)
  return withRewards.find((course) => !course.is_demo) ?? withRewards[0] ?? null
}

export function StudentDashboard({ navigate }: Props) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setData(null)
    try { setData(await api<Dashboard>("/student/dashboard")) }
    catch (reason) {
      if (!(reason instanceof ApiError && reason.status === 401)) setError(t("Impossible de charger votre tableau de bord."))
    }
  }, [])
  useEffect(() => { void load() }, [load])
  // ADR-0023: a block opened for the class or for this student arrives as a notification: reload quietly.
  useEffect(() => {
    const refresh = () => { void api<Dashboard>("/student/dashboard").then(setData).catch(() => { /* next notification retries */ }) }
    window.addEventListener("academy:refresh", refresh)
    return () => window.removeEventListener("academy:refresh", refresh)
  }, [])

  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (!data) return <LoadingState label={t("Chargement de votre espace…")} />

  const target = continueTarget(data, lastMission())

  return <Stack gap="8">
    <Flex gap="6" justify="space-between" align={{ base: "start", md: "end" }} direction={{ base: "column", md: "row" }}>
      <Stack gap="2">
        <Heading as="h1" size={{ base: "3xl", md: "4xl" }} letterSpacing="-0.01em">{t("Bonjour,")}{" "}{data.display_name}</Heading>
        <Text fontSize="lg" color="app.muted">{data.courses.length === 0 ? t("Votre enseignant ne vous a pas encore attribué de cours.") : t("Reprenez là où vous vous êtes arrêté.")}</Text>
      </Stack>
      {target && <Button colorPalette="brand" size="lg" h="auto" minH="12" py="2.5" whiteSpace="normal" textAlign="start" maxW="full" onClick={() => navigate(`/mission/${target.mission_version_id}`)}>
        {t("Continuer :")}{" "}{target.title}<Icon name="arrow-right" />
      </Button>}
    </Flex>
    {data.courses.length > 0 && <Flex as="nav" aria-label={t("Projet")} gap="3" align="center" wrap="wrap" p="4" rounded="card" borderWidth="1px" borderColor="app.border" bg="app.surface">
      <Stack gap="0" flex="1" minW="48"><Text fontWeight="semibold">{t("Projet CampusEquip")}</Text>
        <Text fontSize="sm" color="app.muted">{t("Binôme, jalons, dépôts et soutenance.")}</Text></Stack>
      <Button variant="outline" colorPalette="brand" onClick={() => navigate("/projet")}>{t("Ouvrir l’espace projet")}<Icon name="arrow-right" /></Button>
    </Flex>}
    {/* ADR-0033: the experience is in the menu once integrated. */}
    {data.courses.length > 0 && VOYAGE_READY && <Flex as="nav" aria-label={t("Expérience interactive")} gap="3" align="center" wrap="wrap" p="4" rounded="card" borderWidth="1px" borderColor="app.border" bg="app.surface">
      <Stack gap="0" flex="1" minW="48"><Text fontWeight="semibold">{t("Le voyage d’une donnée")}</Text>
        <Text fontSize="sm" color="app.muted">{t("Sept scènes : une commande traverse le pipeline ShopFlow.")}</Text></Stack>
      <Button variant="outline" colorPalette="brand" onClick={() => navigate("/voyage/1")}>{t("Ouvrir l’expérience")}<Icon name="arrow-right" /></Button>
    </Flex>}
    {/* ADR-0044: next to the voyage. */}
    {data.courses.length > 0 && CAMPUSEQUIP_READY && <Flex as="nav" aria-label={t("Expérience CampusEquip")} gap="3" align="center" wrap="wrap" p="4" rounded="card" borderWidth="1px" borderColor="app.border" bg="app.surface">
      <Stack gap="0" flex="1" minW="48"><Text fontWeight="semibold">{t("Le voyage d’une location")}</Text>
        <Text fontSize="sm" color="app.muted">{t("Sept étapes : un lot CampusEquip, des guichets jusqu’aux indicateurs.")}</Text></Stack>
      <Button variant="outline" colorPalette="brand" onClick={() => navigate("/campusequip/1")} aria-label={t("Ouvrir l’expérience CampusEquip")}>{t("Ouvrir l’expérience")}<Icon name="arrow-right" /></Button>
    </Flex>}

    {data.courses.length === 0 ? <Panel>
      <Stack gap="2"><Text fontWeight="semibold">{t("Aucun cours pour le moment")}</Text>
        <Text color="app.muted">{t("Dès qu’un cours vous sera attribué, il apparaîtra ici. Vous pouvez rafraîchir la page pendant la séance.")}</Text>
        <Button alignSelf="start" variant="outline" colorPalette="brand" onClick={() => void load()}><Icon name="retry" />{t("Actualiser")}</Button>
      </Stack>
    </Panel> : <Grid templateColumns={{ base: "1fr", lg: "minmax(0, 1fr) 18rem" }} gap="6" alignItems="start">
      <Stack gap="6">
        {data.courses.map((course) => <Panel as="section" key={course.release_id} aria-labelledby={`course-${course.release_id}`}>
          <Stack gap="5">
            <Stack gap="2">
              <Flex gap="2" align="center" wrap="wrap">{course.is_demo && <DemoBadge />}{course.paused && <Badge colorPalette="saffron" variant="solid" rounded="full">{t("En pause")}</Badge>}<Text fontSize="sm" color="app.muted">{t("Version")}{" "}{course.version}</Text></Flex>
              {course.paused && <Text fontSize="sm" color="saffron.fg">{t("Votre enseignant a mis cette séquence en pause : vous pouvez relire les missions, les réponses reprendront à son signal.")}</Text>}
              {course.rules_notice && <RulesNotice releaseId={course.release_id} notice={course.rules_notice} />}
              <Heading as="h2" size="xl" id={`course-${course.release_id}`}>{course.title}</Heading>
              {course.description && <Text color="app.muted">{course.description}</Text>}
            </Stack>
            {course.modules && course.modules.length > 0
              ? <CourseBlocks course={course} navigate={navigate} />
              : <Stack gap="2.5" as="ol" listStyleType="none" p="0" m="0" aria-label={t("Missions")}>
                {course.missions.map((mission, index) => <MissionRow key={mission.mission_version_id} mission={mission} index={index} navigate={navigate} />)}
              </Stack>}
          </Stack>
        </Panel>)}
      </Stack>
      <Stack gap="4" as="aside" aria-label={t("Suivi")}>
        {data.courses.map((course) => <Panel key={course.release_id} aria-label={t("Score : {{title}}", { title: course.title })}>
          <Stack gap="3">
            <Text fontWeight="semibold">{data.courses.length > 1 ? course.title : t("Votre score")}</Text>
            <Text fontSize="3xl" fontWeight="bold" lineHeight="1" css={{ fontVariantNumeric: "tabular-nums" }}>
              {formatPoints(course.score.core_points)}<Text as="span" fontSize="lg" color="app.muted"> / {course.score.core_possible} {t("pts")}</Text>
            </Text>
            <ScoreBar value={course.score.core_points} max={course.score.core_possible} label={t("{{p0}} points sur {{core_possible}}", { p0: formatPoints(course.score.core_points), core_possible: course.score.core_possible })} />
            <Text fontSize="sm" color="app.muted">{tn("{{count}} mission réussie sur {{total}}", course.score.completed, { total: course.score.total })}{t(". Votre meilleur essai compte.")}</Text>
            {course.score.bonus_possible > 0 && <Text fontSize="sm"><Text as="span" fontWeight="semibold">{t("Bonus :")}</Text> {formatPoints(course.score.bonus_points)} / {course.score.bonus_possible} {t("pts, comptés à part.")}</Text>}
          </Stack>
        </Panel>)}
        {rewardsCourse(data) && <Stack gap="4">
          <ProgressPanel rewards={rewardsCourse(data)!.rewards!} />
          {rewardsCourse(data)!.rewards!.class_goal && <ClassGoalPanel goal={rewardsCourse(data)!.rewards!.class_goal!} />}
        </Stack>}
        <TeacherMessages />
        <Panel>
          <Stack gap="2">
            <Text fontWeight="semibold">{t("Ressources")}</Text>
            {data.courses.flatMap((course) => course.resources).length === 0
              ? <Text fontSize="sm" color="app.muted">{t("Les ressources de vos cours apparaîtront ici.")}</Text>
              : data.courses.flatMap((course) => course.resources).map((url) => <Link key={url} href={url} target="_blank" rel="noreferrer" color="brand.fg" textDecoration="underline" wordBreak="break-all" fontSize="sm">{url}</Link>)}
          </Stack>
        </Panel>
        {!data.ai_enabled && <Text fontSize="xs" color="app.muted" px="1">{t("L’assistant IA est désactivé. Les indices de chaque mission restent disponibles.")}</Text>}
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
        <Flex gap="2" align="center" wrap="wrap"><Text fontWeight="semibold">{mission.title}</Text>{mission.bonus && <Badge colorPalette="saffron" variant="outline" rounded="full">{t("Bonus")}</Badge>}</Flex>
        <Text fontSize="sm" color="app.muted">{locked ? t("Se débloque après : {{p0}}", { p0: mission.locked_by.join(", ") }) : t("{{chapter}} · environ {{minutes}} min · {{best}} / {{possible}} pts", { chapter: mission.chapter, minutes: mission.estimated_duration_minutes ?? "?", best: formatPoints(mission.best_points), possible: mission.possible }) + (mission.bonus ? t(" (bonus)") : "")}</Text>
      </Stack>
      <StatusBadge status={mission.status} />
      <Button size="sm" variant={mission.status === "completed" ? "outline" : "solid"} colorPalette="brand" disabled={locked}
        onClick={() => navigate(`/mission/${mission.mission_version_id}`)} aria-label={locked ? t("Verrouillée : {{title}}", { title: mission.title }) : t("Ouvrir : {{title}}", { title: mission.title })}>
        {locked ? t("Verrouillée") : mission.status === "completed" ? t("Revoir") : mission.status === "in_progress" ? t("Reprendre") : t("Commencer")}
      </Button>
    </Flex>
  </Box>
}

/** Modules, then their 15-minute blocks: open (with missions), done, or "Bientôt disponible". */
function CourseBlocks({ course, navigate }: { course: DashboardCourse; navigate: (path: string) => void }) {
  const byId = new Map(course.missions.map((mission) => [mission.mission_version_id, mission]))
  let number = 0
  return <Stack gap="5">
    {course.modules!.map((module, moduleIndex) => <Stack key={moduleIndex} gap="3" as="section" aria-label={t("Module : {{title}}", { title: module.title })}>
      {course.modules!.length > 1 || module.title ? <Text fontSize="sm" fontWeight="bold" color="brand.fg" textTransform="uppercase" letterSpacing="0.08em">{module.title}</Text> : null}
      {module.description && module.blocks.some((block) => block.open) && <Text color="app.muted">{module.description}</Text>}
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
  const state = block.done ? { label: t("Terminé"), palette: "green", variant: "solid" as const }
    : block.open && block.for_you ? { label: t("Ouvert pour vous"), palette: "brand", variant: "solid" as const }
    : block.open ? { label: t("Ouvert"), palette: "brand", variant: "subtle" as const }
      : { label: t("Bientôt disponible"), palette: "gray", variant: "subtle" as const }
  return <Box borderWidth="1px" borderColor="app.border" rounded="lg" p="4" bg={block.open ? "app.surface" : "app.sunken"} aria-label={t("Bloc : {{title}}", { title: block.title })} role="group">
    <Flex gap="3" align="center" wrap="wrap" mb={missions.length ? "3" : "0"}>
      <Text fontWeight="semibold" flex="1">{block.title}</Text>
      {block.open && (block.mission_count > 0 || (block.lesson_count ?? 0) > 0) && <Text fontSize="sm" color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }}>{block.completed_count} / {tn("{{count}} mission", block.mission_count)}{block.bonus_count ? ` · ${block.bonus_count} bonus` : ""}{block.lesson_count ? t(" · leçons lues {{p0}}/{{lesson_count}}", { p0: block.lessons_read ?? 0, lesson_count: block.lesson_count }) : ""}</Text>}
      <Badge colorPalette={state.palette} variant={state.variant} rounded="full" gap="1">{block.done && <Icon name="check" size={12} />}{!block.open && <Icon name="clock" size={12} />}{state.label}</Badge>
    </Flex>
    {block.open && block.objective && <Flex gap="2" align="start" mt="-1" mb="3" fontSize="sm" color="brand.fg"><Box mt="0.5" flexShrink={0}><Icon name="target" size={14} /></Box><Text><Text as="span" fontWeight="semibold">{t("Objectif :")}{" "}</Text>{block.objective}</Text></Flex>}
    {!block.open && missions.length === 0 && <Text fontSize="sm" color="app.muted">{t("Votre enseignant ouvrira ce bloc pendant la séance.")}</Text>}
    {missions.length > 0 && <Stack gap="2.5" as="ol" listStyleType="none" p="0" m="0" aria-label={t("Missions")}>
      {missions.map((mission, index) => <MissionRow key={mission.mission_version_id} mission={mission} index={offset + index} navigate={navigate} />)}
    </Stack>}
  </Box>
}

/** ADR-0027: the teacher's announcement of the rules against random clicking, until the student acknowledges it. */
function RulesNotice({ releaseId, notice }: { releaseId: number; notice: { text: string; since: string } }) {
  const key = `shopflow:notice:${releaseId}:${notice.since}`
  const [seen, setSeen] = useState(() => { try { return window.localStorage.getItem(key) === "1" } catch { return false } })
  if (seen) return null
  return <Flex role="status" gap="3" align="center" wrap="wrap" p="3" rounded="lg" bg="saffron.subtle" borderWidth="1px" borderColor="saffron.solid">
    <Box color="saffron.fg"><Icon name="alert" /></Box>
    <Text flex="1" minW="48" fontWeight="medium">{notice.text}</Text>
    <Button size="sm" variant="outline" colorPalette="saffron" onClick={() => { try { window.localStorage.setItem(key, "1") } catch { /* not remembered */ } setSeen(true) }}>{t("J’ai compris")}</Button>
  </Flex>
}

/** ADR-0023: the teacher's last messages (full history under the bell in the header). */
function TeacherMessages() {
  const { items, markRead } = useNotificationFeed()
  const messages = items.filter((item) => item.kind === "message").slice(0, 3)
  if (messages.length === 0) return null
  const unread = messages.filter((item) => !item.read_at).map((item) => item.id)
  return <Panel as="section" aria-labelledby="teacher-messages" borderColor={unread.length ? "brand.solid" : "app.border"}>
    <Stack gap="2">
      <Flex gap="2" align="center"><Icon name="bell" size={16} /><Text fontWeight="semibold" id="teacher-messages">{t("Messages de votre enseignant")}</Text></Flex>
      <Stack as="ul" listStyleType="none" p="0" m="0" gap="2">{messages.map((item) => <Box as="li" key={item.id} fontSize="sm">
        <Text fontWeight={item.read_at ? "normal" : "semibold"}>{item.text}</Text>
        <Text fontSize="xs" color="app.muted">{new Date(item.created_at).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}{item.read_at ? "" : t(" · non lu")}</Text>
      </Box>)}</Stack>
      {unread.length > 0 && <Button size="xs" variant="outline" colorPalette="brand" alignSelf="start" onClick={() => void markRead(unread)}>{t("J’ai lu")}</Button>}
    </Stack>
  </Panel>
}
