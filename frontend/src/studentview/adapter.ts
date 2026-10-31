import { msg, t } from "../i18n"

/**
 * ADR-0043 « Vue étudiant »: while it is on, the student pages' requests go to the teacher's read-only
 * routes of the class. Reads are redirected, an answer is checked without being stored, and every
 * other write is refused here, before reaching the server: nothing is ever recorded.
 */
export const READ_ONLY = msg("Vue étudiant : rien n’est enregistré.")

type Active = { base: string; all: boolean; hints: Map<number, number> }
let active: Active | null = null

export function enterStudentView(assignmentId: number, all: boolean): void {
  active = { base: `/teacher/classes/${assignmentId}/student-view`, all, hints: new Map() }
}

export function leaveStudentView(): void {
  active = null
}

export function studentViewActive(): boolean {
  return active !== null
}

export type Routed =
  | { kind: "fetch"; path: string; method: string; body?: unknown; after?: (data: unknown) => void }
  | { kind: "local"; data: unknown }
  | { kind: "refused"; message: string }

/** null: not a student request, or the view is off (the request goes out unchanged). */
export function routeStudentView(path: string, method: string, body?: unknown): Routed | null {
  if (!active || !path.startsWith("/student/")) return null
  const { base, all, hints } = active
  const query = all ? "?all=true" : ""
  if (method === "GET" && path === "/student/dashboard") return { kind: "fetch", path: `${base}/dashboard${query}`, method }
  if (method === "GET" && path === "/student/project") return { kind: "fetch", path: `${base}/project`, method }
  const mission = /^\/student\/missions\/(\d+)(\/.*)?$/.exec(path)
  if (mission) {
    const id = Number(mission[1])
    const rest = mission[2] ?? ""
    if (method === "GET" && rest === "") return { kind: "fetch", path: `${base}/missions/${id}${query}`, method }
    if (method === "GET" && rest === "/attempts") return { kind: "local", data: [] }
    if (method === "POST" && rest === "/attempts") {
      const answer = (body as { answer?: unknown } | undefined)?.answer ?? {}
      return { kind: "fetch", path: `${base}/missions/${id}/check${query}`, method, body: { answer } }
    }
    if (method === "POST" && rest === "/understood") return { kind: "fetch", path: `${base}/missions/${id}/check${query}`, method, body: {} }
    if (method === "POST" && rest === "/hints") {
      return { kind: "fetch", path: `${base}/missions/${id}/hints${query}`, method, body: { shown: hints.get(id) ?? 0 },
        after: (data) => hints.set(id, (data as { hints?: unknown[] }).hints?.length ?? 0) }
    }
    if (method === "POST" && rest.startsWith("/runs/")) return { kind: "fetch", path: `${base}/missions/${id}${rest}${query}`, method }
  }
  return { kind: "refused", message: t(READ_ONLY) }
}
