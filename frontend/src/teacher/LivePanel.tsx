import { ActivityTime } from "../shared/ActivityTime"
import { locale, msg, t, tn } from "../i18n"
import { useCallback, useEffect, useState } from "react"
import { Badge, Box, Button, Flex, Grid, Heading, Input, NativeSelect, Stack, Table, Text, Textarea } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { Icon, Panel } from "../student/ui"

/** Sprint 2, part H (ADR-0023): the teacher's live view, built to fit 1366×768. */

export const LIVE_REFRESH_MS = 5000
const MAX_MESSAGE = 280

export type LiveCell = { chapter_id: number; state: "closed" | "not_started" | "in_progress" | "done"; done: number; total: number; for_student: boolean
  lessons_read?: number; lesson_count?: number; bonus_done?: number; bonus_total?: number }
export type LiveStudent = { id: number; name: string; online: boolean; seen_at: string | null; online_since?: string | null; mission: string | null; help: boolean; fast_attempts: number; cells: LiveCell[] }
export type LiveBlock = { chapter_id: number; position: number; title: string; module: string; open: boolean; mission_count: number; bonus_only?: boolean }
export type Live = { generated_at: string; assignment_id: number; online_count: number; student_count: number; help_pending?: number; blocks: LiveBlock[]; students: LiveStudent[] }
type Sent = { message_id: string; text: string; created_at: string; whole_class: boolean; read_count: number; recipients: { student: string; read_at: string | null }[] }
export type PlanItem = { chapter_id: number; title: string; minutes: number; at: string; opened?: boolean }
export type Plan = { enabled: boolean; paused: boolean; end_at: string | null; items: PlanItem[]; proposal: PlanItem[]; server_time: string }
type Settings = Record<string, boolean | number>

export function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })
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
  done: { bg: "green.subtle", fg: "green.fg", label: msg("terminé") },
  in_progress: { bg: "saffron.subtle", fg: "saffron.fg", label: msg("en cours") },
  not_started: { bg: "app.surface", fg: "app.muted", label: msg("pas commencé") },
  closed: { bg: "app.sunken", fg: "app.muted", label: msg("fermé") },
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
      setNotice(action === "unlock" ? t("« {{title}} » ouvert pour {{name}}.", { title: block.title, name: student.name }) : t("Ouverture de « {{title}} » retirée pour {{name}}.", { title: block.title, name: student.name }))
      await refresh()
    } catch { setNotice(t("Action impossible. Réessayez.")) } finally { setBusy(false) }
  }

  if (!data) return <Panel><Text role="status" color="app.muted">{stale ? t("Connexion perdue. Nouvel essai dans quelques secondes…") : t("Chargement du suivi en direct…")}</Text></Panel>
  const blocks = visibleBlocks(data, all)
  const index = new Map(data.blocks.map((block, i) => [block.chapter_id, i]))

  // The message form comes first, the live grid takes the whole width under it.
  return <Stack gap="4">
    <MessageComposer assignmentId={assignmentId} students={data.students} />
    <Panel as="section" aria-labelledby="live-title" p="0" overflow="hidden">
      <Flex p="4" pb="2" gap="3" align="center" wrap="wrap" justify="space-between">
        <Stack gap="0">
          <Heading as="h3" size="md" id="live-title">{t("Suivi en direct")}</Heading>
          <Text fontSize="sm" color="app.muted">{data.online_count} {t("en ligne sur")}{" "}{data.student_count} {t("· mis à jour toutes les 5 s")}{stale ? " · connexion perdue" : ""}</Text>
        </Stack>
        <Button size="xs" variant="ghost" onClick={() => setAll((value) => !value)}>{all ? t("Blocs utiles seulement") : t("Tous les blocs ({{length}})", { length: data.blocks.length })}</Button>
      </Flex>
      {notice && <Text px="4" role="status" fontSize="sm" color="brand.fg" fontWeight="medium">{notice}</Text>}
      <Box overflowX="auto" tabIndex={0} role="region" aria-label={t("Grille étudiants par blocs (défilement horizontal)")}>
        <Table.Root size="sm" variant="line" aria-label={t("Étudiants par blocs")} css={{ "& td, & th": { paddingBlock: "6px" } }}>
          <Table.Header><Table.Row bg="app.sunken">
            <Table.ColumnHeader scope="col" position="sticky" left="0" bg="app.sunken" zIndex="1" minW="44">{t("Étudiant")}</Table.ColumnHeader>
            {blocks.map((block) => <Table.ColumnHeader key={block.chapter_id} scope="col" textAlign="center" minW="16" maxW="28" title={`${block.module} · ${block.title}`}>
              <Text fontSize="xs" lineClamp={2} fontWeight={block.open ? "bold" : "normal"}>{block.position}. {block.title}</Text>
              {block.bonus_only && <Badge colorPalette="saffron" variant="outline" whiteSpace="normal" size="xs">{t("Bonus facultatifs")}</Badge>}
              {!block.open && <Text fontSize="2xs" color="app.muted">{t("fermé")}</Text>}
            </Table.ColumnHeader>)}
          </Table.Row></Table.Header>
          <Table.Body>{data.students.map((student) => <Table.Row key={student.id} bg={student.help ? "saffron.subtle" : undefined}>
            <Table.Cell position="sticky" left="0" bg={student.help ? "saffron.subtle" : "app.surface"} zIndex="1">
              <Flex gap="2" align="center" wrap="wrap">
                <Box w="2.5" h="2.5" rounded="full" flexShrink={0} bg={student.online ? "green.solid" : "app.border"} aria-hidden="true" />
                <Text fontWeight="semibold" fontSize="sm">{student.name}</Text>
                <Text fontSize="xs" color={student.online ? "green.fg" : "app.muted"}>{student.online ? t("en ligne") : student.seen_at ? <ActivityTime value={student.seen_at} /> : t("pas encore vu")}</Text>
                {student.help && <Badge colorPalette="saffron" variant="solid" rounded="full" size="sm">{t("Aide")}</Badge>}
                {student.fast_attempts > 0 && <Badge colorPalette="saffron" variant="outline" rounded="full" size="sm">{t("Clics rapides :")}{" "}{student.fast_attempts}</Badge>}
              </Flex>
              {student.mission && <Text fontSize="xs" color="app.muted" lineClamp={1}>{t("Sur :")}{" "}{student.mission}</Text>}
            </Table.Cell>
            {blocks.map((block) => {
              const cell = student.cells[index.get(block.chapter_id)!]
              const style = CELL[cell.state]
              const bonusLabel = t("{{done}} / {{total}} bonus réussis", { done: cell.bonus_done ?? 0, total: cell.bonus_total ?? 0 })
              const text = block.bonus_only ? bonusLabel : cell.state === "done" ? t("fait") : cell.state === "in_progress" ? `${cell.done}/${cell.total}` : cell.state === "not_started" ? "—" : ""
              const label = `${student.name}, ${block.title} : ${block.bonus_only ? bonusLabel : t(style.label)}${!block.bonus_only && cell.state === "in_progress" ? t(" ({{done}} sur {{total}})", { done: cell.done, total: cell.total }) : ""}${cell.lesson_count ? t(", leçons lues {{p0}}/{{lesson_count}}", { p0: cell.lessons_read ?? 0, lesson_count: cell.lesson_count }) : ""}${cell.for_student ? t(", ouvert pour lui") : ""}`
              const interactive = cell.state === "closed" || cell.for_student
              return <Table.Cell key={block.chapter_id} textAlign="center" p="1">
                {interactive
                  ? <Button size="xs" w="full" minW="14" variant={cell.for_student ? "outline" : "ghost"} colorPalette="brand" bg={style.bg} disabled={busy}
                    aria-label={cell.for_student ? t("{{label}}. Retirer l’ouverture pour {{name}}", { label, name: student.name }) : t("{{label}}. Ouvrir ce bloc pour {{name}}", { label, name: student.name })}
                    title={cell.for_student ? t("Retirer l’ouverture individuelle") : t("Ouvrir pour {{name}}", { name: student.name })} onClick={() => void toggle(student, block, cell)}>
                    {cell.for_student ? <Flex gap="1" align="center" fontSize="xs">{text || "—"}<Icon name="user" size={12} /></Flex> : <Icon name="lock" size={12} />}
                  </Button>
                  : <Flex role="img" aria-label={label} title={label} justify="center" align="center" gap="1" minH="7" rounded="md" bg={style.bg} color={style.fg} fontSize="xs" fontWeight="semibold">
                    {!block.bonus_only && cell.state === "done" && <Icon name="check" size={12} />}{text}
                  </Flex>}
              </Table.Cell>
            })}
          </Table.Row>)}</Table.Body>
        </Table.Root>
      </Box>
      <Flex px="4" py="2.5" gap="4" wrap="wrap" fontSize="xs" color="app.muted" borderTopWidth="1px" borderColor="app.border">
        <Text><Text as="span" color="green.fg" fontWeight="semibold">{t("fait")}</Text> {t(": bloc terminé")}</Text>
        <Text><Text as="span" color="saffron.fg" fontWeight="semibold">2/3</Text> {t(": en cours")}</Text>
        <Text>{t("— : pas commencé")}</Text>
        <Flex gap="1" align="center"><Icon name="lock" size={12} />{t("fermé : cliquer pour l’ouvrir à cet étudiant")}</Flex>
        <Flex gap="1" align="center"><Icon name="user" size={12} />{t("ouvert pour lui seul")}</Flex>
      </Flex>
    </Panel>
  </Stack>
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
      setStatus(tn("Message envoyé à {{count}} étudiant.", result.recipients))
      setText("")
      await load()
    } catch (reason) {
      setStatus(reason instanceof ApiError && reason.status === 429 ? t("Trop de messages : attendez une minute.") : t("Envoi impossible. Réessayez."))
    } finally { setBusy(false) }
  }

  return <Panel as="section" aria-labelledby="message-title" p="4">
    <Stack gap="3">
      <Heading as="h3" size="sm" id="message-title">{t("Message aux étudiants")}</Heading>
      {/* One row from tablet width up: recipients, text, send; stacked on a phone. */}
      <Grid templateColumns={{ base: "1fr", md: "14rem minmax(0, 1fr) auto" }} gap="3" alignItems="start">
        <NativeSelect.Root size="sm">
          <NativeSelect.Field aria-label={t("Destinataires")} value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="all">{t("Toute la classe")}</option>
            {students.map((student) => <option key={student.id} value={String(student.id)}>{student.name}</option>)}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Box>
          <Textarea aria-label={t("Texte du message")} value={text} maxLength={MAX_MESSAGE} rows={2} placeholder={t("Ex. : pause de 5 minutes, reprise à 10 h 35.")}
            onChange={(event) => setText(event.target.value)} />
          <Text fontSize="xs" color={text.length >= MAX_MESSAGE ? "saffron.fg" : "app.muted"} textAlign="end">{text.length} / {MAX_MESSAGE}</Text>
        </Box>
        <Button size="sm" colorPalette="brand" disabled={!text.trim()} loading={busy} onClick={() => void send()}><Icon name="send" size={14} />{t("Envoyer")}</Button>
      </Grid>
      {status && <Text role="status" fontSize="sm" color="brand.fg">{status}</Text>}
      {sent.length > 0 && <Grid as="ul" templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" }} gap="2"
        listStyleType="none" p="0" m="0" aria-label={t("Messages envoyés")} maxH="15rem" overflowY="auto">
        {sent.slice(0, 6).map((item) => <Box as="li" key={item.message_id} p="2" rounded="md" bg="app.sunken" fontSize="sm">
          <Text>{item.text}</Text>
          <Text fontSize="xs" color="app.muted">{hhmm(item.created_at)} · {item.whole_class ? t("classe") : item.recipients.map((r) => r.student).join(", ")} {t("· lu par")}{" "}{item.read_count}/{item.recipients.length}</Text>
          <details><summary style={{ cursor: "pointer", fontSize: "0.75rem" }}>{t("Accusés de lecture")}</summary>
            <Stack gap="0" mt="1">{item.recipients.map((r) => <Text key={r.student} fontSize="xs" color={r.read_at ? "green.fg" : "app.muted"}>{r.student} : {r.read_at ? t("lu à {{p0}}", { p0: hhmm(r.read_at) }) : t("non lu")}</Text>)}</Stack>
          </details>
        </Box>)}
      </Grid>}
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
      setStatus(reason instanceof ApiError && reason.status === 422 ? t("Heure de fin invalide : choisissez une heure plus tard aujourd’hui.")
        : reason instanceof ApiError && reason.status === 409 ? t("Rien à planifier : tous les blocs sont déjà ouverts.") : t("Action impossible. Réessayez."))
    } finally { setBusy(false) }
  }

  const next = plan?.items.find((item) => !item.opened)
  return <Panel as="section" aria-labelledby="auto-title">
    <Stack gap="3">
      <Flex gap="2" align="center" wrap="wrap" justify="space-between">
        <Heading as="h3" size="md" id="auto-title">{t("Ouverture automatique des blocs")}</Heading>
        <Badge colorPalette={plan?.enabled ? (plan.paused ? "saffron" : "green") : "gray"} variant="subtle" rounded="full">
          {plan?.enabled ? (plan.paused ? t("En pause") : t("Active")) : t("Désactivée")}
        </Badge>
      </Flex>
      <Text fontSize="sm" color="app.muted">{t("Facultatif. Le temps restant jusqu’à l’heure de fin est réparti selon la durée estimée de chaque bloc. Rien ne se ferme automatiquement ; vous gardez la main.")}</Text>
      {!plan?.enabled && <Stack gap="3">
        <Flex gap="2" align="end" wrap="wrap">
          <Box><Text as="label" fontSize="sm" fontWeight="medium" display="block" mb="1">{t("Heure de fin")}<Input display="block" mt="1" type="time" size="sm" value={end} onChange={(event) => { setEnd(event.target.value); setPreview(null) }} w="8rem" />
          </Text></Box>
          <Button size="sm" variant="outline" colorPalette="brand" loading={busy} onClick={() => void act("/preview", { end_at: todayAt(end) })}>{t("Voir le planning")}</Button>
        </Flex>
        {preview && <Stack gap="2">
          <PlanList items={preview} />
          <Button size="sm" colorPalette="brand" alignSelf="start" loading={busy} onClick={() => void act("/activate", { end_at: todayAt(end) }, t("Ouverture automatique activée."))}>{t("Activer ce planning")}</Button>
        </Stack>}
      </Stack>}
      {plan?.enabled && <Stack gap="3">
        <Text fontSize="sm">{t("Fin prévue à")}{" "}<Text as="span" fontWeight="semibold">{plan.end_at ? hhmm(plan.end_at) : "?"}</Text>{next ? t(" · prochain : « {{title}} » à {{p1}}", { title: next.title, p1: hhmm(next.at) }) : t(" · tous les blocs prévus sont ouverts")}.</Text>
        <PlanList items={plan.items} />
        {plan.proposal.length > 0 && <Box role="status" p="3" rounded="lg" bg="saffron.subtle" borderWidth="1px" borderColor="saffron.solid">
          <Text fontWeight="semibold" fontSize="sm">{t("Le planning ne correspond plus à l’avancement. Proposition :")}</Text>
          <PlanList items={plan.proposal} />
          <Button mt="2" size="xs" colorPalette="saffron" loading={busy} onClick={() => void act("/recalculate", undefined, t("Planning recalculé."))}>{t("Recalculer")}</Button>
        </Box>}
        <Flex gap="2" wrap="wrap">
          {plan.paused
            ? <Button size="xs" colorPalette="brand" loading={busy} onClick={() => void act("/resume", undefined, t("Reprise : les horaires restants sont décalés de la durée de la pause."))}>{t("Reprendre")}</Button>
            : <Button size="xs" variant="outline" loading={busy} onClick={() => void act("/pause", undefined, t("En pause : aucun bloc ne s’ouvrira."))}>{t("Mettre en pause")}</Button>}
          <Button size="xs" variant="outline" loading={busy} onClick={() => void act("/shift", { minutes: -5 }, t("Planning avancé de 5 min."))}>{t("−5 min")}</Button>
          <Button size="xs" variant="outline" loading={busy} onClick={() => void act("/shift", { minutes: 5 }, t("Planning retardé de 5 min."))}>{t("+5 min")}</Button>
          <Button size="xs" variant="outline" loading={busy} onClick={() => void act("/shift", { minutes: 15 }, t("Planning retardé de 15 min."))}>{t("+15 min")}</Button>
          <Button size="xs" variant="outline" colorPalette="brand" loading={busy} disabled={!next} onClick={() => void act("/advance", undefined, next ? t("« {{title}} » ouvert maintenant.", { title: next.title }) : "")}>{t("Ouvrir le suivant maintenant")}</Button>
          <Button size="xs" variant="ghost" colorPalette="red" loading={busy} onClick={() => void act("/stop", undefined, t("Ouverture automatique arrêtée. Les blocs ouverts le restent."))}>{t("Arrêter")}</Button>
        </Flex>
      </Stack>}
      {status && <Text role="status" fontSize="sm" color="brand.fg">{status}</Text>}
    </Stack>
  </Panel>
}

function PlanList({ items }: { items: PlanItem[] }) {
  return <Stack as="ol" listStyleType="none" p="0" m="0" gap="1" aria-label={t("Planning d’ouverture")}>
    {items.map((item) => <Flex as="li" key={`${item.chapter_id}-${item.at}`} gap="3" fontSize="sm" align="center">
      <Text fontWeight="semibold" minW="12" css={{ fontVariantNumeric: "tabular-nums" }}>{hhmm(item.at)}</Text>
      <Text flex="1">{item.title}</Text>
      <Text color="app.muted" fontSize="xs">~{item.minutes} {t("min")}</Text>
      {item.opened && <Badge colorPalette="green" variant="subtle" rounded="full" size="sm"><Icon name="check" size={10} />{t("ouvert")}</Badge>}
    </Flex>)}
  </Stack>
}

const SETTING_LABELS: [string, string][] = [
  ["help", msg("Demande d’aide")], ["blocked", msg("Étudiant bloqué (3 essais sans réussite)")], ["block_done", msg("Bloc terminé par une part de la classe")],
  ["auto_soon", msg("Ouverture automatique dans 2 min")], ["auto_done", msg("Ouverture automatique faite")], ["disconnect", msg("Étudiant déconnecté")],
  ["student_block_open", msg("Aux étudiants : bloc ouvert")], ["student_help_handled", msg("Aux étudiants : demande d’aide traitée")],
]

/** Per-type switches for the notification centre (and the automatic messages to students). */
export function NotificationSettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState("")
  useEffect(() => { void api<Settings>("/teacher/notification-settings").then(setSettings).catch(() => setStatus(t("Réglages indisponibles."))) }, [])
  async function save() {
    try { setSettings(await api<Settings>("/teacher/notification-settings", "PUT", settings)); setStatus(t("Réglages enregistrés.")) }
    catch { setStatus(t("Enregistrement impossible.")) }
  }
  if (!settings) return <Text fontSize="sm" color="app.muted">{status || t("Chargement…")}</Text>
  return <Stack gap="2">
    {SETTING_LABELS.map(([key, label]) => <label key={key} style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.875rem" }}>
      <input type="checkbox" checked={Boolean(settings[key])} onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })} />{t(label)}
    </label>)}
    <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.875rem" }}>
      {t("Seuil « bloc terminé » (%)")}<Input type="number" size="xs" w="5rem" min={10} max={100} value={Number(settings.block_done_percent)} onChange={(event) => setSettings({ ...settings, block_done_percent: Number(event.target.value) })} />
    </label>
    <Button size="xs" colorPalette="brand" alignSelf="start" onClick={() => void save()}>{t("Enregistrer les réglages")}</Button>
    {status && <Text role="status" fontSize="xs" color="brand.fg">{status}</Text>}
  </Stack>
}
