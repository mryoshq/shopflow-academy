import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Badge, Box, Button, Flex, Grid, Heading, Link, Stack, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { Panel } from "../student/ui"
import { minutesSince, type Timeline } from "./ClassTimeline"
import type { Live } from "./LivePanel"

type OverviewRow = { completed: number; total: number; core_points: number; core_possible: number }
type Overview = { students: OverviewRow[] }

const REFRESH_MS = 10000

/** Mean progress of the class on graded missions, in % (null without students). */
export function meanProgress(rows: OverviewRow[]): number | null {
  const counted = rows.filter((row) => row.total > 0)
  if (!counted.length) return null
  return Math.round(counted.reduce((sum, row) => sum + row.completed / row.total, 0) / counted.length * 100)
}

/** Students stuck on at least one mission (several attempts without success), without duplicates. */
export function stuckStudents(timeline: Timeline): string[] {
  return [...new Set(timeline.missions.flatMap((mission) => mission.stuck))].sort((a, b) => a.localeCompare(b, "fr"))
}

function Card({ title, value, detail, href, linkLabel, tone, children }: {
  title: string; value: ReactNode; detail?: ReactNode; href: string; linkLabel: string; tone?: "alert"; children?: ReactNode
}) {
  return <Panel as="section" aria-label={title} display="flex" flexDirection="column" gap="2" minH="40"
    borderColor={tone === "alert" ? "saffron.400" : "app.border"} borderTopWidth="3px" borderTopColor={tone === "alert" ? "saffron.solid" : "brand.solid"}>
    <Text fontSize="sm" fontWeight="semibold" color="app.muted" textTransform="uppercase" letterSpacing="0.06em">{title}</Text>
    <Box fontSize="3xl" fontWeight="bold" lineHeight="1.1" css={{ fontVariantNumeric: "tabular-nums" }}>{value}</Box>
    {detail && <Box fontSize="sm" color="app.muted">{detail}</Box>}
    {children}
    <Link href={href} mt="auto" color="brand.fg" fontWeight="semibold" fontSize="sm" alignSelf="start" minH="11" display="inline-flex" alignItems="center">{linkLabel} →</Link>
  </Panel>
}

/** ADR-0031 « Aujourd’hui »: the day on one screen; every card leads to its detailed view. */
export function Today({ username, assignmentId }: { username: string; assignmentId: number | null }) {
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [live, setLive] = useState<Live | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    if (!assignmentId) return
    const base = `/teacher/classes/${assignmentId}`
    const [t, l, o] = await Promise.allSettled([api<Timeline>(`${base}/timeline`), api<Live>(`${base}/live`), api<Overview>(`${base}/overview`)])
    if (t.status === "fulfilled") setTimeline(t.value)
    if (l.status === "fulfilled") setLive(l.value)
    if (o.status === "fulfilled") setOverview(o.value)
    setNow(Date.now())
  }, [assignmentId])
  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  async function openNext() {
    if (!assignmentId) return
    setBusy(true)
    setNotice("")
    try {
      const result = await api<{ title?: string }>(`/teacher/classes/${assignmentId}/blocks/open-next`, "POST")
      setNotice(`Bloc « ${result.title} » ouvert pour toute la classe.`)
      await refresh()
    } catch (reason) {
      setNotice(reason instanceof ApiError && reason.status === 409 ? "Tous les blocs sont déjà ouverts." : "Ouverture impossible. Réessayez.")
    } finally {
      setBusy(false)
    }
  }

  const date = new Date(now).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
  const header = <Stack gap="1">
    <Heading as="h1" size={{ base: "2xl", md: "3xl" }} letterSpacing="-0.01em">Bonjour, {username}</Heading>
    <Text color="app.muted" fontSize="lg">{date.charAt(0).toUpperCase() + date.slice(1)} · l’essentiel de votre journée.</Text>
  </Stack>
  if (!assignmentId) return <Stack gap="6">{header}<Panel><Stack gap="2">
    <Text fontWeight="semibold">Votre cours n’est pas encore publié</Text>
    <Text color="app.muted">Dans « Mon cours », onglet Publication, cliquez sur « Publier pour la classe ». Les blocs arrivent fermés : vous les ouvrirez ici, un par un.</Text>
    <Link href="#/cours/publication" color="brand.fg" fontWeight="semibold">Aller à la publication →</Link>
  </Stack></Panel></Stack>

  const open = timeline?.blocks.filter((block) => block.open && block.opened_at) ?? []
  const current = open.reduce<(typeof open)[number] | null>((latest, block) => !latest || block.opened_at! > latest.opened_at! ? block : latest, null)
  const next = timeline?.blocks.find((block) => block.chapter_id === timeline.next_block_id) ?? null
  const elapsed = current ? minutesSince(current.opened_at, now) : 0
  const stuck = timeline ? stuckStudents(timeline) : []
  const progress = overview ? meanProgress(overview.students) : null
  const help = timeline?.help ?? []

  return <Stack gap="6">
    {header}
    {notice && <Text role="status" color="brand.fg" fontWeight="medium">{notice}</Text>}
    <Grid gap="4" templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" }}>
      <Card title="Bloc ouvert" href="#/classe/frise" linkLabel="Voir la frise"
        value={current ? current.title : timeline ? "Aucun" : "…"}
        detail={current ? <>ouvert depuis {elapsed} min{timeline && elapsed >= timeline.block_minutes ? <Badge ml="2" colorPalette="saffron" variant="subtle">repère de {timeline.block_minutes} min dépassé</Badge> : null}</> : "Aucun bloc ouvert pour le moment."}>
        <Button colorPalette="brand" alignSelf="start" h="auto" minH="11" py="2" whiteSpace="normal" textAlign="start" loading={busy} disabled={!next} onClick={() => void openNext()}>
          {next ? `Ouvrir le bloc suivant : ${next.title}` : "Tous les blocs sont ouverts"}</Button>
      </Card>
      <Card title="Étudiants en ligne" href="#/classe/etudiants" linkLabel="Voir les étudiants"
        value={live ? <>{live.online_count} <Text as="span" fontSize="lg" color="app.muted">/ {live.student_count}</Text></> : "…"}
        detail="Présence mise à jour toutes les 30 s environ." />
      <Card title="Demandes d’aide en attente" href="#/classe/aide" linkLabel="Traiter les demandes" tone={help.length ? "alert" : undefined}
        value={timeline ? help.length : "…"}
        detail={help.length ? help.slice(0, 3).map((item) => `${item.student} · ${item.mission}`).join(" ; ") : "Aucune demande pour le moment."} />
      <Card title="Étudiants bloqués" href="#/classe/difficultes" linkLabel="Voir les difficultés" tone={stuck.length ? "alert" : undefined}
        value={timeline ? stuck.length : "…"}
        detail={stuck.length ? stuck.slice(0, 4).join(", ") + (stuck.length > 4 ? "…" : "") : "Personne n’est bloqué."} />
      <Card title="Progression moyenne" href="#/resultats" linkLabel="Voir les résultats"
        value={progress === null ? (overview ? "—" : "…") : `${progress} %`}
        detail="Missions notées réussies, moyenne de la classe." >
        {progress !== null && <Box h="2" bg="app.sunken" rounded="full" overflow="hidden" role="img" aria-label={`Progression moyenne : ${progress} %`}>
          <Box h="full" bg="brand.solid" w={`${progress}%`} /></Box>}
      </Card>
      <Card title="Blocs ouverts" href="#/classe/frise" linkLabel="Gérer les blocs"
        value={timeline ? <>{open.length} <Text as="span" fontSize="lg" color="app.muted">/ {timeline.blocks.length}</Text></> : "…"}
        detail={<Flex gap="1.5" wrap="wrap" mt="1">{timeline?.blocks.slice(0, 12).map((block) => <Box key={block.chapter_id} w="3" h="3" rounded="sm" title={block.title}
          bg={block.open ? "brand.solid" : "app.border"} aria-hidden="true" />)}</Flex>} />
    </Grid>
  </Stack>
}
