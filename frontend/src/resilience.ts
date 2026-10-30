/**
 * Outages (ADR-0038): the API answers 502, 503 or 504 from the gateway, or the network is down.
 * One shared probe asks /health/live with a delay that grows at each attempt; when it answers, every
 * read that waited is sent again and the page carries on. Only a 401 signs out (api.ts).
 */
export const OUTAGE_EVENT = "academy:outage"
export const RECOVERED_EVENT = "academy:recovered"
export const RETRY_EVENT = "academy:outage-retry"

/** Seconds before attempt n (0-based): 1, 2, 4, 8, 16, then every 30 s. */
export function backoff(attempt: number): number {
  return Math.min(30, 2 ** attempt)
}

/**
 * A gateway answer, not the application's: 502, 503 or 504 without the JSON body of FastAPI
 * (the laboratory's own 503, with a JSON detail, is a normal error of the page).
 */
export function isGatewayFailure(response: Response): boolean {
  if (![502, 503, 504].includes(response.status)) return false
  // nginx and Cloudflare answer with an HTML page; the application always answers in JSON.
  const type = response.headers?.get?.("content-type") ?? ""
  return type !== "" && !type.includes("json")
}

let waiting: Promise<void> | null = null
let release: (() => void) | null = null
let timer: number | undefined
let nextAt: number | null = null

/** Time (ms) of the next automatic attempt, or null outside an outage. */
export function nextAttemptAt(): number | null {
  return waiting ? nextAt : null
}

export function inOutage(): boolean {
  return waiting !== null
}

async function probe(): Promise<boolean> {
  try {
    const response = await fetch("/health/live", { cache: "no-store", credentials: "same-origin" })
    return response.ok
  } catch { return false }
}

function schedule(attempt: number) {
  const seconds = backoff(attempt)
  nextAt = Date.now() + seconds * 1000
  window.dispatchEvent(new CustomEvent<{ seconds: number; attempt: number }>(RETRY_EVENT, { detail: { seconds, attempt } }))
  timer = window.setTimeout(async () => {
    if (await probe()) recovered()
    else schedule(attempt + 1)
  }, seconds * 1000)
}

/** Marks the outage (once) and starts the automatic attempts. */
export function reportOutage(): Promise<void> {
  if (!waiting) {
    waiting = new Promise<void>((resolve) => { release = resolve })
    window.dispatchEvent(new Event(OUTAGE_EVENT))
    schedule(0)
  }
  return waiting
}

/** The platform answers again: every waiting read is released. */
export function recovered() {
  if (!waiting) return
  window.clearTimeout(timer)
  const done = release
  waiting = null
  release = null
  done?.()
  window.dispatchEvent(new Event(RECOVERED_EVENT))
}

/** « Réessayer maintenant »: probes at once instead of waiting for the next attempt. */
export async function retryNow(): Promise<void> {
  if (!waiting) return
  window.clearTimeout(timer)
  if (await probe()) recovered()
  else schedule(0)
}

/** For tests only. */
export function resetOutage() {
  window.clearTimeout(timer)
  waiting = null
  release = null
}
