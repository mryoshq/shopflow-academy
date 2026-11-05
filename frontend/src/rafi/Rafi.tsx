import { useEffect, useRef, useState } from "react"
import { Badge, Box, Button, CloseButton, Flex, Link, Stack, Text } from "@chakra-ui/react"
import { api } from "../api"
import { t, tn } from "../i18n"
import { serverText } from "../i18n/server"
import { KIND_LABELS, NOTIFICATION_POLL_MS, useNotificationFeed, type Note } from "../live/notifications"
import { blip, chime, listenForUnlock, useRafiSound } from "./sound"
import { RafiAvatar } from "./RafiAvatar"

/** « Que faire maintenant ? » computed by the server (ADR-0050). */
export type NextStep =
  | { kind: "mission" | "bonus"; title: string; chapter?: string | null; link: string; started: boolean }
  | { kind: "deadline"; title: string; due_local: string; link: string }
  | { kind: "done" }

/** An announcement opens the bubble by itself at most once every 10 minutes; the others wait behind the badge. */
export const AUTO_OPEN_GAP_MS = 10 * 60 * 1000

type Settings = { sounds: boolean; silent?: boolean; scope?: string; next?: NextStep }
type Panel = { kind: "announcement"; id: number; automatic: boolean } | { kind: "next" } | null
type AutoHistory = { lastAt: number; lastSeen: number }
const EMPTY_HISTORY: AutoHistory = { lastAt: 0, lastSeen: 0 }

export function Rafi() {
  const { announcements, dismiss, setAnnouncer } = useNotificationFeed()
  const sound = useRafiSound()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [next, setNext] = useState<NextStep | null>(null)
  const [nextFailed, setNextFailed] = useState(false)
  const history = useRef<Record<string, AutoHistory>>({})
  const taps = useRef(0)
  const request = useRef(0)
  const silent = settings === null || settings.silent === true
  const soundsOn = sound.on && settings?.sounds === true
  const storageKey = `shopflow:rafi:auto:${settings?.scope ?? "browser"}`

  // Keep announcements in Rafi's queue even during silence, so they never fall back to toasts.
  useEffect(() => { setAnnouncer(true, true); return () => setAnnouncer(false) }, [setAnnouncer])
  useEffect(() => { setAnnouncer(true, silent) }, [setAnnouncer, silent])
  useEffect(() => listenForUnlock(), [])
  useEffect(() => {
    let active = true
    let loading = false
    const load = async (initial = false) => {
      if (loading) return
      loading = true
      try {
        const value = await api<Settings>(initial ? "/student/rafi" : "/student/rafi?settings_only=true")
        if (active) setSettings(value)
      } catch { if (active) setSettings(null) }
      finally { loading = false }
    }
    void load(true)
    const timer = window.setInterval(() => { void load() }, NOTIFICATION_POLL_MS)
    return () => { active = false; window.clearInterval(timer); request.current += 1 }
  }, [])

  useEffect(() => {
    if (panel?.kind === "announcement" && ((panel.automatic && silent) || !announcements.some((note) => note.id === panel.id))) {
      setPanel(null)
    }
  }, [announcements, panel, silent])

  function askNext() {
    const id = ++request.current
    setPanel({ kind: "next" })
    setNext(null)
    setNextFailed(false)
    void api<Settings>("/student/rafi").then((value) => {
      if (id !== request.current) return
      setNext(value.next ?? null)
      setNextFailed(!value.next)
    }).catch(() => { if (id === request.current) setNextFailed(true) })
  }

  useEffect(() => {
    if (!settings || !announcements.length) return
    let active = true
    function consider() {
      if (!active) return
      let previous = history.current[storageKey] ?? EMPTY_HISTORY
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as AutoHistory | null
        if (stored && Number.isFinite(stored.lastAt) && Number.isFinite(stored.lastSeen)) {
          previous = { lastAt: Math.max(stored.lastAt, previous.lastAt), lastSeen: Math.max(stored.lastSeen, previous.lastSeen) }
        }
      } catch { /* Use in-memory history if storage is unavailable. */ }
      const fresh = announcements.find((note) => note.id > previous.lastSeen)
      if (!fresh) return
      const now = Date.now()
      // A message from the teacher opens the queue at once, outside the 10-minute spacing (oldest first, as usual).
      const message = announcements.find((note) => note.id > previous.lastSeen && note.kind === "message")
      const auto = !silent && panel === null && (message !== undefined || now - previous.lastAt >= AUTO_OPEN_GAP_MS)
      const claimed = { lastAt: auto ? now : previous.lastAt, lastSeen: Math.max(...announcements.map((note) => note.id)) }
      history.current[storageKey] = claimed
      try { localStorage.setItem(storageKey, JSON.stringify(claimed)) } catch { /* storage unavailable */ }
      if (auto) {
        setPanel({ kind: "announcement", id: fresh.id, automatic: true })
        if (soundsOn) chime()
      }
    }
    // The browser lock prevents two tabs claiming the same automatic opening concurrently.
    if (navigator.locks) void navigator.locks.request(storageKey, consider).catch(consider)
    else consider()
    return () => { active = false }
  }, [announcements, settings, panel, silent, soundsOn, storageKey])

  const current = panel?.kind === "announcement" && (!panel.automatic || !silent)
    ? announcements.find((note) => note.id === panel.id) : undefined
  const count = announcements.length
  function close() { setPanel(null) }
  function finish(note: Note, continueQueue: boolean) {
    dismiss(note, true)
    const remaining = announcements.find((item) => item.id !== note.id)
    setPanel(continueQueue && remaining ? { kind: "announcement", id: remaining.id, automatic: false } : null)
  }
  return <Box position="fixed" bottom={{ base: "3", md: "5" }} right={{ base: "3", md: "5" }} zIndex="docked" data-testid="rafi"
    display="flex" flexDirection="column" alignItems="flex-end" gap="2" maxW="calc(100vw - 24px)" pointerEvents="none">
    {current && <Bubble note={current} index={announcements.indexOf(current) + 1} total={count} onClose={close} onDone={(continueQueue) => finish(current, continueQueue)} />}
    {panel?.kind === "next" && <NextBubble step={next} failed={nextFailed} onClose={close} />}
    <Flex align="center" gap="2">
      <Button size="xs" variant="outline" colorPalette="brand" bg="app.surface" pointerEvents="auto"
        aria-expanded={panel?.kind === "next"} onClick={panel?.kind === "next" ? close : askNext}>{t("Que faire maintenant ?")}</Button>
      <RafiAvatar label={count ? tn("Rafi : {{count}} annonce", count) : t("Rafi, votre assistant")} onActivate={() => {
        if (count && !current) setPanel({ kind: "announcement", id: announcements[0].id, automatic: false })
        else if (panel?.kind === "next") close()
        else askNext()
        taps.current += 1
        if (soundsOn && taps.current % 3 === 1) blip()
      }}>
        {count > 0 && !current && <Badge position="absolute" top="-1" left="-1" colorPalette="saffron" variant="solid" rounded="full" aria-hidden="true">{count}</Badge>}
      </RafiAvatar>
    </Flex>
  </Box>
}

function Bubble({ note, index, total, onClose, onDone }: { note: Note; index: number; total: number; onClose: () => void; onDone: (continueQueue: boolean) => void }) {
  const link = typeof note.data?.link === "string" && /^#\/[a-z0-9/]*$/.test(note.data.link) ? note.data.link : null
  return <Box role="status" aria-live="polite" aria-label={t("Annonce de Rafi")} pointerEvents="auto" data-testid="rafi-bubble"
    bg="app.surface" color="app.ink" borderWidth="1px" borderColor="app.border" rounded="xl" boxShadow="lg" p="3" w={{ base: "calc(100vw - 24px)", sm: "xs" }} maxW="sm">
    <Flex gap="2" align="start">
      <Stack gap="1.5" flex="1" minW="0">
        <Text fontSize="xs" fontWeight="bold" color="app.muted" textTransform="uppercase" letterSpacing="0.06em">
          {t(KIND_LABELS[note.kind] ?? "Notification")}{note.sender ? ` · ${note.sender}` : ""}{total > 1 ? ` · ${t("{{index}} sur {{total}}", { index, total })}` : ""}
        </Text>
        <Text>{serverText(note.text, note.kind)}</Text>
        <Flex gap="2" wrap="wrap">
          {link && <Link href={link} fontSize="sm" fontWeight="semibold" color="brand.fg" onClick={() => onDone(false)}>{link === "#/projet" ? t("Ouvrir l’espace projet") : t("Y aller")}</Link>}
          <Button size="xs" variant="outline" colorPalette="brand" onClick={() => onDone(true)}>{total > 1 ? t("J’ai lu, suivante") : t("J’ai lu")}</Button>
        </Flex>
      </Stack>
      <CloseButton size="xs" aria-label={t("Fermer l’annonce")} onClick={onClose} />
    </Flex>
  </Box>
}

/** The text of a next step, in the interface language. */
export function nextStepText(step: NextStep): string {
  if (step.kind === "mission") return step.started
    ? t("Reprenez « {{title}} » : vous l’avez commencée.", { title: step.title })
    : t("Prochaine étape : « {{title}} ».", { title: step.title })
  if (step.kind === "bonus") return t("Le socle des blocs ouverts est terminé, bravo. Un bonus vous tente ? « {{title}} ».", { title: step.title })
  if (step.kind === "deadline") {
    const [date, time] = step.due_local.split("T")
    const [, month, day] = date.split("-")
    return t("Rien d’ouvert à finir. Prochaine échéance du projet : « {{title}} », le {{day}}/{{month}} à {{time}}.", { title: step.title, day, month, time })
  }
  return t("Tout est à jour. Revoyez vos cartes ou profitez de la pause.")
}

function NextBubble({ step, failed, onClose }: { step: NextStep | null; failed: boolean; onClose: () => void }) {
  const link = step && "link" in step && /^#\/[a-z0-9/]*$/.test(step.link) ? step.link : null
  return <Box role="status" aria-live="polite" aria-label={t("Que faire maintenant ?")} pointerEvents="auto" data-testid="rafi-next"
    bg="app.surface" color="app.ink" borderWidth="1px" borderColor="app.border" rounded="xl" boxShadow="lg" p="3" w={{ base: "calc(100vw - 24px)", sm: "xs" }} maxW="sm">
    <Flex gap="2" align="start">
      <Stack gap="1.5" flex="1" minW="0">
        <Text fontSize="xs" fontWeight="bold" color="app.muted" textTransform="uppercase" letterSpacing="0.06em">{t("Que faire maintenant ?")}</Text>
        <Text css={{ textWrap: "pretty" }}>{step ? nextStepText(step) : failed ? t("Étape indisponible. Réessayez.") : t("Recherche de la prochaine étape…")}</Text>
        {link && <Link href={link} fontSize="sm" fontWeight="semibold" color="brand.fg" onClick={onClose}>{link === "#/projet" ? t("Ouvrir l’espace projet") : t("Y aller")}</Link>}
      </Stack>
      <CloseButton size="xs" aria-label={t("Fermer")} onClick={onClose} />
    </Flex>
  </Box>
}
