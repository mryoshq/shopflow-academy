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
  const previous = useRef(pomodoro.state.phase)
  useEffect(() => {
    if (previous.current !== pomodoro.state.phase) {
      setAnnounce(pomodoro.state.phase === "break" ? "Pause : levez les yeux de l’écran quelques minutes." : "Reprise du travail.")
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
    <Button size="sm" variant="outline" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}
      aria-label={state.running ? `Confort : ${state.phase === "work" ? "travail" : "pause"}, ${clock(state.remaining)} restantes` : "Confort : minuteur et radio"}>
      <Icon name="clock" size={16} />{state.running ? <Text as="span" css={{ fontVariantNumeric: "tabular-nums" }}>{clock(state.remaining)}</Text> : null}
    </Button>
    <Text role="status" aria-live="polite" position="absolute" w="1px" h="1px" overflow="hidden" css={{ clip: "rect(0 0 0 0)" }}>{announce}</Text>
    {/* Kept mounted when closed so the radio keeps playing; hidden from view and from assistive tech. */}
    <Box role="dialog" aria-label="Confort" hidden={!open} position="absolute" right="0" top="calc(100% + 8px)" zIndex="popover"
      w={{ base: "min(92vw, 20rem)", md: "20rem" }} bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="lg" boxShadow="lg" p="3">
      <Flex justify="space-between" align="center" mb="2"><Text fontWeight="semibold">Confort</Text>
        <CloseButton size="xs" aria-label="Fermer le panneau Confort" onClick={() => setOpen(false)} /></Flex>
      <Pomodoro {...pomodoro} />
      <Radio />
    </Box>
  </Box>
}

function Pomodoro({ state, start, pause, reset, configure }: ReturnType<typeof usePomodoro>) {
  const [work, setWork] = useState(String(state.work))
  const [rest, setRest] = useState(String(state.rest))
  return <Stack gap="2" as="section" aria-label="Minuteur pomodoro" pb="3" borderBottomWidth="1px" borderColor="app.border">
    <Flex align="center" gap="2">
      <Badge colorPalette={state.phase === "work" ? "brand" : "saffron"} variant="subtle" rounded="full">{state.phase === "work" ? "Travail" : "Pause"}</Badge>
      <Text fontSize="2xl" fontWeight="bold" css={{ fontVariantNumeric: "tabular-nums" }} aria-label={`${clock(state.remaining)} restantes`}>{clock(state.remaining)}</Text>
    </Flex>
    <Flex gap="2" wrap="wrap">
      {state.running ? <Button size="xs" variant="outline" onClick={pause}>Pause</Button>
        : <Button size="xs" colorPalette="brand" onClick={start}>Démarrer</Button>}
      <Button size="xs" variant="ghost" onClick={reset}>Réinitialiser</Button>
    </Flex>
    <Flex gap="2" align="end" wrap="wrap" fontSize="sm">
      <label>Travail (min)<Input size="xs" type="number" min={15} max={50} value={work} w="4.5rem" ml="1" onChange={(event) => setWork(event.target.value)} /></label>
      <label>Pause (min)<Input size="xs" type="number" min={3} max={15} value={rest} w="4.5rem" ml="1" onChange={(event) => setRest(event.target.value)} /></label>
      <Button size="xs" variant="outline" onClick={() => {
        const w = clampMinutes(Number(work), 15, 50), r = clampMinutes(Number(rest), 3, 15)
        setWork(String(w)); setRest(String(r)); configure(w, r)
      }}>Appliquer</Button>
    </Flex>
    <Text fontSize="xs" color="app.muted">Facultatif, pour vous seul. Il ne bloque rien et votre enseignant ne le voit pas.</Text>
  </Stack>
}

/** Optional radio: streams set by the teacher on the server; nothing loads before « Écouter », and it starts muted. */
function Radio() {
  const [streams, setStreams] = useState<Stream[] | null>(null)
  const [choice, setChoice] = useState("")
  const [playing, setPlaying] = useState<Stream | null>(null)
  useEffect(() => { void api<{ streams: Stream[] }>("/radio").then((r) => { setStreams(r.streams); setChoice(r.streams[0]?.id ?? "") }).catch(() => setStreams([])) }, [])
  if (!streams) return null
  return <Stack gap="2" as="section" aria-label="Radio" pt="3">
    <Text fontWeight="medium" fontSize="sm">Radio d’ambiance</Text>
    {streams.length === 0 ? <Text fontSize="xs" color="app.muted">Aucune radio proposée par votre enseignant.</Text> : <>
      <Flex gap="2" align="center">
        <NativeSelect.Root size="xs" flex="1">
          <NativeSelect.Field aria-label="Choisir une radio" value={choice} onChange={(event) => setChoice(event.target.value)}>
            {streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.label}</option>)}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        {playing ? <Button size="xs" variant="outline" onClick={() => setPlaying(null)}>Arrêter</Button>
          : <Button size="xs" colorPalette="brand" onClick={() => setPlaying(streams.find((s) => s.id === choice) ?? null)}>Écouter</Button>}
      </Flex>
      {playing && <iframe title={`Radio : ${playing.label}`} src={`${playing.url}?autoplay=1&mute=1&playsinline=1&rel=0`}
        allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" style={{ width: "100%", height: "9rem", border: 0, borderRadius: "6px" }} />}
      <Text fontSize="xs" color="app.muted">Démarre sans le son : activez-le dans le lecteur. Le service vidéo ne charge rien avant « Écouter ».</Text>
    </>}
  </Stack>
}
