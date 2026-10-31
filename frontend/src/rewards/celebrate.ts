import { useCallback, useEffect, useState } from "react"

/**
 * Lively feedback (ADR-0039): a few discreet confetti when a block is finished, and an optional short
 * chime (off by default). Both are skipped with « Réduire les animations » or the system preference.
 * Decorative only: nothing here is announced, focused or clickable.
 */
const SOUND_KEY = "shopflow:sound"
const SOUND_EVENT = "shopflow:sound-change"

export function motionAllowed(): boolean {
  try {
    if (document.documentElement.classList.contains("reduce-motion")) return false
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch { return false }
}

export function readSound(): boolean {
  try { return window.localStorage.getItem(SOUND_KEY) === "on" } catch { return false }
}

export function useSound() {
  const [on, set] = useState(readSound)
  useEffect(() => {
    const sync = (event: Event) => set((event as CustomEvent<boolean>).detail)
    window.addEventListener(SOUND_EVENT, sync)
    return () => window.removeEventListener(SOUND_EVENT, sync)
  }, [])
  const choose = useCallback((value: boolean) => {
    try { window.localStorage.setItem(SOUND_KEY, value ? "on" : "off") } catch { /* not remembered */ }
    window.dispatchEvent(new CustomEvent<boolean>(SOUND_EVENT, { detail: value }))
  }, [])
  return { on, choose }
}

/** Two soft notes, about 0.3 s, generated in the browser (no file, no network). */
export function chime(): boolean {
  if (!readSound() || !motionAllowed()) return false
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Context) return false
    const context = new Context()
    const start = context.currentTime
    for (const [index, frequency] of [659.25, 987.77].entries()) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = "sine"
      oscillator.frequency.value = frequency
      const at = start + index * 0.12
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.08, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(at)
      oscillator.stop(at + 0.2)
    }
    window.setTimeout(() => { void context.close().catch(() => undefined) }, 600)
    return true
  } catch { return false }
}

const COLORS = ["var(--chakra-colors-brand-solid)", "var(--chakra-colors-saffron-solid)", "var(--chakra-colors-green-solid)", "var(--chakra-colors-brand-300)"]

/** About 28 small pieces falling from the top for 0.9 s; transform and opacity only. Returns false when skipped. */
export function confetti(): boolean {
  if (!motionAllowed() || typeof Element === "undefined" || typeof Element.prototype.animate !== "function") return false
  const layer = document.createElement("div")
  layer.className = "academy-confetti"
  layer.setAttribute("aria-hidden", "true")
  Object.assign(layer.style, { position: "fixed", inset: "0", pointerEvents: "none", overflow: "hidden", zIndex: "1500" })
  const pieces = 28
  let finished = 0
  for (let index = 0; index < pieces; index += 1) {
    const piece = document.createElement("span")
    // Deterministic spread (no Math.random): the same celebration every time.
    const x = ((index * 37) % 100) + (index % 2 ? 0.5 : 0)
    const drift = ((index * 53) % 60) - 30
    const turn = ((index * 71) % 540) - 270
    Object.assign(piece.style, { position: "absolute", left: `${x}%`, top: "-12px", width: "8px", height: "12px",
      borderRadius: "2px", background: COLORS[index % COLORS.length], opacity: "0" })
    layer.appendChild(piece)
    const animation = piece.animate([
      { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
      { transform: `translate(${drift}px, ${45 + (index % 5) * 6}vh) rotate(${turn}deg)`, opacity: 0 },
    ], { duration: 900, delay: (index % 7) * 25, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" })
    animation.onfinish = () => { finished += 1; if (finished === pieces) layer.remove() }
  }
  document.body.appendChild(layer)
  window.setTimeout(() => layer.remove(), 1500)
  return true
}
