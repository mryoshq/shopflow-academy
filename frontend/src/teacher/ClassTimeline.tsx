import { useCallback, useEffect, useState } from "react"
import { Badge, Box, Button, Flex, Heading, Stack, Table, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { Icon, Panel } from "../student/ui"

export const TIMELINE_REFRESH_MS = 5000

export type TimelineBlock = {
  chapter_id: number; position: number; module: string; title: string; open: boolean; opened_at: string | null
  mission_count: number; bonus_count: number; duration_minutes: number; completed_students: number; help_pending: number
}
export type HelpItem = { id: number; student: string; mission_version_id: number; mission: string; block: string; message: string; created_at: string }
export type MissionStat = { mission_version_id: number; title: string; block: string; bonus: boolean; completed: number; attempts: number; hints: number; stuck: string[] }
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
  return minutes < 1 ? "à l’instant" : `depuis ${minutes} min`
}

/**
 * Teacher only: the day in blocks, "Ouvrir le bloc suivant", a 15-minute landmark (never
 * an automatic close, never shown to students), pending help requests and difficulties.
 */
export function ClassTimeline({ assignmentId }: { assignmentId: number }) {
  const [data, setData] = useState<Timeline | null>(null)
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
      setNow(Date.now())
      await refresh()
    } catch (reason) {
      setNotice(reason instanceof ApiError ? (reason.status === 409 ? "Tous les blocs sont déjà ouverts." : `Action impossible : ${reason.message}`) : "Connexion interrompue. Réessayez.")
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <Panel><Text role="status" color="app.muted">{stale ? "Connexion perdue. Nouvel essai dans quelques secondes…" : "Chargement de la journée…"}</Text></Panel>

  const openBlocks = data.blocks.filter((block) => block.open && block.opened_at)
  const current = openBlocks.reduce<TimelineBlock | null>((latest, block) => !latest || (block.opened_at! > latest.opened_at!) ? block : latest, null)
  const next = data.blocks.find((block) => block.chapter_id === data.next_block_id) ?? null
  const elapsed = current ? minutesSince(current.opened_at, now) : 0
  const over = elapsed >= data.block_minutes

  return <Stack gap="5">
    <Panel as="section" aria-labelledby="timeline-title">
      <Stack gap="4">
        <Flex gap="3" justify="space-between" align={{ base: "start", md: "center" }} direction={{ base: "column", md: "row" }}>
          <Stack gap="1">
            <Heading as="h3" size="md" id="timeline-title">Déroulé de la journée</Heading>
            <Text fontSize="sm" color="app.muted">{openBlocks.length} bloc{openBlocks.length > 1 ? "s" : ""} ouvert{openBlocks.length > 1 ? "s" : ""} sur {data.blocks.length}. Les blocs ouverts restent accessibles.</Text>
          </Stack>
          <Button colorPalette="brand" size="lg" loading={busy} disabled={!next}
            onClick={() => void act(`/teacher/classes/${assignmentId}/blocks/open-next`, (result) => `Bloc « ${result.title} » ouvert pour toute la classe.`)}>
            {next ? `Ouvrir le bloc suivant : ${next.title}` : "Tous les blocs sont ouverts"}
          </Button>
        </Flex>
        {current && <Box p="3" rounded="lg" bg={over ? "saffron.subtle" : "brand.subtle"} aria-label="Repère horaire (visible par vous seul)">
          <Flex gap="2" align="center" wrap="wrap" mb="2">
            <Icon name="clock" size={16} />
            <Text fontWeight="semibold">« {current.title} » ouvert depuis {elapsed} min</Text>
            <Text fontSize="sm" color="app.muted">Repère : {data.block_minutes} min{over ? " — dépassé, rien ne se ferme automatiquement" : ""}. Visible par vous seul.</Text>
          </Flex>
          <Box h="2" bg="app.surface" rounded="full" overflow="hidden" role="img" aria-label={`${elapsed} minutes sur un repère de ${data.block_minutes}`}>
            <Box h="full" bg={over ? "saffron.solid" : "brand.solid"} w={`${Math.min(100, (elapsed / data.block_minutes) * 100)}%`} />
          </Box>
        </Box>}
        {notice && <Text role="status" color="brand.fg" fontWeight="medium">{notice}</Text>}
        {stale && <Text fontSize="sm" color="red.fg">Connexion perdue : données possiblement anciennes.</Text>}
        <Stack as="ol" gap="2" listStyleType="none" p="0" m="0" aria-label="Blocs de la journée">
          {data.blocks.map((block, index) => {
            const newModule = index === 0 || data.blocks[index - 1].module !== block.module
            return <Box as="li" key={block.chapter_id}>
              {newModule && <Text fontSize="xs" fontWeight="bold" color="brand.fg" textTransform="uppercase" letterSpacing="0.08em" mt={index ? "3" : "0"} mb="1.5">{block.module}</Text>}
              <Flex gap="3" align="center" wrap="wrap" p="3" borderWidth="1px" borderColor={block.help_pending ? "saffron.400" : "app.border"} borderLeftWidth="4px"
                borderLeftColor={block.open ? "brand.solid" : "app.border"} rounded="lg" bg={block.open ? "app.surface" : "app.sunken"}>
                <Text fontWeight="bold" color="app.muted" minW="6" css={{ fontVariantNumeric: "tabular-nums" }}>{block.position}</Text>
                <Stack gap="0" flex="1" minW="48">
                  <Text fontWeight="semibold">{block.title}</Text>
                  <Text fontSize="sm" color="app.muted">{block.mission_count} mission{block.mission_count > 1 ? "s" : ""}{block.bonus_count ? ` + ${block.bonus_count} bonus` : ""} · environ {block.duration_minutes} min</Text>
                </Stack>
                <Badge colorPalette={block.open ? "green" : "gray"} variant="subtle" rounded="full">{block.open ? "Ouvert" : "Fermé"}</Badge>
                <Text fontSize="sm" css={{ fontVariantNumeric: "tabular-nums" }}>{block.completed_students} / {data.student_count} terminé</Text>
                {block.help_pending > 0 && <Badge colorPalette="saffron" variant="solid" rounded="full">{block.help_pending} demande{block.help_pending > 1 ? "s" : ""} d’aide</Badge>}
                {block.open
                  ? <Button size="xs" variant="outline" loading={busy} aria-label={`Fermer le bloc ${block.title}`}
                    onClick={() => void act(`/teacher/classes/${assignmentId}/blocks/${block.chapter_id}/close`, () => `Bloc « ${block.title} » fermé.`)}>Fermer</Button>
                  : <Button size="xs" colorPalette="brand" variant="outline" loading={busy} aria-label={`Ouvrir le bloc ${block.title}`}
                    onClick={() => void act(`/teacher/classes/${assignmentId}/blocks/${block.chapter_id}/open`, () => `Bloc « ${block.title} » ouvert pour toute la classe.`)}>Ouvrir</Button>}
              </Flex>
            </Box>
          })}
        </Stack>
        {data.blocks.length === 0 && <Text color="app.muted">Ce cours n’a pas encore de bloc.</Text>}
      </Stack>
    </Panel>

    <Panel as="section" aria-labelledby="help-title" borderColor={data.help.length ? "saffron.400" : "app.border"}>
      <Stack gap="3">
        <Heading as="h3" size="md" id="help-title">Demandes d’aide en attente ({data.help.length})</Heading>
        {data.help.length === 0 ? <Text color="app.muted" fontSize="sm">Aucune demande pour le moment.</Text>
          : <Stack as="ul" gap="2" listStyleType="none" p="0" m="0">{data.help.map((item) => <Flex as="li" key={item.id} gap="3" align="center" wrap="wrap" p="3" bg="saffron.subtle" rounded="lg">
            <Stack gap="0" flex="1" minW="56">
              <Text fontWeight="semibold">{item.student} · {item.mission}</Text>
              <Text fontSize="sm" color="app.muted">{item.block} · {waited(item.created_at, now)}</Text>
              {item.message && <Text fontSize="sm" mt="1">« {item.message} »</Text>}
            </Stack>
            <Button size="sm" colorPalette="brand" loading={busy}
              onClick={() => void act(`/teacher/help/${item.id}/handle`, () => `Demande de ${item.student} marquée comme traitée.`)}>Marquer comme traitée</Button>
          </Flex>)}</Stack>}
      </Stack>
    </Panel>

    <Panel as="section" aria-labelledby="stats-title" p="0" overflow="hidden">
      <Box p={{ base: "5", md: "6" }} pb="3"><Heading as="h3" size="md" id="stats-title">Missions : réussites et difficultés</Heading>
        <Text fontSize="sm" color="app.muted">« Bloqués » : plusieurs essais sans réussite.</Text></Box>
      <Box overflowX="auto">
        <Table.Root size="sm" variant="line" aria-label="Statistiques par mission">
          <Table.Header><Table.Row bg="app.sunken">{["Mission", "Bloc", "Réussites", "Essais", "Indices", "Bloqués"].map((label) => <Table.ColumnHeader key={label} scope="col">{label}</Table.ColumnHeader>)}</Table.Row></Table.Header>
          <Table.Body>{data.missions.map((item) => <Table.Row key={item.mission_version_id} bg={item.stuck.length ? "saffron.subtle" : undefined}>
            <Table.Cell fontWeight="medium">{item.title}{item.bonus ? " (bonus)" : ""}</Table.Cell>
            <Table.Cell color="app.muted">{item.block}</Table.Cell>
            <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{item.completed} / {data.student_count}</Table.Cell>
            <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{item.attempts}</Table.Cell>
            <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{item.hints}</Table.Cell>
            <Table.Cell>{item.stuck.length ? item.stuck.join(", ") : "—"}</Table.Cell>
          </Table.Row>)}</Table.Body>
        </Table.Root>
      </Box>
    </Panel>
  </Stack>
}
