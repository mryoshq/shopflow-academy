import { useCallback, useEffect, useState } from "react"
import { Badge, Box, Button, Flex, Grid, Heading, Input, Stack, Table, Tabs, Text, VisuallyHidden } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { Podium } from "./Podium"
import { ErrorState, Icon, LoadingState, Panel, formatPoints } from "./ui"

export const LEADERBOARD_REFRESH_MS = 5000

export type BoardRow = { rank: number; today_rank: number; name: string; points: number; bonus: number; blocks_done: number; blocks_today: number; me: boolean }
export type Board = {
  title: string; hidden: boolean; generated_at: string; my_name: string
  settings: { enabled: boolean; top3_only: boolean; hide_during_block: boolean }
  main: BoardRow[]; today: BoardRow[]; best_progress: string[]
}

/** The only place of the application with emojis (owner's decision, ADR-0026), always doubled by text. */
const MEDALS: Record<number, { emoji: string; label: string }> = {
  1: { emoji: "🥇", label: "1re place" }, 2: { emoji: "🥈", label: "2e place" }, 3: { emoji: "🥉", label: "3e place" },
}

export function RankCell({ rank }: { rank: number }) {
  const medal = MEDALS[rank]
  if (!medal) return <Text as="span" fontWeight="semibold" css={{ fontVariantNumeric: "tabular-nums" }}>{rank}<VisuallyHidden>e place</VisuallyHidden></Text>
  return <Flex as="span" gap="1.5" align="center"><span aria-hidden="true" style={{ fontSize: "1.35em", lineHeight: 1 }}>{medal.emoji}</span>
    <Text as="span" fontWeight="bold" aria-hidden="true">{rank}</Text><VisuallyHidden>{medal.label}</VisuallyHidden></Flex>
}

function NameForm({ current, onSaved }: { current: string; onSaved: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(current)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    setError("")
    try {
      const result = await api<{ public_name: string }>("/student/profile", "PUT", { public_name: value })
      onSaved(result.public_name)
      setEditing(false)
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status === 422
        ? "Nom refusé : 24 caractères au plus (lettres, chiffres, espaces, - ' . _), pas d’adresse e-mail."
        : "Connexion interrompue. Réessayez.")
    } finally {
      setBusy(false)
    }
  }
  if (!editing) return <Flex gap="2" align="center" wrap="wrap" fontSize="sm">
    <Text>Votre nom dans le classement : <Text as="strong" fontWeight="semibold">{current || "« Participant », par défaut"}</Text></Text>
    <Button size="xs" variant="outline" colorPalette="brand" onClick={() => { setValue(current); setEditing(true) }}>Modifier</Button>
  </Flex>
  return <Stack gap="2" as="form" onSubmit={(event: React.FormEvent) => { event.preventDefault(); void save() }}>
    <Flex gap="2" wrap="wrap" align="center">
      <Input size="sm" maxW="64" maxLength={24} aria-label="Nom affiché (prénom ou pseudonyme)" placeholder="Prénom ou pseudonyme" value={value} onChange={(event) => setValue(event.target.value)} />
      <Button size="sm" colorPalette="brand" type="submit" loading={busy}>Enregistrer</Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Annuler</Button>
    </Flex>
    <Text fontSize="xs" color="app.muted">Prénom ou pseudonyme, 24 caractères au plus. Laissez vide pour rester « Participant ».</Text>
    {error && <Text role="alert" fontSize="sm" color="red.fg">{error}</Text>}
  </Stack>
}

function BoardTable({ rows, today }: { rows: BoardRow[]; today: boolean }) {
  if (rows.length === 0) return <Text color="app.muted">Personne dans le classement pour le moment.</Text>
  return <Box overflowX="auto" tabIndex={0} role="region" aria-label={today ? "Progression du jour" : "Classement"} borderWidth="1px" borderColor="app.border" rounded="lg">
    <Table.Root size="sm" variant="line">
      <Table.Header><Table.Row bg="app.sunken">
        <Table.ColumnHeader scope="col">Rang</Table.ColumnHeader>
        <Table.ColumnHeader scope="col">Nom</Table.ColumnHeader>
        {today ? <Table.ColumnHeader scope="col" textAlign="end">Blocs terminés aujourd’hui</Table.ColumnHeader>
          : <><Table.ColumnHeader scope="col" textAlign="end">Points</Table.ColumnHeader><Table.ColumnHeader scope="col" textAlign="end">Bonus</Table.ColumnHeader></>}
        <Table.ColumnHeader scope="col" textAlign="end">Blocs terminés</Table.ColumnHeader>
      </Table.Row></Table.Header>
      <Table.Body>{rows.map((row, index) => <Table.Row key={`${row.name}-${index}`} bg={row.me ? "brand.subtle" : undefined} aria-current={row.me ? "true" : undefined}
        borderLeftWidth={row.me ? "4px" : undefined} borderLeftColor={row.me ? "brand.solid" : undefined}>
        <Table.Cell><RankCell rank={today ? row.today_rank : row.rank} /></Table.Cell>
        <Table.Cell fontWeight={row.me ? "bold" : "medium"}><Flex gap="2" align="center" wrap="wrap">{row.name}{row.me && <Badge colorPalette="brand" variant="solid" rounded="full">Vous</Badge>}</Flex></Table.Cell>
        {today ? <Table.Cell textAlign="end" fontWeight="semibold" css={{ fontVariantNumeric: "tabular-nums" }}>{row.blocks_today}</Table.Cell>
          : <><Table.Cell textAlign="end" fontWeight="semibold" css={{ fontVariantNumeric: "tabular-nums" }}>{formatPoints(row.points)}</Table.Cell>
            <Table.Cell textAlign="end" color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }}>{row.bonus ? `+${formatPoints(row.bonus)}` : "—"}</Table.Cell></>}
        <Table.Cell textAlign="end" css={{ fontVariantNumeric: "tabular-nums" }}>{row.blocks_done}</Table.Cell>
      </Table.Row>)}</Table.Body>
    </Table.Root>
  </Box>
}

/** Class leaderboard, when the teacher turned it on (ADR-0026). Refreshed every 5 seconds. */
export function Leaderboard({ classId, navigate }: { classId: number; navigate: (path: string) => void }) {
  const [data, setData] = useState<Board | null>(null)
  const [error, setError] = useState<"off" | "network" | null>(null)
  const load = useCallback(async () => {
    try {
      setData(await api<Board>(`/student/leaderboard/${classId}`))
      setError(null)
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status === 404 ? "off" : "network")
    }
  }, [classId])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const timer = window.setInterval(() => { void load() }, LEADERBOARD_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const back = <Button variant="ghost" size="sm" alignSelf="start" px="2" onClick={() => navigate("/")}><Icon name="arrow-left" size={16} />Tableau de bord</Button>
  if (error === "off") return <Stack gap="4">{back}<Panel><Text>Le classement n’est pas activé pour votre classe.</Text></Panel></Stack>
  if (!data) return error ? <ErrorState message="Classement momentanément indisponible." onRetry={() => void load()} /> : <LoadingState label="Chargement du classement…" />
  const me = data.main.find((row) => row.me)

  return <Stack gap="5">
    {back}
    <Panel as="header" p={{ base: "5", md: "6" }}>
      <Grid templateColumns={{ base: "1fr", md: "1fr auto" }} gap="4" alignItems="center">
        <Stack gap="2">
          <Heading as="h1" size={{ base: "2xl", md: "3xl" }}><span aria-hidden="true">🏆 </span>Classement de la classe</Heading>
          <Text color="app.muted">{data.title} · mis à jour toutes les 5 secondes. Chaque bloc terminé compte, à votre rythme.</Text>
          {me && !data.hidden && <Text fontWeight="semibold" color="brand.fg">Vous êtes {me.rank === 1 ? "1re ou 1er" : `${me.rank}e`} avec {formatPoints(me.points)} points.</Text>}
          <NameForm current={data.my_name} onSaved={(name) => { setData({ ...data, my_name: name }); void load() }} />
        </Stack>
        <Box justifySelf={{ base: "center", md: "end" }}><Podium /></Box>
      </Grid>
    </Panel>

    {data.hidden ? <Panel role="status"><Flex gap="2" align="center"><Icon name="clock" />
      <Text>Le classement est masqué pendant le bloc en cours. Il réapparaît une quinzaine de minutes après l’ouverture du bloc.</Text></Flex></Panel>
      : <Tabs.Root defaultValue="general" variant="line">
        <Tabs.List><Tabs.Trigger value="general">Classement</Tabs.Trigger><Tabs.Trigger value="today">Progression du jour</Tabs.Trigger></Tabs.List>
        <Tabs.Content value="general" pt="4"><Stack gap="3">
          {data.settings.top3_only && <Text fontSize="sm" color="app.muted">Votre enseignant affiche seulement les trois premières places et votre position.</Text>}
          <BoardTable rows={data.main} today={false} />
          <Text fontSize="xs" color="app.muted">Points du parcours principal ; les points bonus sont comptés à part. Ex aequo : même rang.</Text>
        </Stack></Tabs.Content>
        <Tabs.Content value="today" pt="4"><Stack gap="3">
          {data.best_progress.length > 0 && <Flex gap="2" align="center" p="3" rounded="lg" bg="saffron.subtle" borderWidth="1px" borderColor="saffron.solid" role="status">
            <Box color="saffron.fg"><Icon name="star" /></Box>
            <Text><Text as="span" fontWeight="semibold">La meilleure progression du jour : </Text>{data.best_progress.join(", ")}</Text>
          </Flex>}
          <BoardTable rows={data.today} today />
          <Text fontSize="xs" color="app.muted">Classé par blocs terminés aujourd’hui : l’effort du jour compte autant que le total.</Text>
        </Stack></Tabs.Content>
      </Tabs.Root>}
  </Stack>
}
