import { BlockStudents } from "./BlockStudents"
import { formatNumber, t, tn } from "../i18n"
import { useCallback, useEffect, useState } from "react"
import { Badge, Box, Button, Flex, Heading, Stack, Table, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { Icon, Panel } from "../student/ui"
import { SidePanel } from "./SidePanel"
import { HELP_CHANGED } from "./HelpBadge"

export const TIMELINE_REFRESH_MS = 5000

export type TimelineBlock = {
  chapter_id: number; position: number; module: string; title: string; open: boolean; opened_at: string | null
  mission_count: number; bonus_count: number; possible?: number; bonus_possible?: number; duration_minutes: number; completed_students: number; help_pending: number
  lesson_count?: number; lessons_read_students?: number
}
export type HelpItem = { id: number; student: string; mission_version_id: number; mission: string; block: string; message: string; created_at: string }
export type MissionStat = { mission_version_id: number; title: string; block: string; bonus: boolean; completed: number; attempts: number; hints: number; stuck: string[]
  fast_attempts?: number; fast?: { student: string; count: number }[] }
export type Timeline = {
  generated_at: string; assignment_id: number; student_count: number; block_minutes: number; next_block_id: number | null
  blocks: TimelineBlock[]; help: HelpItem[]; missions: MissionStat[]
}

export function minutesSince(iso: string | null, now: number): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
}

function waited(iso: string, now: number): string {
  const minutes = minutesSince(iso, now)
  return minutes < 1 ? t("à l’instant") : t("depuis {{minutes}} min", { minutes })
}

/**
 * Teacher only: the day in blocks, "Ouvrir le bloc suivant", a 15-minute landmark (never
 * an automatic close, never shown to students), pending help requests and difficulties.
 */
export type TimelineSection = "frise" | "aide" | "difficultes"

/** ADR-0046: the block's points for the class (« 10 pts · 6 pts bonus »), « Leçons » for lessons only. */
function blockTotal(block: { mission_count: number; bonus_count: number; possible?: number; bonus_possible?: number }): string {
  const parts: string[] = []
  if (block.mission_count > 0) parts.push(t("{{possible}} pts", { possible: formatNumber(block.possible ?? 0) }))
  if (block.bonus_count > 0) parts.push(t("{{possible}} pts bonus", { possible: formatNumber(block.bonus_possible ?? 0) }))
  return parts.length ? parts.join(" · ") : t("Leçons")
}

export function ClassTimeline({ assignmentId, section }: { assignmentId: number; section?: TimelineSection }) {
  const [data, setData] = useState<Timeline | null>(null)
  const [helpOpen, setHelpOpen] = useState<HelpItem | null>(null)
  const [missionOpen, setMissionOpen] = useState<MissionStat | null>(null)
  const shows = (part: TimelineSection) => section === undefined || section === part
  const [stale, setStale] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    try {
      setData(await api<Timeline>(`/teacher/classes/${assignmentId}/timeline`))
      setStale(false)
    } catch (reason) {
      if (!(reason instanceof ApiError && reason.status === 401)) setStale(true)
    }
  }, [assignmentId])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const timer = window.setInterval(() => { void refresh() }, TIMELINE_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [refresh])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [])

  async function act(path: string, success: (result: { title?: string }) => string) {
    setBusy(true)
    setNotice("")
    try {
      const result = await api<{ title?: string }>(path, "POST")
      setNotice(success(result))
      // The « Demandes d'aide » badge of the sidebar refreshes at once (TeacherApp).
      if (path.includes("/help/")) window.dispatchEvent(new Event(HELP_CHANGED))
      setNow(Date.now())
      await refresh()
    } catch (reason) {
      setNotice(reason instanceof ApiError ? (reason.status === 409 ? t("Tous les blocs sont déjà ouverts.") : `Action impossible : ${reason.message}`) : t("Connexion interrompue. Réessayez."))
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <Panel><Text role="status" color="app.muted">{stale ? t("Connexion perdue. Nouvel essai dans quelques secondes…") : t("Chargement de la journée…")}</Text></Panel>

  const openBlocks = data.blocks.filter((block) => block.open && block.opened_at)
  const current = openBlocks.reduce<TimelineBlock | null>((latest, block) => !latest || (block.opened_at! > latest.opened_at!) ? block : latest, null)
  const next = data.blocks.find((block) => block.chapter_id === data.next_block_id) ?? null
  const elapsed = current ? minutesSince(current.opened_at, now) : 0
  const over = elapsed >= data.block_minutes

  return <Stack gap="5">
    {shows("frise") && <Panel as="section" aria-labelledby="timeline-title">
      <Stack gap="4">
        <Flex gap="3" justify="space-between" align={{ base: "start", md: "center" }} direction={{ base: "column", md: "row" }}>
          <Stack gap="1">
            <Heading as="h3" size="md" id="timeline-title">{t("Déroulé de la journée")}</Heading>
            <Text fontSize="sm" color="app.muted">{tn("{{count}} bloc ouvert sur {{total}}", openBlocks.length, { total: data.blocks.length })}{t(". Les blocs ouverts restent accessibles.")}</Text>
          </Stack>
          <Button colorPalette="brand" size="lg" h="auto" minH="12" py="2.5" whiteSpace="normal" textAlign="start" maxW="full" loading={busy} disabled={!next}
            onClick={() => void act(`/teacher/classes/${assignmentId}/blocks/open-next`, (result) => t("Bloc « {{title}} » ouvert pour toute la classe.", { title: result.title }))}>
            {next ? t("Ouvrir le bloc suivant : {{title}}", { title: next.title }) : t("Tous les blocs sont ouverts")}
          </Button>
        </Flex>
        {current && <Box p="3" rounded="lg" bg={over ? "saffron.subtle" : "brand.subtle"} aria-label={t("Repère horaire (visible par vous seul)")}>
          <Flex gap="2" align="center" wrap="wrap" mb="2">
            <Icon name="clock" size={16} />
            <Text fontWeight="semibold">« {current.title} {t("» ouvert depuis")}{" "}{elapsed} {t("min")}</Text>
            <Text fontSize="sm" color="app.muted">{t("Repère :")}{" "}{data.block_minutes} {t("min")}{over ? t(" — dépassé, rien ne se ferme automatiquement") : ""}{t(". Visible par vous seul.")}</Text>
          </Flex>
          <Box h="2" bg="app.surface" rounded="full" overflow="hidden" role="img" aria-label={t("{{elapsed}} minutes sur un repère de {{block_minutes}}", { elapsed, block_minutes: data.block_minutes })}>
            <Box h="full" bg={over ? "saffron.solid" : "brand.solid"} w={`${Math.min(100, (elapsed / data.block_minutes) * 100)}%`} />
          </Box>
        </Box>}
        {notice && <Text role="status" color="brand.fg" fontWeight="medium">{notice}</Text>}
        {stale && <Text fontSize="sm" color="red.fg">{t("Connexion perdue : données possiblement anciennes.")}</Text>}
        <Stack as="ol" gap="2" listStyleType="none" p="0" m="0" aria-label={t("Blocs de la journée")}>
          {data.blocks.map((block, index) => {
            const newModule = index === 0 || data.blocks[index - 1].module !== block.module
            return <Box as="li" key={block.chapter_id}>
              {newModule && <Text fontSize="xs" fontWeight="bold" color="brand.fg" textTransform="uppercase" letterSpacing="0.08em" mt={index ? "3" : "0"} mb="1.5">{block.module}</Text>}
              <Flex gap="3" align="center" wrap="wrap" p="3" borderWidth="1px" borderColor={block.help_pending ? "saffron.400" : "app.border"} borderLeftWidth="4px"
                borderLeftColor={block.open ? "brand.solid" : "app.border"} rounded="lg" bg={block.open ? "app.surface" : "app.sunken"}>
                <Text fontWeight="bold" color="app.muted" minW="6" css={{ fontVariantNumeric: "tabular-nums" }}>{block.position}</Text>
                <Stack gap="0" flex="1" minW="48">
                  <Text fontWeight="semibold">{block.title}</Text>
                  <Text fontSize="sm" color="app.muted">{blockTotal(block)} {t("· environ {{minutes}} min", { minutes: block.duration_minutes })}</Text>
                </Stack>
                <Badge colorPalette={block.open ? "green" : "gray"} variant="subtle" rounded="full">{block.open ? t("Ouvert") : t("Fermé")}</Badge>
                <BlockStudents key={`${assignmentId}:${block.chapter_id}`} assignmentId={assignmentId} chapterId={block.chapter_id} title={block.title} completed={block.completed_students} total={data.student_count} />
                {(block.lesson_count ?? 0) > 0 && <Text fontSize="sm" color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }}>{t("leçons lues")}{" "}{block.lessons_read_students ?? 0}/{data.student_count}</Text>}
                {block.help_pending > 0 && <Badge colorPalette="saffron" variant="solid" rounded="full">{tn("{{count}} demande d’aide", block.help_pending)}</Badge>}
                {block.open
                  ? <Button size="xs" variant="outline" loading={busy} aria-label={t("Fermer le bloc {{title}}", { title: block.title })}
                    onClick={() => void act(`/teacher/classes/${assignmentId}/blocks/${block.chapter_id}/close`, () => t("Bloc « {{title}} » fermé.", { title: block.title }))}>{t("Fermer")}</Button>
                  : <Button size="xs" colorPalette="brand" variant="outline" loading={busy} aria-label={t("Ouvrir le bloc {{title}}", { title: block.title })}
                    onClick={() => void act(`/teacher/classes/${assignmentId}/blocks/${block.chapter_id}/open`, () => t("Bloc « {{title}} » ouvert pour toute la classe.", { title: block.title }))}>{t("Ouvrir")}</Button>}
              </Flex>
            </Box>
          })}
        </Stack>
        {data.blocks.length === 0 && <Text color="app.muted">{t("Ce cours n’a pas encore de bloc.")}</Text>}
      </Stack>
    </Panel>}

    {shows("aide") && <Panel as="section" aria-labelledby="help-title" borderColor={data.help.length ? "saffron.400" : "app.border"}>
      <Stack gap="3">
        <Heading as="h3" size="md" id="help-title">{t("Demandes d’aide en attente (")}{data.help.length})</Heading>
        {data.help.length === 0 ? <Text color="app.muted" fontSize="sm">{t("Aucune demande pour le moment.")}</Text>
          : <Stack as="ul" gap="2" listStyleType="none" p="0" m="0">{data.help.map((item) => <Flex as="li" key={item.id} gap="3" align="center" wrap="wrap" p="3" bg="saffron.subtle" rounded="lg">
            <Stack gap="0" flex="1" minW="56">
              <Text fontWeight="semibold">{item.student} · {item.mission}</Text>
              <Text fontSize="sm" color="app.muted">{item.block} · {waited(item.created_at, now)}</Text>
              {item.message && <Text fontSize="sm" mt="1">« {item.message} »</Text>}
            </Stack>
            <Flex gap="2" wrap="wrap">
              <Button size="sm" variant="ghost" onClick={() => setHelpOpen(item)} aria-label={t("Voir la demande de {{student}}", { student: item.student })}>{t("Voir")}</Button>
              <Button size="sm" colorPalette="brand" loading={busy}
                onClick={() => void act(`/teacher/help/${item.id}/handle`, () => t("Demande de {{student}} marquée comme traitée.", { student: item.student }))}>{t("Marquer comme traitée")}</Button>
            </Flex>
          </Flex>)}</Stack>}
        {section === "aide" && notice && <Text role="status" color="brand.fg" fontWeight="medium">{notice}</Text>}
      </Stack>
    </Panel>}

    {shows("difficultes") && <Panel as="section" aria-labelledby="stats-title" p="0" overflow="hidden">
      <Box p={{ base: "5", md: "6" }} pb="3"><Heading as="h3" size="md" id="stats-title">{t("Missions : réussites et difficultés")}</Heading>
        <Text fontSize="sm" color="app.muted">{t("« Bloqués » : plusieurs essais sans réussite.")}</Text></Box>
      <Box overflowX="auto" tabIndex={0} role="region" aria-label={t("Tableau des missions (défilement horizontal)")}>
        <Table.Root size="sm" variant="line" aria-label={t("Statistiques par mission")}>
          <Table.Header><Table.Row bg="app.sunken">{[t("Mission"), t("Bloc"), t("Réussites"), t("Essais"), t("Indices"), t("Bloqués")].map((label) => <Table.ColumnHeader key={label} scope="col">{label}</Table.ColumnHeader>)}</Table.Row></Table.Header>
          <Table.Body>{data.missions.map((item) => <Table.Row key={item.mission_version_id} bg={item.stuck.length ? "saffron.subtle" : undefined}>
            <Table.Cell fontWeight="medium"><Button variant="plain" size="sm" p="0" h="auto" minH="0" color="brand.fg" textDecoration="underline" whiteSpace="normal" textAlign="start"
              onClick={() => setMissionOpen(item)} aria-label={t("Détail de la mission {{title}}", { title: item.title })}>{item.title}</Button>{item.bonus ? " (bonus)" : ""}</Table.Cell>
            <Table.Cell color="app.muted">{item.block}</Table.Cell>
            <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{item.completed} / {data.student_count}</Table.Cell>
            <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{item.attempts}</Table.Cell>
            <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{item.hints}</Table.Cell>
            <Table.Cell>{item.stuck.length ? item.stuck.join(", ") : "—"}</Table.Cell>
          </Table.Row>)}</Table.Body>
        </Table.Root>
      </Box>
    </Panel>}

    <SidePanel open={helpOpen !== null} title={helpOpen ? t("Demande d’aide : {{student}}", { student: helpOpen.student }) : t("Demande d’aide")} onClose={() => setHelpOpen(null)}>
      {helpOpen && <Stack gap="3">
        <Text><strong>{t("Mission :")}</strong> {helpOpen.mission}</Text>
        <Text><strong>{t("Bloc :")}</strong> {helpOpen.block}</Text>
        <Text color="app.muted">{t("Demandée")}{" "}{waited(helpOpen.created_at, now)}</Text>
        <Box p="3" rounded="lg" bg="app.sunken">{helpOpen.message ? `« ${helpOpen.message} »` : t("Sans message.")}</Box>
        <Button alignSelf="start" colorPalette="brand" loading={busy} onClick={() => {
          const item = helpOpen
          setHelpOpen(null)
          void act(`/teacher/help/${item.id}/handle`, () => t("Demande de {{student}} marquée comme traitée.", { student: item.student }))
        }}>{t("Marquer comme traitée")}</Button>
      </Stack>}
    </SidePanel>
    <SidePanel open={missionOpen !== null} title={missionOpen ? t("Mission : {{title}}", { title: missionOpen.title }) : t("Mission")} onClose={() => setMissionOpen(null)}>
      {missionOpen && <Stack gap="3">
        <Text color="app.muted">{missionOpen.block}{missionOpen.bonus ? " · bonus" : ""}</Text>
        <Text css={{ fontVariantNumeric: "tabular-nums" }}><strong>{t("Réussites :")}</strong> {missionOpen.completed} / {data.student_count}</Text>
        <Text css={{ fontVariantNumeric: "tabular-nums" }}><strong>{t("Essais :")}</strong> {missionOpen.attempts} · <strong>{t("Indices :")}</strong> {missionOpen.hints}</Text>
        <Text><strong>{t("Bloqués :")}</strong> {missionOpen.stuck.length ? missionOpen.stuck.join(", ") : "personne"}</Text>
        {/* ADR-0027: information only, never a sanction; shown discreetly and only when there are some. */}
        {missionOpen.fast?.length ? <Flex gap="2" align="baseline" wrap="wrap" fontSize="xs" color="app.muted" data-testid="fast-indicator">
          <Badge colorPalette="saffron" variant="outline" rounded="full" size="sm" css={{ fontVariantNumeric: "tabular-nums" }}>{tn("{{count}} clic rapide", missionOpen.fast_attempts ?? 0)}</Badge>
          <Text as="span">{missionOpen.fast.map((entry) => `${entry.student} (${entry.count})`).join(", ")}</Text>
        </Flex> : null}
      </Stack>}
    </SidePanel>
  </Stack>
}
