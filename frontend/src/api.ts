export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
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
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      if (typeof item === "object" && item !== null && "msg" in item) return String(item.msg)
      return "Champ invalide"
    }).join(" ; ")
  }
  return "La requête a échoué. Réessayez."
}

export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers["Content-Type"] = "application/json"
  if (method !== "GET") headers["X-CSRF-Token"] = csrfToken()
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 401) {
    window.dispatchEvent(new Event("academy:unauthorized"))
    throw new ApiError(401, "Votre session a expiré. Connectez-vous à nouveau.")
  }
  if (!response.ok) {
    let detail: unknown
    try { detail = (await response.json() as { detail?: unknown }).detail } catch { /* no body */ }
    throw new ApiError(response.status, messageOf(detail))
  }
  return response.status === 204 ? undefined as T : await response.json() as T
}
