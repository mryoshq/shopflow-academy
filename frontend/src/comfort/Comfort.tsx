import { msg, t } from "../i18n"
import { useEffect, useRef, useState } from "react"
import { Badge, Box, Button, CloseButton, Flex, Input, NativeSelect, Stack, Text } from "@chakra-ui/react"
import { api } from "../api"
import { Icon } from "../student/ui"

/** ADR-0024: student comfort tools in the header: a pomodoro timer and an optional radio. */

export type Phase = "work" | "break"
export type PomodoroState = { phase: Phase; running: boolean; endsAt: number | null; remaining: number; work: number; rest: number }
const KEY = "shopflow:pomodoro"
export const DEFAULT_POMODORO: PomodoroState = { phase: "work", running: false, endsAt: null, remaining: 25 * 60, work: 25, rest: 5 }

export function clampMinutes(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min
}

/** Next state at time ``now``: the phase switches (work ↔ break) when its end is reached. Pure, for tests. */
export function tick(state: PomodoroState, now: number): PomodoroState {
  if (!state.running || state.endsAt === null) return state
  const left = Math.ceil((state.endsAt - now) / 1000)
  if (left > 0) return { ...state, remaining: left }
  const phase: Phase = state.phase === "work" ? "break" : "work"
  const seconds = (phase === "work" ? state.work : state.rest) * 60
  return { ...state, phase, remaining: seconds, endsAt: now + seconds * 1000 }
}

export function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

function load(): PomodoroState {
  try { return { ...DEFAULT_POMODORO, ...JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<PomodoroState> } }
  catch { return DEFAULT_POMODORO }
}

function usePomodoro() {
  const [state, setState] = useState<PomodoroState>(() => tick(load(), Date.now()))
  useEffect(() => { try { window.localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* not remembered */ } }, [state])
  useEffect(() => {
    if (!state.running) return
    const timer = setInterval(() => setState((current) => tick(current, Date.now())), 1000)
    return () => clearInterval(timer)
  }, [state.running])
  return {
    state,
    start: () => setState((s) => ({ ...s, running: true, endsAt: Date.now() + s.remaining * 1000 })),
    pause: () => setState((s) => ({ ...tick(s, Date.now()), running: false, endsAt: null })),
    reset: () => setState((s) => ({ ...s, phase: "work", running: false, endsAt: null, remaining: s.work * 60 })),
    configure: (work: number, rest: number) => setState((s) => ({ ...s, work, rest, running: false, endsAt: null, phase: "work", remaining: work * 60 })),
  }
}

type Stream = { id: string; label: string; url: string }

/** Header button for students: « Confort » panel; the timer stays visible on the button while it runs. */
export function ComfortButton() {
  const pomodoro = usePomodoro()
  const [open, setOpen] = useState(false)
  const [announce, setAnnounce] = useState("")
  // On a phone the header buttons wrap to the left: the panel then spans the screen just below them.
  const [top, setTop] = useState(0)
  const button = useRef<HTMLButtonElement>(null)
  const previous = useRef(pomodoro.state.phase)
  useEffect(() => {
    if (previous.current !== pomodoro.state.phase) {
      setAnnounce(pomodoro.state.phase === "break" ? t("Pause : levez les yeux de l’écran quelques minutes.") : t("Reprise du travail."))
      previous.current = pomodoro.state.phase
    }
  }, [pomodoro.state.phase])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])
  const { state } = pomodoro
  return <Box position="relative">
    <Button ref={button} size="sm" variant="outline" aria-expanded={open} aria-haspopup="dialog"
      onClick={() => { setTop(Math.round(button.current?.getBoundingClientRect().bottom ?? 0) + 8); setOpen((value) => !value) }}
      aria-label={state.running ? t("Confort : {{phase}}, {{time}} restantes", { phase: state.phase === "work" ? t("travail") : t("pause"), time: clock(state.remaining) }) : t("Confort : minuteur et radio")}>
      <Icon name="clock" size={16} />{state.running ? <Text as="span" css={{ fontVariantNumeric: "tabular-nums" }}>{clock(state.remaining)}</Text> : null}
    </Button>
    <Text role="status" aria-live="polite" position="absolute" w="1px" h="1px" overflow="hidden" css={{ clip: "rect(0 0 0 0)" }}>{announce}</Text>
    {/* Kept mounted when closed so the radio keeps playing; hidden from view and from assistive tech. */}
    <Box role="dialog" aria-label={t("Confort")} hidden={!open} zIndex="popover"
      position={{ base: "fixed", md: "absolute" }} top={{ base: `${top}px`, md: "calc(100% + 8px)" }}
      left={{ base: "3", md: "auto" }} right={{ base: "3", md: "0" }} w={{ base: "auto", md: "20rem" }}
      maxH={{ base: `calc(100dvh - ${top + 12}px)`, md: "none" }} overflowY={{ base: "auto", md: "visible" }} bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="lg" boxShadow="lg" p="3">
      <Flex justify="space-between" align="center" mb="2"><Text fontWeight="semibold">{t("Confort")}</Text>
        <CloseButton size={{ base: "md", md: "xs" }} minW={{ base: "11", md: "auto" }} aria-label={t("Fermer le panneau Confort")} onClick={() => setOpen(false)} /></Flex>
      <Pomodoro {...pomodoro} />
      <Radio />
    </Box>
  </Box>
}

function Pomodoro({ state, start, pause, reset, configure }: ReturnType<typeof usePomodoro>) {
  const [work, setWork] = useState(String(state.work))
  const [rest, setRest] = useState(String(state.rest))
  return <Stack gap="2" as="section" aria-label={t("Minuteur pomodoro")} pb="3" borderBottomWidth="1px" borderColor="app.border">
    <Flex align="center" gap="2">
      <Badge colorPalette={state.phase === "work" ? "brand" : "saffron"} variant="subtle" rounded="full">{state.phase === "work" ? t("Travail") : t("Pause")}</Badge>
      <Text fontSize="2xl" fontWeight="bold" css={{ fontVariantNumeric: "tabular-nums" }} aria-label={`${clock(state.remaining)} restantes`}>{clock(state.remaining)}</Text>
    </Flex>
    <Flex gap="2" wrap="wrap">
      {state.running ? <Button size="xs" variant="outline" onClick={pause}>{t("Pause")}</Button>
        : <Button size="xs" colorPalette="brand" onClick={start}>{t("Démarrer")}</Button>}
      <Button size="xs" variant="ghost" onClick={reset}>{t("Réinitialiser")}</Button>
    </Flex>
    <Flex gap="2" align="end" wrap="wrap" fontSize="sm">
      <label>{t("Travail (min)")}<Input size="xs" type="number" min={15} max={50} value={work} w="4.5rem" ml="1" onChange={(event) => setWork(event.target.value)} /></label>
      <label>{t("Pause (min)")}<Input size="xs" type="number" min={3} max={15} value={rest} w="4.5rem" ml="1" onChange={(event) => setRest(event.target.value)} /></label>
      <Button size="xs" variant="outline" onClick={() => {
        const w = clampMinutes(Number(work), 15, 50), r = clampMinutes(Number(rest), 3, 15)
        setWork(String(w)); setRest(String(r)); configure(w, r)
      }}>{t("Appliquer")}</Button>
    </Flex>
    <Text fontSize="xs" color="app.muted">{t("Facultatif, pour vous seul. Il ne bloque rien et votre enseignant ne le voit pas.")}</Text>
  </Stack>
}

const VOLUME_KEY = "shopflow:radio-volume"
export const RADIO_DOWN = msg("Radio indisponible pour le moment")

/** Remembered volume, 0 to 100 (50 by default, or when the browser forbids storage). */
export function loadVolume(): number {
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY)
    const value = raw === null ? NaN : Number(raw)
    return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 50
  } catch { return 50 }
}

/**
 * Optional radio (ADR-0024, revised 30/10/2026): direct HTTPS audio streams set on the server. The
 * browser plays them itself in a plain <audio>, never relayed by the platform; nothing loads before
 * « Lecture », and a pause drops the connection. Play/pause and volume only.
 */
function Radio() {
  const [streams, setStreams] = useState<Stream[] | null>(null)
  const [choice, setChoice] = useState("")
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [volume, setVolume] = useState(loadVolume)
  const audio = useRef<HTMLAudioElement>(null)
  const live = useRef(false)
  useEffect(() => { void api<{ streams: Stream[] }>("/radio").then((r) => { setStreams(r.streams); setChoice(r.streams[0]?.id ?? "") }).catch(() => setStreams([])) }, [])
  useEffect(() => {
    if (audio.current) audio.current.volume = volume / 100
    try { window.localStorage.setItem(VOLUME_KEY, String(volume)) } catch { /* not remembered */ }
  }, [volume])
  const stop = () => {
    live.current = false
    setPlaying(false)
    const element = audio.current
    if (!element) return
    element.pause()
    // Dropping the source closes the connection: a live stream is never buffered in the background.
    element.removeAttribute("src")
    element.load()
  }
  const fail = () => { stop(); setFailed(true) }
  const play = (id: string) => {
    const element = audio.current
    const stream = streams?.find((item) => item.id === id)
    if (!element || !stream) return
    live.current = true
    setFailed(false)
    setPlaying(true)
    element.src = stream.url
    element.volume = volume / 100
    element.play()?.catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) fail() })
  }
  if (!streams) return null
  const current = streams.find((item) => item.id === choice)
  return <Stack gap="2" as="section" aria-label={t("Radio")} pt="3">
    <Text fontWeight="medium" fontSize="sm">{t("Radio d’ambiance")}</Text>
    {streams.length === 0 ? <Text fontSize="xs" color="app.muted">{t("Aucune radio proposée par votre enseignant.")}</Text> : <>
      <Flex gap="2" align="center">
        <NativeSelect.Root size="xs" flex="1" minW="0">
          <NativeSelect.Field aria-label={t("Station")} value={choice} onChange={(event) => { setChoice(event.target.value); if (playing) play(event.target.value) }}>
            {streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.label}</option>)}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        {playing ? <Button size="xs" variant="outline" onClick={stop}><Icon name="pause" size={14} />{t("Pause")}</Button>
          : <Button size="xs" colorPalette="brand" onClick={() => play(choice)}><Icon name="play" size={14} />{t("Lecture")}</Button>}
      </Flex>
      <Flex as="label" gap="2" align="center" fontSize="sm">
        <Icon name="volume" size={16} /><Text as="span">{t("Volume")}</Text>
        <input type="range" min={0} max={100} step={5} value={volume} aria-valuetext={`${volume} %`}
          onChange={(event) => setVolume(Number(event.target.value))}
          style={{ flex: 1, minWidth: 0, accentColor: "var(--chakra-colors-brand-solid)" }} />
        <Text as="span" w="3rem" textAlign="right" color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }}>{volume} %</Text>
      </Flex>
      <Text role="status" fontSize="xs" color={failed ? "saffron.fg" : "app.muted"}>
        {failed ? t("{{message}}. Réessayez plus tard.", { message: t(RADIO_DOWN) }) : playing && current ? t("Lecture : {{label}}", { label: current.label }) : t("Rien n’est chargé avant « Lecture ». Le son vient directement de la station.")}
      </Text>
      <audio ref={audio} preload="none" onError={() => { if (live.current) fail() }} />
    </>}
  </Stack>
}
