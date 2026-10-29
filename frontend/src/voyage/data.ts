import { BASE, BATCH, files } from "./model"

/**
 * Exact values of « Le voyage d'une donnée » (ADR-0033). The course may give them in a JSON file of its
 * folder (`experiences/voyage.json`, `data_file` of the lesson); they are merged over the defaults taken from
 * the owner's model (model.ts): `base` and `batch` (numbers of the batch), `files` (source cards by name).
 */
export type VoyageData = { [key: string]: VoyageValue }
export type VoyageValue = string | number | boolean | null | VoyageValue[] | { [key: string]: VoyageValue }

export const SCENE_COUNT = 7

/** Default values: a copy of the constants of the owner's model, taken before any course value is applied. */
export const DEFAULT_VOYAGE: VoyageData = JSON.parse(JSON.stringify({
  base: BASE, batch: BATCH, files: Object.fromEntries(files.map((file) => [file.name, { count: file.count, description: file.description, content: file.content }])),
})) as VoyageData

function isObject(value: unknown): value is Record<string, VoyageValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Deep merge: objects are merged key by key, arrays and plain values from the course replace the defaults. */
export function mergeVoyageData(defaults: VoyageData, course: unknown): VoyageData {
  if (!isObject(course)) return defaults
  const result: VoyageData = { ...defaults }
  for (const [key, value] of Object.entries(course)) {
    result[key] = isObject(value) && isObject(defaults[key]) ? mergeVoyageData(defaults[key] as VoyageData, value) : value
  }
  return result
}

/** Starting scene from an address such as "#/voyage" or "#/voyage/3" (1 to 7). */
export function sceneFrom(hash: string): number | null {
  const match = /^#\/voyage(?:\/([1-7]))?$/.exec(hash)
  if (!match) return null
  return match[1] ? Number(match[1]) : 1
}

function sameShape(target: Record<string, unknown>, values: VoyageData) {
  // Only keys the model knows, with the same type: a course file can never break the simulation.
  for (const [key, value] of Object.entries(values)) {
    const current = target[key]
    if (current === undefined) continue
    if (Array.isArray(current) ? Array.isArray(value) : typeof current === typeof value && current !== null && value !== null) target[key] = value
  }
}

/** Applies merged values to the model used by the simulation (counters, cache, queue, source cards). */
export function applyVoyageData(data: VoyageData): void {
  if (isObject(data.base)) sameShape(BASE as unknown as Record<string, unknown>, data.base as VoyageData)
  if (isObject(data.batch)) sameShape(BATCH as unknown as Record<string, unknown>, data.batch as VoyageData)
  if (isObject(data.files)) for (const file of files) {
    const values = (data.files as VoyageData)[file.name]
    if (isObject(values)) sameShape(file as unknown as Record<string, unknown>, values)
  }
}
