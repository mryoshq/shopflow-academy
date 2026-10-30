import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Box, Button, Flex, Heading, Stack, Switch, Table, Tabs, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import type { Role } from "../studioTypes"
import "./leaderboard.css"

type ClassEntry = { assignment_id: number; label: string }
type Options = { enabled: boolean; top_three: boolean; hide_open_block: boolean }
export type LeaderboardRow = { rank: number; display_name: string; is_self: boolean; core_points: number; bonus_points: number; completed_blocks: number; today_blocks: number }
type DailyRow = Pick<LeaderboardRow, "rank" | "display_name" | "is_self" | "today_blocks">
export type Board = { settings: Options; hidden: boolean; display_name: string; day: string; timezone: string; rows: LeaderboardRow[]; daily_rows: DailyRow[] }
const REFRESH_MS = 5_000
const number = new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 2 })

/** An original, code-drawn podium: thematic surfaces, no external asset. */
function Podium() {
  return <Box color="brand.fg" w={{ base: "20", md: "44" }} flexShrink={0} className="leaderboard-podium" aria-hidden="true">
    <svg viewBox="0 0 240 105" focusable="false">
      <path d="M12 99V57h68V17h80v54h68v28Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M80 57v42m80-28v28M101 12h38M120 3v9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <g fill="currentColor" fontSize="20" fontFamily="inherit" textAnchor="middle"><text x="46" y="86">2</text><text x="120" y="57">1</text><text x="194" y="94">3</text></g>
    </svg>
  </Box>
}

function Rank({ value }: { value: number }) {
  const medal = ["🥇", "🥈", "🥉"][value - 1]
  return <><span aria-hidden="true">{medal ? `${medal} ` : ""}</span><span>Rang {value}</span></>
}

function RankingTable({ rows, daily }: { rows: (LeaderboardRow | DailyRow)[]; daily?: boolean }) {
  if (!rows.length) return <Text color="app.muted">Aucun étudiant actif dans cette classe pour le moment.</Text>
  return <Box overflowX="auto" tabIndex={0} role="region" aria-label={daily ? "Tableau de progression du jour, défilement horizontal" : "Tableau du leaderboard, défilement horizontal"}>
    <Table.Root size="md" bg="app.surface" color="app.ink">
      <Table.Caption>{daily ? "Blocs terminés aujourd’hui" : "Leaderboard de la classe"}</Table.Caption>
      <Table.Header><Table.Row bg="app.sunken">
        <Table.ColumnHeader scope="col">Rang</Table.ColumnHeader><Table.ColumnHeader scope="col">Nom affiché</Table.ColumnHeader>
        {daily ? <Table.ColumnHeader scope="col" textAlign="end">Blocs aujourd’hui</Table.ColumnHeader> : <>
          <Table.ColumnHeader scope="col" textAlign="end">Points principaux</Table.ColumnHeader>
          <Table.ColumnHeader scope="col" textAlign="end">Points bonus</Table.ColumnHeader>
        </>}
      </Table.Row></Table.Header>
      <Table.Body>{rows.map((row, index) => <Table.Row key={index} bg={row.is_self ? "brand.subtle" : "app.surface"} color="app.ink" fontWeight={row.is_self ? "semibold" : "normal"}>
        <Table.Cell whiteSpace="nowrap"><Rank value={row.rank} /></Table.Cell>
        <Table.Cell minW="36" overflowWrap="anywhere">{row.display_name}{row.is_self && <Text as="span" color="brand.fg"> · Vous</Text>}</Table.Cell>
        {daily ? <Table.Cell textAlign="end">{row.today_blocks}</Table.Cell> : "core_points" in row && <>
          <Table.Cell textAlign="end">{number.format(row.core_points)}</Table.Cell><Table.Cell textAlign="end">{number.format(row.bonus_points)}</Table.Cell>
        </>}
      </Table.Row>)}</Table.Body>
    </Table.Root>
  </Box>
}

function Setting({ label, checked, disabled, change }: { label: string; checked: boolean; disabled: boolean; change: (value: boolean) => void }) {
  return <Switch.Root checked={checked} disabled={disabled} onCheckedChange={({ checked }) => change(checked)} colorPalette="brand">
    <Switch.HiddenInput /><Switch.Control><Switch.Thumb /></Switch.Control><Switch.Label>{label}</Switch.Label>
  </Switch.Root>
}

export function LeaderboardPage({ role, assignmentId }: { role: Role; assignmentId: number }) {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const path = `/${role}/classes/${assignmentId}/leaderboard`

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    setBoard(null)
    const refresh = async () => {
      try {
        const next = await api<Board>(path)
        if (active) {
          setBoard(next); setError("")
        }
      } catch (cause) {
        if (active) {
          // Remove stale personal/class data immediately, including on disable or loss of enrollment.
          setBoard(null)
          setError(cause instanceof ApiError && cause.status === 404 ? "Le leaderboard n’est pas disponible pour cette classe." : "Actualisation impossible. Le leaderboard est masqué jusqu’au retour de la connexion.")
        }
      } finally { if (active) timer = setTimeout(refresh, REFRESH_MS) }
    }
    void refresh()
    return () => { active = false; clearTimeout(timer) }
  }, [path])

  async function updateOptions(key: keyof Options, value: boolean) {
    if (!board) return
    setBusy(true); setNotice("")
    try {
      await api(`${path}/settings`, "PUT", { ...board.settings, [key]: value })
      setBoard(await api<Board>(path))
      setNotice("Réglage enregistré.")
    } catch { setBoard(null); setError("Enregistrement impossible. Le leaderboard sera rechargé automatiquement.") }
    finally { setBusy(false) }
  }

  return <Stack gap="6" className="leaderboard-page">
    <Flex justify="space-between" align="start" gap="4">
      <Stack gap="2" minW="0" flex="1"><Heading as="h1" size="3xl"><span aria-hidden="true">🏆 </span>Leaderboard</Heading>
        <Text color="app.muted">Avancez ensemble, à votre rythme. Les bonus restent séparés des points principaux.</Text></Stack><Podium />
    </Flex>
    <Text fontSize="sm" color="app.muted">Actualisation automatique toutes les 5 secondes. Les ex æquo partagent le même rang. Aucun rang n’entre dans la note ou l’export.</Text>
    {error && <Text role="alert">{error}</Text>}
    {!board && !error && <Text role="status">Chargement du leaderboard…</Text>}
    {board && <>
      {role === "teacher" && <Box as="section" aria-label="Réglages du leaderboard" p="5" bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="card">
        <Stack gap="4"><Heading as="h2" size="lg">Visibilité pour la classe</Heading>
          <Setting label="Activer le leaderboard" checked={board.settings.enabled} disabled={busy} change={value => void updateOptions("enabled", value)} />
          <Setting label="Afficher le top 3 et sa propre position" checked={board.settings.top_three} disabled={busy} change={value => void updateOptions("top_three", value)} />
          <Setting label="Masquer pendant un bloc ouvert" checked={board.settings.hide_open_block} disabled={busy} change={value => void updateOptions("hide_open_block", value)} />
          <Text fontSize="sm" color="app.muted">Ces réglages s’appliquent aux deux onglets. Les ex æquo dans les trois premiers rangs sont tous affichés.</Text>
        </Stack>
      </Box>}
      {!board.hidden && <Text display={{ base: "block", md: "none" }} fontSize="sm" color="app.muted">Faites défiler le tableau pour voir toutes les colonnes.</Text>}
      {board.hidden ? <Text role="status">{board.settings.enabled ? "Le leaderboard est masqué pendant un bloc ouvert. Profitez de ce temps pour explorer et essayer." : "Le leaderboard est désactivé. Vous pouvez l’activer quand la classe est prête."}</Text> : <Tabs.Root defaultValue="ranking" colorPalette="brand">
        <Tabs.List overflowX="auto"><Tabs.Trigger value="ranking">Leaderboard général</Tabs.Trigger><Tabs.Trigger value="daily">Progression du jour</Tabs.Trigger></Tabs.List>
        <Tabs.Content value="ranking"><RankingTable rows={board.rows} /></Tabs.Content>
        <Tabs.Content value="daily"><Stack gap="3"><Text color="app.muted">Journée du {new Intl.DateTimeFormat("fr-MA", { dateStyle: "long", timeZone: board.timezone }).format(new Date(`${board.day}T12:00:00Z`))} · heure du Maroc. Un bloc compte quand toutes ses activités principales sont terminées, leçons comprises.</Text><RankingTable rows={board.daily_rows} daily /></Stack></Tabs.Content>
      </Tabs.Root>}
    </>}
    {notice && <Text role="status">{notice}</Text>}
  </Stack>
}

/** Keeps H's existing student/teacher home intact; only adds one navigation entry. */
export function LeaderboardNavigation({ role, children }: { role: Role; children: ReactNode }) {
  const [classes, setClasses] = useState<ClassEntry[]>([])
  const fromHash = () => {
    const match = /^#\/classement\/(\d+)$/.exec(window.location.hash)
    return match ? Number(match[1]) : null
  }
  const [selected, setSelected] = useState<number | null>(fromHash)
  useEffect(() => {
    const changed = () => setSelected(fromHash())
    window.addEventListener("hashchange", changed)
    return () => window.removeEventListener("hashchange", changed)
  }, [])
  const navigate = (id: number | null) => { window.location.hash = id === null ? "" : `/classement/${id}`; setSelected(id) }
  const load = useCallback(() => api<ClassEntry[]>(`/${role}/leaderboard/classes`), [role])
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try { const next = await load(); if (active) setClasses(next) }
      catch { if (active) setClasses([]) }
      finally { if (active) timer = setTimeout(refresh, REFRESH_MS) }
    }
    void refresh()
    return () => { active = false; clearTimeout(timer) }
  }, [load])
  return <Stack gap="6" minW="0" maxW="full">
    {(classes.length > 0 || selected !== null) && <Flex as="nav" aria-label="Navigation de l’espace" gap="2" wrap="wrap" minW="0" maxW="full">
      <Button variant={selected === null ? "solid" : "outline"} colorPalette="brand" aria-current={selected === null ? "page" : undefined} onClick={() => navigate(null)}>Mon espace</Button>
      {classes.map(item => <Button key={item.assignment_id} colorPalette="brand" variant={selected === item.assignment_id ? "solid" : "outline"} minW="0" maxW="full" height="auto" py="2" whiteSpace="normal" overflowWrap="anywhere" textAlign="start" aria-current={selected === item.assignment_id ? "page" : undefined} onClick={() => navigate(item.assignment_id)}>{classes.length === 1 ? "Leaderboard" : `Leaderboard · ${item.label}`}</Button>)}
    </Flex>}
    <Box minW="0" maxW="full">{selected === null ? children : <LeaderboardPage key={`${role}-${selected}`} role={role} assignmentId={selected} />}</Box>
  </Stack>
}
