import { useCallback, useEffect, useState } from "react"
import { Badge, Box, Button, Flex, Grid, Heading, Input, NativeSelect, Stack, Table, Text, Textarea } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { Icon, Panel } from "../student/ui"

/** Sprint 2, part H (ADR-0023): the teacher's live view, built to fit 1366×768. */

export const LIVE_REFRESH_MS = 5000
const MAX_MESSAGE = 280

export type LiveCell = { chapter_id: number; state: "closed" | "not_started" | "in_progress" | "done"; done: number; total: number; for_student: boolean
  lessons_read?: number; lesson_count?: number }
export type LiveStudent = { id: number; name: string; online: boolean; seen_at: string | null; mission: string | null; help: boolean; fast_attempts: number; cells: LiveCell[] }
export type LiveBlock = { chapter_id: number; position: number; title: string; module: string; open: boolean; mission_count: number }
export type Live = { generated_at: string; assignment_id: number; online_count: number; student_count: number; blocks: LiveBlock[]; students: LiveStudent[] }
type Sent = { message_id: string; text: string; created_at: string; whole_class: boolean; read_count: number; recipients: { student: string; read_at: string | null }[] }
export type PlanItem = { chapter_id: number; title: string; minutes: number; at: string; opened?: boolean }
export type Plan = { enabled: boolean; paused: boolean; end_at: string | null; items: PlanItem[]; proposal: PlanItem[]; server_time: string }
type Settings = Record<string, boolean | number>

export function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

/** Columns shown by default: open blocks, blocks opened for one student, then the next two closed ones. */
export function visibleBlocks(data: Live, all: boolean): LiveBlock[] {
  if (all) return data.blocks
  const personal = new Set(data.students.flatMap((s) => s.cells.filter((c) => c.for_student).map((c) => c.chapter_id)))
  let closedShown = 0
  return data.blocks.filter((block) => {
    if (block.open || personal.has(block.chapter_id)) return true
    closedShown += 1
    return closedShown <= 2
  })
}

const CELL: Record<LiveCell["state"], { bg: string; fg: string; label: string }> = {
  done: { bg: "green.subtle", fg: "green.fg", label: "terminé" },
  in_progress: { bg: "saffron.subtle", fg: "saffron.fg", label: "en cours" },
  not_started: { bg: "app.surface", fg: "app.muted", label: "pas commencé" },
  closed: { bg: "app.sunken", fg: "app.muted", label: "fermé" },
}

export function LivePanel({ assignmentId }: { assignmentId: number }) {
  const [data, setData] = useState<Live | null>(null)
  const [stale, setStale] = useState(false)
  const [all, setAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")

  const refresh = useCallback(async () => {
    try { setData(await api<Live>(`/teacher/classes/${assignmentId}/live`)); setStale(false) }
    catch (reason) { if (!(reason instanceof ApiError && reason.status === 401)) setStale(true) }
  }, [assignmentId])
  useEffect(() => {
    void refresh()
    const timer = setInterval(() => { void refresh() }, LIVE_REFRESH_MS)
    return () => clearInterval(timer)
  }, [refresh])

  async function toggle(student: LiveStudent, block: LiveBlock, cell: LiveCell) {
    const action = cell.for_student ? "relock" : "unlock"
    setBusy(true)
    setNotice("")
    try {
      await api(`/teacher/classes/${assignmentId}/blocks/${block.chapter_id}/students/${student.id}/${action}`, "POST")
      setNotice(action === "unlock" ? `« ${block.title} » ouvert pour ${student.name}.` : `Ouverture de « ${block.title} » retirée pour ${student.name}.`)
      await refresh()
    } catch { setNotice("Action impossible. Réessayez.") } finally { setBusy(false) }
  }

  if (!data) return <Panel><Text role="status" color="app.muted">{stale ? "Connexion perdue. Nouvel essai dans quelques secondes…" : "Chargement du suivi en direct…"}</Text></Panel>
  const blocks = visibleBlocks(data, all)
  const index = new Map(data.blocks.map((block, i) => [block.chapter_id, i]))

  return <Grid templateColumns={{ base: "1fr", xl: "minmax(0, 1fr) 21rem" }} gap="4" alignItems="start">
    <Panel as="section" aria-labelledby="live-title" p="0" overflow="hidden">
      <Flex p="4" pb="2" gap="3" align="center" wrap="wrap" justify="space-between">
        <Stack gap="0">
          <Heading as="h3" size="md" id="live-title">Suivi en direct</Heading>
          <Text fontSize="sm" color="app.muted">{data.online_count} en ligne sur {data.student_count} · mis à jour toutes les 5 s{stale ? " · connexion perdue" : ""}</Text>
        </Stack>
        <Button size="xs" variant="ghost" onClick={() => setAll((value) => !value)}>{all ? "Blocs utiles seulement" : `Tous les blocs (${data.blocks.length})`}</Button>
      </Flex>
      {notice && <Text px="4" role="status" fontSize="sm" color="brand.fg" fontWeight="medium">{notice}</Text>}
      <Box overflowX="auto" tabIndex={0} role="region" aria-label="Grille étudiants par blocs (défilement horizontal)">
        <Table.Root size="sm" variant="line" aria-label="Étudiants par blocs" css={{ "& td, & th": { paddingBlock: "6px" } }}>
          <Table.Header><Table.Row bg="app.sunken">
            <Table.ColumnHeader scope="col" position="sticky" left="0" bg="app.sunken" zIndex="1" minW="44">Étudiant</Table.ColumnHeader>
            {blocks.map((block) => <Table.ColumnHeader key={block.chapter_id} scope="col" textAlign="center" minW="16" maxW="28" title={`${block.module} · ${block.title}`}>
              <Text fontSize="xs" lineClamp={2} fontWeight={block.open ? "bold" : "normal"}>{block.position}. {block.title}</Text>
              {!block.open && <Text fontSize="2xs" color="app.muted">fermé</Text>}
            </Table.ColumnHeader>)}
          </Table.Row></Table.Header>
          <Table.Body>{data.students.map((student) => <Table.Row key={student.id} bg={student.help ? "saffron.subtle" : undefined}>
            <Table.Cell position="sticky" left="0" bg={student.help ? "saffron.subtle" : "app.surface"} zIndex="1">
              <Flex gap="2" align="center" wrap="wrap">
                <Box w="2.5" h="2.5" rounded="full" flexShrink={0} bg={student.online ? "green.solid" : "app.border"} aria-hidden="true" />
                <Text fontWeight="semibold" fontSize="sm">{student.name}</Text>
                <Text fontSize="xs" color={student.online ? "green.fg" : "app.muted"}>{student.online ? "en ligne" : student.seen_at ? `vu à ${hhmm(student.seen_at)}` : "pas encore vu"}</Text>
                {student.help && <Badge colorPalette="saffron" variant="solid" rounded="full" size="sm">Aide</Badge>}
                {student.fast_attempts > 0 && <Badge colorPalette="saffron" variant="outline" rounded="full" size="sm">Clics rapides : {student.fast_attempts}</Badge>}
              </Flex>
              {student.mission && <Text fontSize="xs" color="app.muted" lineClamp={1}>Sur : {student.mission}</Text>}
            </Table.Cell>
            {blocks.map((block) => {
              const cell = student.cells[index.get(block.chapter_id)!]
              const style = CELL[cell.state]
              const text = cell.state === "done" ? "fait" : cell.state === "in_progress" ? `${cell.done}/${cell.total}` : cell.state === "not_started" ? "—" : ""
              const label = `${student.name}, ${block.title} : ${style.label}${cell.state === "in_progress" ? ` (${cell.done} sur ${cell.total})` : ""}${cell.lesson_count ? `, leçons lues ${cell.lessons_read ?? 0}/${cell.lesson_count}` : ""}${cell.for_student ? ", ouvert pour lui" : ""}`
              const interactive = cell.state === "closed" || cell.for_student
              return <Table.Cell key={block.chapter_id} textAlign="center" p="1">
                {interactive
                  ? <Button size="xs" w="full" minW="14" variant={cell.for_student ? "outline" : "ghost"} colorPalette="brand" bg={style.bg} disabled={busy}
                    aria-label={cell.for_student ? `${label}. Retirer l’ouverture pour ${student.name}` : `${label}. Ouvrir ce bloc pour ${student.name}`}
                    title={cell.for_student ? "Retirer l’ouverture individuelle" : `Ouvrir pour ${student.name}`} onClick={() => void toggle(student, block, cell)}>
                    {cell.for_student ? <Flex gap="1" align="center" fontSize="xs">{text || "—"}<Icon name="user" size={12} /></Flex> : <Icon name="lock" size={12} />}
                  </Button>
                  : <Flex role="img" aria-label={label} title={label} justify="center" align="center" gap="1" minH="7" rounded="md" bg={style.bg} color={style.fg} fontSize="xs" fontWeight="semibold">
                    {cell.state === "done" && <Icon name="check" size={12} />}{text}
                  </Flex>}
              </Table.Cell>
            })}
          </Table.Row>)}</Table.Body>
        </Table.Root>
      </Box>
      <Flex px="4" py="2.5" gap="4" wrap="wrap" fontSize="xs" color="app.muted" borderTopWidth="1px" borderColor="app.border">
        <Text><Text as="span" color="green.fg" fontWeight="semibold">fait</Text> : bloc terminé</Text>
        <Text><Text as="span" color="saffron.fg" fontWeight="semibold">2/3</Text> : en cours</Text>
        <Text>— : pas commencé</Text>
        <Flex gap="1" align="center"><Icon name="lock" size={12} />fermé : cliquer pour l’ouvrir à cet étudiant</Flex>
        <Flex gap="1" align="center"><Icon name="user" size={12} />ouvert pour lui seul</Flex>
      </Flex>
    </Panel>
    <MessageComposer assignmentId={assignmentId} students={data.students} />
  </Grid>
}

/** Message to the class or to one student (280 characters), with read receipts. */
function MessageComposer({ assignmentId, students }: { assignmentId: number; students: LiveStudent[] }) {
  const [text, setText] = useState("")
  const [target, setTarget] = useState("all")
  const [sent, setSent] = useState<Sent[]>([])
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try { setSent(await api<Sent[]>(`/teacher/classes/${assignmentId}/messages`)) } catch { /* next refresh */ }
  }, [assignmentId])
  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load() }, 10000)
    return () => clearInterval(timer)
  }, [load])

  async function send() {
    setBusy(true)
    setStatus("")
    try {
      const result = await api<{ recipients: number }>(`/teacher/classes/${assignmentId}/messages`, "POST",
        { text, student_ids: target === "all" ? [] : [Number(target)] })
      setStatus(`Message envoyé à ${result.recipients} étudiant${result.recipients > 1 ? "s" : ""}.`)
      setText("")
      await load()
    } catch (reason) {
      setStatus(reason instanceof ApiError && reason.status === 429 ? "Trop de messages : attendez une minute." : "Envoi impossible. Réessayez.")
    } finally { setBusy(false) }
  }

  return <Panel as="section" aria-labelledby="message-title" p="4">
    <Stack gap="3">
      <Heading as="h3" size="sm" id="message-title">Message aux étudiants</Heading>
      <NativeSelect.Root size="sm">
        <NativeSelect.Field aria-label="Destinataires" value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="all">Toute la classe</option>
          {students.map((student) => <option key={student.id} value={String(student.id)}>{student.name}</option>)}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
      <Box>
        <Textarea aria-label="Texte du message" value={text} maxLength={MAX_MESSAGE} rows={3} placeholder="Ex. : pause de 5 minutes, reprise à 10 h 35."
          onChange={(event) => setText(event.target.value)} />
        <Text fontSize="xs" color={text.length >= MAX_MESSAGE ? "saffron.fg" : "app.muted"} textAlign="end">{text.length} / {MAX_MESSAGE}</Text>
      </Box>
      <Button size="sm" colorPalette="brand" disabled={!text.trim()} loading={busy} onClick={() => void send()}><Icon name="send" size={14} />Envoyer</Button>
      {status && <Text role="status" fontSize="sm" color="brand.fg">{status}</Text>}
      {sent.length > 0 && <Stack gap="2" as="ul" listStyleType="none" p="0" m="0" aria-label="Messages envoyés" maxH="15rem" overflowY="auto">
        {sent.slice(0, 6).map((item) => <Box as="li" key={item.message_id} p="2" rounded="md" bg="app.sunken" fontSize="sm">
          <Text>{item.text}</Text>
          <Text fontSize="xs" color="app.muted">{hhmm(item.created_at)} · {item.whole_class ? "classe" : item.recipients.map((r) => r.student).join(", ")} · lu par {item.read_count}/{item.recipients.length}</Text>
          <details><summary style={{ cursor: "pointer", fontSize: "0.75rem" }}>Accusés de lecture</summary>
            <Stack gap="0" mt="1">{item.recipients.map((r) => <Text key={r.student} fontSize="xs" color={r.read_at ? "green.fg" : "app.muted"}>{r.student} : {r.read_at ? `lu à ${hhmm(r.read_at)}` : "non lu"}</Text>)}</Stack>
          </details>
        </Box>)}
      </Stack>}
    </Stack>
  </Panel>
}

function todayAt(time: string): string {
  const [h, m] = time.split(":").map(Number)
  const date = new Date()
  date.setHours(h, m, 0, 0)
  return date.toISOString()
}

/** Optional automatic opening: weighted plan shown before activation, then controls. Never closes a block. */
export function AutoPlanPanel({ assignmentId }: { assignmentId: number }) {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [end, setEnd] = useState("17:00")
  const [preview, setPreview] = useState<PlanItem[] | null>(null)
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)
  const base = `/teacher/classes/${assignmentId}/auto`
  const load = useCallback(async () => {
    try { setPlan(await api<Plan>(base)) } catch { /* next refresh */ }
  }, [base])
  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load() }, 10000)
    return () => clearInterval(timer)
  }, [load])

  async function act(path: string, body?: unknown, done?: string) {
    setBusy(true)
    setStatus("")
    try {
      const result = await api<Plan | { items: PlanItem[] }>(`${base}${path}`, "POST", body)
      if (path === "/preview") setPreview(result.items)
      else { setPlan(result as Plan); setPreview(null) }
      if (done) setStatus(done)
    } catch (reason) {
      setStatus(reason instanceof ApiError && reason.status === 422 ? "Heure de fin invalide : choisissez une heure plus tard aujourd’hui."
        : reason instanceof ApiError && reason.status === 409 ? "Rien à planifier : tous les blocs sont déjà ouverts." : "Action impossible. Réessayez.")
    } finally { setBusy(false) }
  }

  const next = plan?.items.find((item) => !item.opened)
  return <Panel as="section" aria-labelledby="auto-title">
    <Stack gap="3">
      <Flex gap="2" align="center" wrap="wrap" justify="space-between">
        <Heading as="h3" size="md" id="auto-title">Ouverture automatique des blocs</Heading>
        <Badge colorPalette={plan?.enabled ? (plan.paused ? "saffron" : "green") : "gray"} variant="subtle" rounded="full">
          {plan?.enabled ? (plan.paused ? "En pause" : "Active") : "Désactivée"}
        </Badge>
      </Flex>
      <Text fontSize="sm" color="app.muted">Facultatif. Le temps restant jusqu’à l’heure de fin est réparti selon la durée estimée de chaque bloc. Rien ne se ferme automatiquement ; vous gardez la main.</Text>
      {!plan?.enabled && <Stack gap="3">
        <Flex gap="2" align="end" wrap="wrap">
          <Box><Text as="label" fontSize="sm" fontWeight="medium" display="block" mb="1">Heure de fin
            <Input mt="1" type="time" size="sm" value={end} onChange={(event) => { setEnd(event.target.value); setPreview(null) }} w="8rem" />
          </Text></Box>
          <Button size="sm" variant="outline" colorPalette="brand" loading={busy} onClick={() => void act("/preview", { end_at: todayAt(end) })}>Voir le planning</Button>
        </Flex>
        {preview && <Stack gap="2">
          <PlanList items={preview} />
          <Button size="sm" colorPalette="brand" alignSelf="start" loading={busy} onClick={() => void act("/activate", { end_at: todayAt(end) }, "Ouverture automatique activée.")}>Activer ce planning</Button>
        </Stack>}
      </Stack>}
      {plan?.enabled && <Stack gap="3">
        <Text fontSize="sm">Fin prévue à <Text as="span" fontWeight="semibold">{plan.end_at ? hhmm(plan.end_at) : "?"}</Text>{next ? ` · prochain : « ${next.title} » à ${hhmm(next.at)}` : " · tous les blocs prévus sont ouverts"}.</Text>
        <PlanList items={plan.items} />
        {plan.proposal.length > 0 && <Box role="status" p="3" rounded="lg" bg="saffron.subtle" borderWidth="1px" borderColor="saffron.solid">
          <Text fontWeight="semibold" fontSize="sm">Le planning ne correspond plus à l’avancement. Proposition :</Text>
          <PlanList items={plan.proposal} />
          <Button mt="2" size="xs" colorPalette="saffron" loading={busy} onClick={() => void act("/recalculate", undefined, "Planning recalculé.")}>Recalculer</Button>
        </Box>}
        <Flex gap="2" wrap="wrap">
          {plan.paused
            ? <Button size="xs" colorPalette="brand" loading={busy} onClick={() => void act("/resume", undefined, "Reprise : les horaires restants sont décalés de la durée de la pause.")}>Reprendre</Button>
            : <Button size="xs" variant="outline" loading={busy} onClick={() => void act("/pause", undefined, "En pause : aucun bloc ne s’ouvrira.")}>Mettre en pause</Button>}
          <Button size="xs" variant="outline" loading={busy} onClick={() => void act("/shift", { minutes: -5 }, "Planning avancé de 5 min.")}>−5 min</Button>
          <Button size="xs" variant="outline" loading={busy} onClick={() => void act("/shift", { minutes: 5 }, "Planning retardé de 5 min.")}>+5 min</Button>
          <Button size="xs" variant="outline" loading={busy} onClick={() => void act("/shift", { minutes: 15 }, "Planning retardé de 15 min.")}>+15 min</Button>
          <Button size="xs" variant="outline" colorPalette="brand" loading={busy} disabled={!next} onClick={() => void act("/advance", undefined, next ? `« ${next.title} » ouvert maintenant.` : "")}>Ouvrir le suivant maintenant</Button>
          <Button size="xs" variant="ghost" colorPalette="red" loading={busy} onClick={() => void act("/stop", undefined, "Ouverture automatique arrêtée. Les blocs ouverts le restent.")}>Arrêter</Button>
        </Flex>
      </Stack>}
      {status && <Text role="status" fontSize="sm" color="brand.fg">{status}</Text>}
    </Stack>
  </Panel>
}

function PlanList({ items }: { items: PlanItem[] }) {
  return <Stack as="ol" listStyleType="none" p="0" m="0" gap="1" aria-label="Planning d’ouverture">
    {items.map((item) => <Flex as="li" key={`${item.chapter_id}-${item.at}`} gap="3" fontSize="sm" align="center">
      <Text fontWeight="semibold" minW="12" css={{ fontVariantNumeric: "tabular-nums" }}>{hhmm(item.at)}</Text>
      <Text flex="1">{item.title}</Text>
      <Text color="app.muted" fontSize="xs">~{item.minutes} min</Text>
      {item.opened && <Badge colorPalette="green" variant="subtle" rounded="full" size="sm"><Icon name="check" size={10} />ouvert</Badge>}
    </Flex>)}
  </Stack>
}

const SETTING_LABELS: [string, string][] = [
  ["help", "Demande d’aide"], ["blocked", "Étudiant bloqué (3 essais sans réussite)"], ["block_done", "Bloc terminé par une part de la classe"],
  ["auto_soon", "Ouverture automatique dans 2 min"], ["auto_done", "Ouverture automatique faite"], ["disconnect", "Étudiant déconnecté"],
  ["student_block_open", "Aux étudiants : bloc ouvert"], ["student_help_handled", "Aux étudiants : demande d’aide traitée"],
]

/** Per-type switches for the notification centre (and the automatic messages to students). */
export function NotificationSettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState("")
  useEffect(() => { void api<Settings>("/teacher/notification-settings").then(setSettings).catch(() => setStatus("Réglages indisponibles.")) }, [])
  async function save() {
    try { setSettings(await api<Settings>("/teacher/notification-settings", "PUT", settings)); setStatus("Réglages enregistrés.") }
    catch { setStatus("Enregistrement impossible.") }
  }
  if (!settings) return <Text fontSize="sm" color="app.muted">{status || "Chargement…"}</Text>
  return <Stack gap="2">
    {SETTING_LABELS.map(([key, label]) => <label key={key} style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.875rem" }}>
      <input type="checkbox" checked={Boolean(settings[key])} onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })} />{label}
    </label>)}
    <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.875rem" }}>
      Seuil « bloc terminé » (%)
      <Input type="number" size="xs" w="5rem" min={10} max={100} value={Number(settings.block_done_percent)} onChange={(event) => setSettings({ ...settings, block_done_percent: Number(event.target.value) })} />
    </label>
    <Button size="xs" colorPalette="brand" alignSelf="start" onClick={() => void save()}>Enregistrer les réglages</Button>
    {status && <Text role="status" fontSize="xs" color="brand.fg">{status}</Text>}
  </Stack>
}
