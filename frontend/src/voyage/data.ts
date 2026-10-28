/**
 * Exact values of « Le voyage d'une donnée » (ADR-0033). The course may give them in a JSON file of its
 * folder (`experiences/voyage.json`, `data_file` of the lesson); they are merged over the defaults of the
 * application's own model (src/voyage/model.ts once the owner's sources are integrated).
 */
export type VoyageData = { [key: string]: VoyageValue }
export type VoyageValue = string | number | boolean | null | VoyageValue[] | { [key: string]: VoyageValue }

export const SCENE_COUNT = 7

/** Default values: replaced by the constants of the owner's model (src/model.ts) at integration. */
export const DEFAULT_VOYAGE: VoyageData = {}

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
