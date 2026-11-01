import { useEffect, useRef, useState } from "react"
import { Badge, Box, Button, CloseButton, Flex, Link, Stack, Text } from "@chakra-ui/react"
import { api } from "../api"
import { t, tn } from "../i18n"
import { serverText } from "../i18n/server"
import { KIND_LABELS, useNotificationFeed, type Note } from "../live/notifications"
import { blip, chime, listenForUnlock, useRafiSound } from "./sound"
import { RafiAvatar } from "./RafiAvatar"

export function Rafi() {
  const { announcements, dismiss, setAnnouncer } = useNotificationFeed()
  const sound = useRafiSound()
  const [classSounds, setClassSounds] = useState(false)
  const [open, setOpen] = useState(true)
  const taps = useRef(0)
  const seen = useRef(new Set<number>())
  // Ignore the former folded preference: Rafi is now always visible.
  useEffect(() => { setAnnouncer(true); return () => setAnnouncer(false) }, [setAnnouncer])
  useEffect(() => listenForUnlock(), [])
  useEffect(() => {
    let active = true
    void api<{ sounds: boolean }>("/student/rafi").then((value) => { if (active) setClassSounds(value.sounds) }).catch(() => { if (active) setClassSounds(false) })
    return () => { active = false }
  }, [])
  const soundsOn = sound.on && classSounds

  // A new announcement opens the bubble (and chimes, rarely).
  useEffect(() => {
    const fresh = announcements.filter((note) => !seen.current.has(note.id))
    if (!fresh.length) return
    fresh.forEach((note) => seen.current.add(note.id))
    setOpen(true)
    if (soundsOn) chime()
  }, [announcements, soundsOn])

  const current = announcements[0]
  const count = announcements.length
  return <Box position="fixed" bottom={{ base: "3", md: "5" }} right={{ base: "3", md: "5" }} zIndex="docked" data-testid="rafi"
    display="flex" flexDirection="column" alignItems="flex-end" gap="2" maxW="calc(100vw - 24px)" pointerEvents="none">
    {current && open && <Bubble note={current} index={1} total={count} onClose={() => setOpen(false)} onDone={(read) => dismiss(current, read)} />}
    <RafiAvatar label={count ? tn("Rafi : {{count}} annonce", count) : t("Rafi, votre assistant")} onActivate={() => {
      if (count) setOpen(true)
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
