import { useEffect, useRef, useState } from "react"
import { Badge, Box, Button, CloseButton, Flex, Link, Stack, Text } from "@chakra-ui/react"
import { api } from "../api"
import { t, tn } from "../i18n"
import { serverText } from "../i18n/server"
import { KIND_LABELS, useNotificationFeed, type Note } from "../live/notifications"
import { blip, chime, listenForUnlock, useRafiSound } from "./sound"
import { RafiAvatar } from "./RafiAvatar"

/** « Que faire maintenant ? » computed by the server (ADR-0050). */
export type NextStep =
  | { kind: "mission" | "bonus"; title: string; chapter?: string | null; link: string; started: boolean }
  | { kind: "deadline"; title: string; due_local: string; link: string }
  | { kind: "done" }

/** An announcement opens the bubble by itself at most once every 10 minutes; the others wait behind the badge. */
export const AUTO_OPEN_GAP_MS = 10 * 60 * 1000

export function Rafi() {
  const { announcements, dismiss, setAnnouncer } = useNotificationFeed()
  const sound = useRafiSound()
  const [classSounds, setClassSounds] = useState(false)
  const [open, setOpen] = useState(true)
  const [next, setNext] = useState<NextStep | null>(null)
  const [showNext, setShowNext] = useState(false)
  const lastAuto = useRef(0)
  const taps = useRef(0)
  const seen = useRef(new Set<number>())
  // Ignore the former folded preference: Rafi is now always visible.
  useEffect(() => { setAnnouncer(true); return () => setAnnouncer(false) }, [setAnnouncer])
  useEffect(() => listenForUnlock(), [])
  useEffect(() => {
    let active = true
    void api<{ sounds: boolean; next?: NextStep }>("/student/rafi").then((value) => {
      if (active) { setClassSounds(value.sounds); setNext(value.next ?? null) }
    }).catch(() => { if (active) setClassSounds(false) })
    return () => { active = false }
  }, [])
  const askNext = () => {
    setShowNext(true)
    void api<{ next?: NextStep }>("/student/rafi").then((value) => setNext(value.next ?? null)).catch(() => undefined)
  }
  const soundsOn = sound.on && classSounds

  // A new announcement opens the bubble (and chimes, rarely).
  useEffect(() => {
    const fresh = announcements.filter((note) => !seen.current.has(note.id))
    if (!fresh.length) return
    fresh.forEach((note) => seen.current.add(note.id))
    const now = Date.now()
    if (now - lastAuto.current < AUTO_OPEN_GAP_MS) return
    lastAuto.current = now
    setOpen(true)
    if (soundsOn) chime()
  }, [announcements, soundsOn])

  const current = announcements[0]
  const count = announcements.length
  return <Box position="fixed" bottom={{ base: "3", md: "5" }} right={{ base: "3", md: "5" }} zIndex="docked" data-testid="rafi"
    display="flex" flexDirection="column" alignItems="flex-end" gap="2" maxW="calc(100vw - 24px)" pointerEvents="none">
    {current && open && <Bubble note={current} index={1} total={count} onClose={() => setOpen(false)} onDone={(read) => dismiss(current, read)} />}
    {!(current && open) && showNext && next && <NextBubble step={next} onClose={() => setShowNext(false)} />}
    <RafiAvatar label={count ? tn("Rafi : {{count}} annonce", count) : t("Rafi, votre assistant")} onActivate={() => {
      if (count && !open) setOpen(true)
      else if (showNext) setShowNext(false)
      else { setOpen(false); askNext() }
      taps.current += 1
      if (soundsOn && taps.current % 3 === 1) blip()
    }}>
      {count > 0 && !open && <Badge position="absolute" top="-1" left="-1" colorPalette="saffron" variant="solid" rounded="full" aria-hidden="true">{count}</Badge>}
    </RafiAvatar>
  </Box>
}

function Bubble({ note, index, total, onClose, onDone }: { note: Note; index: number; total: number; onClose: () => void; onDone: (read: boolean) => void }) {
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
          {link && <Link href={link} fontSize="sm" fontWeight="semibold" color="brand.fg" onClick={() => onDone(true)}>{link === "#/projet" ? t("Ouvrir l’espace projet") : t("Y aller")}</Link>}
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

function NextBubble({ step, onClose }: { step: NextStep; onClose: () => void }) {
  const link = "link" in step && /^#\/[a-z0-9/]*$/.test(step.link) ? step.link : null
  return <Box role="status" aria-live="polite" aria-label={t("Que faire maintenant ?")} pointerEvents="auto" data-testid="rafi-next"
    bg="app.surface" color="app.ink" borderWidth="1px" borderColor="app.border" rounded="xl" boxShadow="lg" p="3" w={{ base: "calc(100vw - 24px)", sm: "xs" }} maxW="sm">
    <Flex gap="2" align="start">
      <Stack gap="1.5" flex="1" minW="0">
        <Text fontSize="xs" fontWeight="bold" color="app.muted" textTransform="uppercase" letterSpacing="0.06em">{t("Que faire maintenant ?")}</Text>
        <Text>{nextStepText(step)}</Text>
        {link && <Link href={link} fontSize="sm" fontWeight="semibold" color="brand.fg" onClick={onClose}>{link === "#/projet" ? t("Ouvrir l’espace projet") : t("Y aller")}</Link>}
      </Stack>
      <CloseButton size="xs" aria-label={t("Fermer")} onClick={onClose} />
    </Flex>
  </Box>
}
