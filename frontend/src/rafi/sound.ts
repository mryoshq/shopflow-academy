import { useCallback, useEffect, useState } from "react"

/**
 * ADR-0047: Rafi's sounds. Short, rare, synthesised with Web Audio (no file). Nothing plays before the first
 * interaction with the page (click, touch or key), and never when the student or the teacher switched them off.
 */
const KEY = "shopflow:rafi:sound"
const EVENT = "academy:rafi-sound"
let context: AudioContext | null = null
let unlocked = false
let lastChime = 0
const CHIME_GAP_MS = 30_000

function readOn(): boolean {
  try { return window.localStorage.getItem(KEY) !== "off" } catch { return true }
}

/** The student's own choice (Rafi's button and Paramètres), shared between them. */
export function useRafiSound() {
  const [on, set] = useState(readOn)
  useEffect(() => {
    const sync = (event: Event) => set((event as CustomEvent<boolean>).detail)
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])
  const choose = useCallback((value: boolean) => {
    try { window.localStorage.setItem(KEY, value ? "on" : "off") } catch { /* not remembered */ }
    window.dispatchEvent(new CustomEvent<boolean>(EVENT, { detail: value }))
  }, [])
  return { on, choose }
}

/** Called once the user has interacted with the page: from then on, a sound may play. */
export function listenForUnlock(): () => void {
  const unlock = () => { unlocked = true }
  const events = ["pointerdown", "keydown"] as const
  events.forEach((name) => window.addEventListener(name, unlock, { once: true, capture: true }))
  return () => events.forEach((name) => window.removeEventListener(name, unlock, { capture: true }))
}

export function isUnlocked(): boolean {
  return unlocked
}

function play(notes: [number, number][]) {
  if (!unlocked || typeof window === "undefined" || document.hidden) return
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    context ??= new Ctor()
    let at = context.currentTime + 0.01
    for (const [frequency, duration] of notes) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = "sine"
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.05, at + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(at)
      oscillator.stop(at + duration + 0.02)
      at += duration * 0.8
    }
  } catch { /* no sound: nothing else changes */ }
}

/** A new announcement: two soft notes, at most once every 30 s. */
export function chime(): boolean {
  if (Date.now() - lastChime < CHIME_GAP_MS) return false
  lastChime = Date.now()
  play([[659, 0.11], [880, 0.16]])
  return true
}

/** A touch reaction: one short note. */
export function blip() {
  play([[523, 0.07]])
}
