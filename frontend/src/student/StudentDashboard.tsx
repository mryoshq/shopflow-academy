import { HeroPanel, Overline, UpdatedAt } from "../brand/Hero"
import { timeLeft } from "./NextDeadline"
import { StudentProject } from "../project/StudentProject"
import type { HomeTab } from "../useHashRoute"
import { formatNumber, locale, t, tn } from "../i18n"
import { PART_LABELS, type FinalGrade } from "../grading/FinalGrade"
import { useCallback, useEffect, useState } from "react"
import { Badge, Box, Button, Flex, Grid, Heading, Link, Stack, Tabs, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { lastMission } from "./storage"
import type { Dashboard, DashboardBlock, DashboardCourse, DashboardMission, DashboardModule } from "./types"
import { VOYAGE_READY } from "../voyage"
import { DemoBadge, ErrorState, Icon, LoadingState, Panel, ScoreBar, StatusBadge, formatPoints } from "./ui"
import { ClassGoalPanel, ProgressPanel } from "../rewards/Rewards"

type Props = { navigate: (path: string) => void; tab?: HomeTab }

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

export function StudentDashboard({ navigate, tab = "projet" }: Props) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState(() => new Date())

  const load = useCallback(async () => {
    setError(null)
    setData(null)
    try { setData(await api<Dashboard>("/student/dashboard")); setLoadedAt(new Date()) }
    catch (reason) {
      if (!(reason instanceof ApiError && reason.status === 401)) setError(t("Impossible de charger votre tableau de bord."))
    }
  }, [])
  useEffect(() => { void load() }, [load])
  // ADR-0023: a block opened for the class or for this student arrives as a notification: reload quietly.
  useEffect(() => {
    const refresh = () => { void api<Dashboard>("/student/dashboard").then((next) => { setData(next); setLoadedAt(new Date()) }).catch(() => { /* next notification retries */ }) }
    window.addEventListener("academy:refresh", refresh)
    return () => window.removeEventListener("academy:refresh", refresh)
  }, [])

  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (!data) return <LoadingState label={t("Chargement de votre espace…")} />

  const target = continueTarget(data, lastMission())

  const tabs: { value: HomeTab; label: string }[] = [{ value: "projet", label: t("Projet") }, { value: "cours", label: t("Cours") }, { value: "ressources", label: t("Ressources") }]
  const resources = data.courses.flatMap((course) => course.resources)
  return <Stack gap="8">
    {/* ADR-0048: the dark dotted header panel. */}
    <HeroPanel as="section" aria-labelledby="dashboard-title">
      <Stack gap="3">
        <Overline color="hero.accent">{t("Tableau de bord")}</Overline>
        <Heading as="h1" id="dashboard-title" size={{ base: "4xl", md: "5xl" }} textStyle="display">{t("Bonjour,")}{" "}{data.display_name}</Heading>
        <Text fontSize="lg" color="hero.muted">{data.next_deadline
          ? t("Prochaine échéance : « {{title}} », {{left}}.", { title: data.next_deadline.title, left: timeLeft(data.next_deadline.due_at, loadedAt.getTime()) })
          : data.courses.length === 0 ? t("Aucun cours ne vous est encore attribué.") : t("Reprenez là où vous vous êtes arrêté.")}</Text>
        <UpdatedAt at={loadedAt} />
      </Stack>
    </HeroPanel>

    {/* ADR-0051: the essentials in three tabs, Projet first (the sessions are over, the project is due on 23/11). */}
    <Tabs.Root value={tab} onValueChange={(event) => navigate(event.value === "projet" ? "/" : `/${event.value}`)} variant="line" colorPalette="brand" lazyMount>
      <Tabs.List aria-label={t("Votre espace")} overflowX="auto">
        {tabs.map((item) => <Tabs.Trigger key={item.value} value={item.value} fontSize="md" px="4">{item.label}</Tabs.Trigger>)}
      </Tabs.List>
      <Tabs.Content value="projet" pt="6"><StudentProject navigate={navigate} /></Tabs.Content>
      <Tabs.Content value="cours" pt="6">{data.courses.length === 0 ? <Panel>
        <Stack gap="2"><Text fontWeight="semibold">{t("Aucun cours pour le moment")}</Text>
          <Text color="app.muted">{t("Dès qu’un cours vous sera attribué, il apparaîtra ici.")}</Text>
          <Button alignSelf="start" variant="outline" colorPalette="brand" onClick={() => void load()}><Icon name="retry" />{t("Actualiser")}</Button>
        </Stack>
      </Panel> : <Grid templateColumns={{ base: "1fr", lg: "minmax(0, 1fr) 18rem" }} gap="6" alignItems="start">
        <Stack gap="6">
          {target && <Button colorPalette="brand" size="lg" h="auto" minH="12" py="2.5" whiteSpace="normal" textAlign="start" alignSelf="start" maxW="full"
            onClick={() => navigate(`/mission/${target.mission_version_id}`)}>{t("Continuer :")}{" "}{target.title}<Icon name="arrow-right" /></Button>}
          {data.courses.map((course) => <Panel as="section" key={course.release_id} aria-labelledby={`course-${course.release_id}`}>
            <Stack gap="5">
              <Stack gap="2">
                {(course.is_demo || course.paused) && <Flex gap="2" align="center" wrap="wrap">{course.is_demo && <DemoBadge />}{course.paused && <Badge colorPalette="saffron" variant="solid" rounded="full">{t("En pause")}</Badge>}</Flex>}
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
          {data.courses.filter((course) => course.final_grade).map((course) => <Panel key={`final-${course.release_id}`} as="section" aria-label={t("Note finale : {{title}}", { title: course.title })}>
            <Stack gap="2"><Text fontWeight="semibold">{t("Note finale")}</Text><StudentFinal grade={course.final_grade!} /></Stack>
          </Panel>)}
          {rewardsCourse(data) && <Stack gap="4">
            <ProgressPanel rewards={rewardsCourse(data)!.rewards!} />
            {rewardsCourse(data)!.rewards!.class_goal && <ClassGoalPanel goal={rewardsCourse(data)!.rewards!.class_goal!} />}
          </Stack>}
        </Stack>
      </Grid>}</Tabs.Content>
      <Tabs.Content value="ressources" pt="6"><Stack gap="6" maxW="3xl">
        <Panel as="section" aria-labelledby="resources-title"><Stack gap="3">
          <Heading as="h2" size="md" id="resources-title">{t("Documents et liens")}</Heading>
          {resources.length === 0
            ? <Text color="app.muted">{t("Les ressources de vos cours apparaîtront ici.")}</Text>
            : <Stack as="ul" listStyleType="none" p="0" m="0" gap="2">{resources.map((url) => <Box as="li" key={url}>
              <Link href={url} target="_blank" rel="noreferrer" color="brand.fg" textDecoration="underline" wordBreak="break-all">{url}</Link></Box>)}</Stack>}
        </Stack></Panel>
        {VOYAGE_READY && <Flex as="nav" aria-label={t("Expérience interactive")} gap="3" align="center" wrap="wrap" px={{ base: "5", md: "7" }} py="5" rounded="card" borderWidth="1px" borderColor="app.border" bg="app.surface">
          <Stack gap="0" flex="1" minW="48"><Text fontWeight="semibold">{t("Le voyage d’une donnée")}</Text>
            <Text fontSize="sm" color="app.muted">{t("Sept scènes : une commande traverse le pipeline ShopFlow.")}</Text></Stack>
          <Button variant="outline" colorPalette="brand" onClick={() => navigate("/voyage/1")}>{t("Ouvrir l’expérience")}<Icon name="arrow-right" /></Button>
        </Flex>}
      </Stack></Tabs.Content>
    </Tabs.Root>
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
  // ADR-0051: modules in course order; a finished module is folded under « à revoir ».
  const numbered = course.modules!.map((module) => module.blocks.map((block) => {
    const missions = block.mission_ids.map((id) => byId.get(id)).filter((item): item is DashboardMission => Boolean(item))
    const first = number
    number += missions.length
    return { block, missions, first }
  }))
  return <Stack gap="5">
    {course.modules!.map((module, moduleIndex) => {
      const blocks = numbered[moduleIndex]
      const done = moduleDone(module)
      const title = course.modules!.length > 1 || module.title ? <Text fontSize="sm" fontWeight="bold" color="brand.fg" textTransform="uppercase" letterSpacing="0.08em">{module.title}</Text> : null
      const content = <>
        {module.description && module.blocks.some((block) => block.open) && <Text color="app.muted">{module.description}</Text>}
        {blocks.map(({ block, missions, first }) => <BlockCard key={block.id} block={block} missions={missions} offset={first} navigate={navigate} />)}
      </>
      return done
        ? <Box as="details" key={moduleIndex} aria-label={t("Module : {{title}}", { title: module.title })} data-testid="module-done">
          <Flex as="summary" cursor="pointer" gap="2" align="center" wrap="wrap" py="1">{title}<Badge colorPalette="green" variant="subtle" rounded="full">{t("Terminé · à revoir")}</Badge></Flex>
          <Stack gap="3" mt="3">{content}</Stack>
        </Box>
        : <Stack key={moduleIndex} gap="3" as="section" aria-label={t("Module : {{title}}", { title: module.title })}>{title}{content}</Stack>
    })}
  </Stack>
}

/** A module is finished when every block that counts (graded missions or lessons) is open and done. */
export function moduleDone(module: DashboardModule): boolean {
  const counting = module.blocks.filter((block) => block.mission_count > 0 || (block.lesson_count ?? 0) > 0)
  return counting.length > 0 && counting.every((block) => block.open && block.done)
}

/** ADR-0046: the final grade as the student sees it (once the teacher shows it), with its parts. */
function StudentFinal({ grade }: { grade: FinalGrade }) {
  return <Stack gap="1.5" fontSize="sm" css={{ fontVariantNumeric: "tabular-nums" }}>
    <Text fontSize="2xl" fontWeight="bold" lineHeight="1">{grade.final === null ? t("en attente") : `${formatNumber(grade.final)} / 20`}</Text>
    {grade.provisional && <Text color="app.muted">{t("Provisoire : certaines parties ne sont pas encore notées.")}</Text>}
    {(["course", "workshops", "project"] as const).filter((key) => grade.parts[key].weight > 0).map((key) => <Flex key={key} justify="space-between" gap="3">
      <Text>{t(PART_LABELS[key])} ({formatNumber(grade.parts[key].weight)} %)</Text>
      <Text color={grade.parts[key].pending ? "app.muted" : undefined}>{grade.parts[key].pending ? t("en attente") : `${formatNumber(grade.parts[key].on20 ?? 0)} / 20`}</Text>
    </Flex>)}
    {grade.project_bonus + grade.course_bonus > 0 && <Text>{t("Bonus : +{{value}}", { value: formatNumber(grade.project_bonus + grade.course_bonus) })}</Text>}
  </Stack>
}

/** ADR-0046: « 4 / 10 pts », « 0 / 6 pts bonus », or « Leçons » for a block of lessons only. */
export function blockPoints(block: DashboardBlock): string {
  const parts: string[] = []
  if (block.mission_count > 0) parts.push(t("{{points}} / {{possible}} pts", { points: formatNumber(block.points ?? 0), possible: formatNumber(block.possible ?? 0) }))
  if (block.bonus_count > 0) parts.push(t("{{points}} / {{possible}} pts bonus", { points: formatNumber(block.bonus_points ?? 0), possible: formatNumber(block.bonus_possible ?? 0) }))
  if (parts.length === 0) return t("Leçons")
  if (block.lesson_count) parts.push(t("leçons lues {{p0}}/{{lesson_count}}", { p0: block.lessons_read ?? 0, lesson_count: block.lesson_count }))
  return parts.join(" · ")
}

function BlockCard({ block, missions, offset, navigate }: { block: DashboardBlock; missions: DashboardMission[]; offset: number; navigate: (path: string) => void }) {
  const state = block.done ? { label: t("Terminé"), palette: "green", variant: "solid" as const }
    : block.open && block.for_you ? { label: t("Ouvert pour vous"), palette: "brand", variant: "solid" as const }
    : block.open ? { label: t("Ouvert"), palette: "brand", variant: "subtle" as const }
      : { label: t("Bientôt disponible"), palette: "gray", variant: "subtle" as const }
  return <Box borderWidth="1px" borderColor="app.border" rounded="lg" p="4" bg={block.open ? "app.surface" : "app.sunken"} aria-label={t("Bloc : {{title}}", { title: block.title })} role="group">
    <Flex gap="3" align="center" wrap="wrap" mb={missions.length ? "3" : "0"}>
      <Text fontWeight="semibold" flex="1">{block.title}</Text>
      {block.bonus_only && <Badge colorPalette="saffron" variant="outline" rounded="full">{t("Bonus facultatifs")}</Badge>}
      {block.open && (block.mission_count > 0 || block.bonus_count > 0 || (block.lesson_count ?? 0) > 0) && <Text fontSize="sm" color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }} data-testid="block-points">{blockPoints(block)}</Text>}
      <Badge colorPalette={state.palette} variant={state.variant} rounded="full" gap="1">{block.done && <Icon name="check" size={12} />}{!block.open && <Icon name="clock" size={12} />}{state.label}</Badge>
    </Flex>
    {block.open && block.objective && <Flex gap="2" align="start" mt="-1" mb="3" fontSize="sm" color="brand.fg"><Box mt="0.5" flexShrink={0}><Icon name="target" size={14} /></Box><Text><Text as="span" fontWeight="semibold">{t("Objectif :")}{" "}</Text>{block.objective}</Text></Flex>}
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
