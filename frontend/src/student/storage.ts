import type { Answer } from "./types"

/** Browser storage is a convenience only: every access is guarded. */
function read(store: () => Storage, key: string): string | null {
  try { return store().getItem(key) } catch { return null }
}

function write(store: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) store().removeItem(key)
    else store().setItem(key, value)
  } catch { /* storage unavailable */ }
}

const LAST = "shopflow:last-mission"

export function rememberLastMission(id: number) { write(() => localStorage, LAST, String(id)) }
export function lastMission(): number | null {
  const value = Number(read(() => localStorage, LAST))
  return Number.isInteger(value) && value > 0 ? value : null
}

export function saveDraft(id: number, answer: Answer) { write(() => sessionStorage, `shopflow:draft:${id}`, JSON.stringify(answer)) }
export function clearDraft(id: number) { write(() => sessionStorage, `shopflow:draft:${id}`, null) }
export function loadDraft(id: number): Answer | null {
  const raw = read(() => sessionStorage, `shopflow:draft:${id}`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Answer
    return Array.isArray(parsed.choice_ids) && typeof parsed.pairs === "object" ? parsed : null
  } catch { return null }
}

export function newIdempotencyKey(): string {
  try { if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replaceAll("-", "") } catch { /* fallback */ }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("")
}
