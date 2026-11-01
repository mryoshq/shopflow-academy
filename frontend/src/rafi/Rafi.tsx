import { useCallback, useEffect, useRef, useState } from "react"
import { Badge, Box, Button, CloseButton, Flex, Link, Stack, Text } from "@chakra-ui/react"
import { api } from "../api"
import { t, tn } from "../i18n"
import { serverText } from "../i18n/server"
import { KIND_LABELS, useNotificationFeed, type Note } from "../live/notifications"
import { useReducedMotion } from "../preferences/display"
import { Icon } from "../student/ui"
import { blip, chime, listenForUnlock, useRafiSound } from "./sound"

/**
 * ADR-0047: Rafi, the student's assistant. The owner's image is shown as it is (docs/design/rafi-*.webp, never redrawn):
 * small pupils and eyelids are only laid over his own eyes. He presents the announcements in a bubble.
 */
const COLLAPSED_KEY = "shopflow:rafi:collapsed"
const SIZE = 72
/** Coordinates in the 512 × 520 image: opening of each eye (clip), centre of the pupil, highlight, colours sampled from it. */
const EYES = [
  { id: "l", opening: "178.75,236.25 197.5,232.5 213.75,238.75 217.5,250 210,261.25 190,261.25 178.75,252.5", cx: 197.5, cy: 247.5,
    hx: 192, hy: 240, iris: "#93461f", fur: "#8e3d1d" },
  { id: "r", opening: "300,237.5 315,232.5 332.5,235 340,247.5 332.5,260 310,261.25 302.5,252.5", cx: 317.5, cy: 247.5,
    hx: 320, hy: 240, iris: "#9a4d24", fur: "#9f512a" },
] as const
const MAX_X = 14 // ≈ 2 px at 72 px
const MAX_Y = 9
type Reaction = "wink" | "hop" | "tilt" | "look"
const REACTIONS: Reaction[] = ["wink", "hop", "tilt", "look"]

function systemReduced(): boolean {
  try { return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false } catch { return false }
}

function readCollapsed(): boolean {
  try { return window.localStorage.getItem(COLLAPSED_KEY) === "1" } catch { return false }
}

export function Rafi() {
  const { announcements, dismiss, setAnnouncer } = useNotificationFeed()
  const { reduce } = useReducedMotion()
  const reduced = reduce || systemReduced()
  const sound = useRafiSound()
  const [classSounds, setClassSounds] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [open, setOpen] = useState(true)
  const [reaction, setReaction] = useState<Reaction | null>(null)
  const [lids, setLids] = useState<{ l: boolean; r: boolean }>({ l: false, r: false })
  const [pupil, setPupil] = useState({ x: 0, y: 0 })
  const face = useRef<HTMLDivElement>(null)
  const target = useRef({ x: 0, y: 0 })
  const lastReaction = useRef<Reaction | null>(null)
  const taps = useRef(0)
  const seen = useRef(new Set<number>())

  // Rafi presents the announcements while he is shown; folded, they stay toasts.
  useEffect(() => { setAnnouncer(!collapsed); return () => setAnnouncer(false) }, [collapsed, setAnnouncer])
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

  // Eyes follow the mouse and the finger, gently (nothing with « Réduire les animations »).
  useEffect(() => {
    if (reduced || collapsed) { setPupil({ x: 0, y: 0 }); return }
    const move = (event: PointerEvent) => {
      const box = face.current?.getBoundingClientRect()
      if (!box) return
      const dx = event.clientX - (box.left + box.width / 2), dy = event.clientY - (box.top + box.height * 0.47)
      const distance = Math.hypot(dx, dy) || 1
      const reach = Math.min(1, distance / 240)
      target.current = { x: (dx / distance) * MAX_X * reach, y: (dy / distance) * MAX_Y * reach }
    }
    let frame = 0
    const step = () => {
      setPupil((current) => {
        const next = { x: current.x + (target.current.x - current.x) * 0.12, y: current.y + (target.current.y - current.y) * 0.12 }
        return Math.abs(next.x - current.x) < 0.01 && Math.abs(next.y - current.y) < 0.01 ? current : next
      })
      frame = requestAnimationFrame(step)
    }
    window.addEventListener("pointermove", move, { passive: true })
    window.addEventListener("pointerdown", move, { passive: true })
    frame = requestAnimationFrame(step)
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerdown", move); cancelAnimationFrame(frame) }
  }, [reduced, collapsed])

  // He blinks now and then.
  useEffect(() => {
    if (reduced || collapsed) return
    let timer = 0
    const schedule = () => {
      timer = window.setTimeout(() => {
        setLids({ l: true, r: true })
        window.setTimeout(() => setLids({ l: false, r: false }), 140)
        schedule()
      }, 3500 + Math.random() * 3500)
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [reduced, collapsed])

  const react = useCallback(() => {
    if (announcements.length) setOpen(true)
    taps.current += 1
    if (soundsOn && taps.current % 3 === 1) blip()
    if (reduced) return
    const choices = REACTIONS.filter((item) => item !== lastReaction.current)
    const next = choices[Math.floor(Math.random() * choices.length)]
    lastReaction.current = next
    setReaction(next)
    if (next === "wink") { setLids({ l: false, r: true }); window.setTimeout(() => setLids({ l: false, r: false }), 260) }
    if (next === "look") target.current = { x: 0, y: 0 }
    window.setTimeout(() => setReaction(null), 360)
  }, [announcements.length, soundsOn, reduced])

  function fold(value: boolean) {
    try { window.localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0") } catch { /* not remembered */ }
    setCollapsed(value)
  }

  const current = announcements[0]
  const count = announcements.length
  const motion = reduced ? undefined : "transform 160ms ease-out"
  const pose = reaction === "hop" ? "translateY(-6px)" : reaction === "tilt" ? `rotate(${taps.current % 2 ? 7 : -7}deg)` : "none"

  if (collapsed) {
    return <Box position="fixed" bottom={{ base: "3", md: "5" }} right={{ base: "3", md: "5" }} zIndex="docked" data-testid="rafi">
      <Button size="sm" variant="outline" bg="app.surface" boxShadow="md" rounded="full" onClick={() => fold(false)} aria-label={t("Afficher Rafi")}>
        <img src="/rafi/rafi-144.webp" alt="" width={24} height={24} style={{ borderRadius: 6 }} />
        {t("Rafi")}{count ? <Badge colorPalette="saffron" variant="solid" rounded="full">{count}</Badge> : null}
      </Button>
    </Box>
  }

  return <Box position="fixed" bottom={{ base: "3", md: "5" }} right={{ base: "3", md: "5" }} zIndex="docked" data-testid="rafi"
    display="flex" flexDirection="column" alignItems="flex-end" gap="2" maxW="calc(100vw - 24px)" pointerEvents="none">
    {current && open && <Bubble note={current} index={1} total={count} onClose={() => setOpen(false)} onDone={(read) => dismiss(current, read)} />}
    <Flex align="flex-end" gap="1.5" pointerEvents="auto">
      <Stack gap="1">
        <Button size="xs" variant="outline" bg="app.surface" px="0" minW="8" h="8" aria-pressed={!sound.on}
          aria-label={sound.on ? t("Couper les sons de Rafi") : t("Rétablir les sons de Rafi")} title={classSounds ? undefined : t("Sons coupés par l’enseignant")}
          onClick={() => sound.choose(!sound.on)}>
          <Icon name={sound.on && classSounds ? "volume" : "volume-off"} size={14} />
        </Button>
        <Button size="xs" variant="outline" bg="app.surface" px="0" minW="8" h="8" aria-label={t("Replier Rafi")} onClick={() => fold(true)}>
          <Icon name="chevron-down" size={14} />
        </Button>
      </Stack>
      <Box as="button" onClick={react} aria-label={count ? tn("Rafi : {{count}} annonce", count) : t("Rafi, votre assistant")}
        rounded="2xl" p="0" bg="transparent" cursor="pointer" position="relative" _focusVisible={{ outline: "3px solid", outlineColor: "brand.focusRing", outlineOffset: "2px" }}>
        <Box ref={face} position="relative" w={`${SIZE}px`} h={`${Math.round(SIZE * 520 / 512)}px`} style={{ transform: pose, transition: motion }}
          filter="drop-shadow(0 4px 10px rgba(0,0,0,.18))">
          <img src="/rafi/rafi-144.webp" srcSet="/rafi/rafi-144.webp 144w, /rafi/rafi-216.webp 216w, /rafi/rafi-512.webp 512w" sizes={`${SIZE}px`}
            alt="" width={SIZE} height={Math.round(SIZE * 520 / 512)} draggable={false} style={{ display: "block", width: "100%", height: "100%" }} />
          <Eyes pupil={pupil} lids={lids} reduced={reduced} />
        </Box>
        {count > 0 && !open && <Badge position="absolute" top="-1" left="-1" colorPalette="saffron" variant="solid" rounded="full" aria-hidden="true">{count}</Badge>}
      </Box>
    </Flex>
  </Box>
}

/** Pupils and eyelids laid over his own eyes; the image itself is never changed. */
function Eyes({ pupil, lids, reduced }: { pupil: { x: number; y: number }; lids: { l: boolean; r: boolean }; reduced: boolean }) {
  return <svg viewBox="0 0 512 520" aria-hidden="true" data-testid="rafi-eyes"
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
    <defs>{EYES.map((eye) => <clipPath key={eye.id} id={`rafi-eye-${eye.id}`}><polygon points={eye.opening} /></clipPath>)}</defs>
    {EYES.map((eye) => <g key={eye.id} clipPath={`url(#rafi-eye-${eye.id})`}>
      <ellipse cx={eye.cx} cy={eye.cy} rx={10} ry={16} fill={eye.iris} />
      <g transform={`translate(${pupil.x.toFixed(2)} ${pupil.y.toFixed(2)})`}>
        <ellipse cx={eye.cx} cy={eye.cy} rx={6.5} ry={13} fill="#2a1712" />
        <circle cx={eye.hx} cy={eye.hy} r={4.5} fill="#efe6dc" />
      </g>
      <polygon id={`lids-${eye.id}`} data-testid={`rafi-lid-${eye.id}`} data-closed={lids[eye.id] ? "true" : "false"} points={eye.opening}
        fill={eye.fur} stroke="#2b1712" strokeWidth={3}
        style={{ transformBox: "fill-box", transformOrigin: "50% 0%", transform: `scaleY(${lids[eye.id] ? 1 : 0})`, transition: reduced ? undefined : "transform 70ms ease-in" }} />
    </g>)}
  </svg>
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
