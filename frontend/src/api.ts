import { t, msg } from "./i18n"
import { isGatewayFailure, reportOutage } from "./resilience"
import { routeStudentView } from "./studentview/adapter"

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message)
  }
}

/** Seconds to wait sent by the server with a 429 (pause after an error, minimum reading time). */
export function retryAfter(error: unknown, code?: string): number | null {
  if (!(error instanceof ApiError) || error.status !== 429) return null
  const detail = error.detail as { code?: string; retry_after?: number } | undefined
  if (!detail || typeof detail.retry_after !== "number" || (code && detail.code !== code)) return null
  return detail.retry_after
}

export function csrfToken(): string {
  for (const part of document.cookie.split("; ")) {
    const [name, value] = part.split("=", 2)
    if (name === "academy_csrf" || name === "__Host-academy_csrf") return decodeURIComponent(value ?? "")
  }
  return ""
}

function messageOf(detail: unknown): string {
  if (typeof detail === "string") return detail
  if (detail && typeof detail === "object" && "message" in detail) return String((detail as { message: unknown }).message)
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      if (typeof item === "object" && item !== null && "msg" in item) return String(item.msg)
      return t("Champ invalide")
    }).join(" ; ")
  }
  return t("La requête a échoué. Réessayez.")
}

export const UNAVAILABLE = msg("La plateforme est momentanément indisponible. Votre travail est conservé : réessayez dans un instant.")

/** Reads that wait for the end of an outage, one per address (a polling view never piles them up). */
const pending = new Map<string, Promise<unknown>>()

export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  // ADR-0043: « Vue étudiant » sends the student pages to the teacher's read-only routes.
  const routed = routeStudentView(path, method, body)
  if (routed?.kind === "local") return routed.data as T
  if (routed?.kind === "refused") throw new ApiError(403, routed.message, { code: "student_view" })
  if (routed?.kind === "fetch") {
    const data = await request<T>(routed.path, routed.method, routed.body)
    routed.after?.(data)
    return data
  }
  return request<T>(path, method, body)
}

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers["Content-Type"] = "application/json"
  if (method !== "GET") headers["X-CSRF-Token"] = csrfToken()
  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    return outage<T>(path, method)
  }
  // ADR-0038: a gateway error or a cut network never signs out; only a 401 does.
  if (isGatewayFailure(response)) return outage<T>(path, method)
  if (response.status === 401) {
    window.dispatchEvent(new Event("academy:unauthorized"))
    throw new ApiError(401, t("Votre session a expiré. Connectez-vous à nouveau."))
  }
  if (!response.ok) {
    let detail: unknown
    try { detail = (await response.json() as { detail?: unknown }).detail } catch { /* no body */ }
    throw new ApiError(response.status, messageOf(detail), detail)
  }
  return response.status === 204 ? undefined as T : await response.json() as T
}

/** A read waits for the platform and is sent again; a write fails at once (the page keeps its draft). */
function outage<T>(path: string, method: string): Promise<T> {
  const back = reportOutage()
  if (method !== "GET") return Promise.reject(new ApiError(503, t(UNAVAILABLE), { code: "unavailable" }))
  let retry = pending.get(path) as Promise<T> | undefined
  if (!retry) {
    retry = back.then(() => request<T>(path)).finally(() => pending.delete(path))
    pending.set(path, retry)
  }
  return retry
}
