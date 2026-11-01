import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Box, chakra } from "@chakra-ui/react"
import { t } from "../i18n"
import { useReducedMotion } from "../preferences/display"

// Mask the original white tile in CSS; the owner's fox pixels and eye coordinates stay intact.
const SILHOUETTE = `polygon(${[
  [116, 44], [112, 64], [106, 90], [100, 120], [105, 150], [108, 175], [112, 190], [123, 211],
  [84, 294], [110, 292], [83, 311], [117, 319], [103, 334], [141, 346],
  [142, 360], [150, 380], [161, 400], [255, 476], [351, 400], [364, 380], [375, 360],
  [379, 346], [410, 334], [395, 319], [429, 311], [401, 292], [429, 294],
  [389, 211], [401, 190], [404, 175], [408, 150], [413, 120], [412, 90], [411, 64],
  [398, 44], [304, 124], [256, 120], [211, 124],
].map(([x, y]) => `${x / 512 * 100}% ${y / 520 * 100}%`).join(", ")})`
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

/** Shared visual only: no authentication, notification request or sound on the public pages. */
export function RafiAvatar({ size = 72, label, onActivate, children }: {
  size?: number; label?: string; onActivate?: () => void; children?: ReactNode
}) {
  const { reduce } = useReducedMotion()
  const reduced = reduce || systemReduced()
  const [reaction, setReaction] = useState<Reaction | null>(null)
  const [lids, setLids] = useState<{ l: boolean; r: boolean }>({ l: false, r: false })
  const [pupil, setPupil] = useState({ x: 0, y: 0 })
  const face = useRef<HTMLDivElement>(null)
  const target = useRef({ x: 0, y: 0 })
  const lastReaction = useRef<Reaction | null>(null)
  const taps = useRef(0)
  const timers = useRef(new Set<number>())
  const later = useCallback((fn: () => void, delay: number) => {
    const timer = window.setTimeout(() => { timers.current.delete(timer); fn() }, delay)
    timers.current.add(timer)
    return timer
  }, [])
  useEffect(() => () => { timers.current.forEach(window.clearTimeout); timers.current.clear() }, [])
  // Eyes follow the mouse and the finger, gently (nothing with « Réduire les animations »).
  useEffect(() => {
    if (reduced) { setPupil({ x: 0, y: 0 }); return }
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
  }, [reduced])

  // He blinks now and then.
  useEffect(() => {
    if (reduced) return
    let timer = 0
    const schedule = () => {
      timer = later(() => {
        setLids({ l: true, r: true })
        later(() => setLids({ l: false, r: false }), 140)
        schedule()
      }, 3500 + Math.random() * 3500)
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [reduced, later])

  const react = useCallback(() => {
    onActivate?.()
    taps.current += 1
    if (reduced) return
    const choices = REACTIONS.filter((item) => item !== lastReaction.current)
    const next = choices[Math.floor(Math.random() * choices.length)]
    lastReaction.current = next
    setReaction(next)
    if (next === "wink") { setLids({ l: false, r: true }); later(() => setLids({ l: false, r: false }), 260) }
    if (next === "look") target.current = { x: 0, y: 0 }
    later(() => setReaction(null), 360)
  }, [onActivate, reduced, later])

  const pose = reaction === "hop" ? "translateY(-6px)" : reaction === "tilt" ? `rotate(${taps.current % 2 ? 7 : -7}deg)` : "none"
  return <chakra.button type="button" onClick={react} aria-label={label ?? t("Rafi, votre assistant")} data-testid="rafi-avatar"
    rounded="2xl" p="0" bg="transparent" border="0" cursor="pointer" position="relative" pointerEvents="auto"
    _focusVisible={{ outline: "3px solid", outlineColor: "brand.focusRing", outlineOffset: "2px" }}>
    <Box ref={face} position="relative" w={`${size}px`} h={`${Math.round(size * 520 / 512)}px`}
      style={{ transform: pose, transition: reduced ? undefined : "transform 160ms ease-out" }}>
      <img src="/rafi/rafi-144.webp" srcSet="/rafi/rafi-144.webp 144w, /rafi/rafi-216.webp 216w, /rafi/rafi-512.webp 512w" sizes={`${size}px`}
        alt="" width={size} height={Math.round(size * 520 / 512)} draggable={false}
        style={{ display: "block", width: "100%", height: "100%", clipPath: SILHOUETTE }} />
      <Eyes pupil={pupil} lids={lids} reduced={reduced} />
    </Box>
    {children}
  </chakra.button>
}

/** Pupils and eyelids laid over his own eyes; the image itself is never changed. */
function Eyes({ pupil, lids, reduced }: { pupil: { x: number; y: number }; lids: { l: boolean; r: boolean }; reduced: boolean }) {
  const instance = useId().replace(/:/g, "")
  return <svg viewBox="0 0 512 520" aria-hidden="true" data-testid="rafi-eyes"
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
    <defs>{EYES.map((eye) => <clipPath key={eye.id} id={`${instance}-eye-${eye.id}`}><polygon points={eye.opening} /></clipPath>)}</defs>
    {EYES.map((eye) => <g key={eye.id} clipPath={`url(#${instance}-eye-${eye.id})`}>
      <ellipse cx={eye.cx} cy={eye.cy} rx={10} ry={16} fill={eye.iris} />
      <g transform={`translate(${pupil.x.toFixed(2)} ${pupil.y.toFixed(2)})`}>
        <ellipse cx={eye.cx} cy={eye.cy} rx={6.5} ry={13} fill="#2a1712" />
        <circle cx={eye.hx} cy={eye.hy} r={4.5} fill="#efe6dc" />
      </g>
      <polygon data-testid={`rafi-lid-${eye.id}`} data-closed={lids[eye.id] ? "true" : "false"} points={eye.opening}
        fill={eye.fur} stroke="#2b1712" strokeWidth={3}
        style={{ transformBox: "fill-box", transformOrigin: "50% 0%", transform: `scaleY(${lids[eye.id] ? 1 : 0})`, transition: reduced ? undefined : "transform 70ms ease-in" }} />
    </g>)}
  </svg>
}

