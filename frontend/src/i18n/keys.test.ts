import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { expect, it } from "vitest"
import en from "./en.json"
import fr from "./fr.json"

/**
 * ADR-0040: every text of the interface has its English version. A key used in the code (t("…"),
 * tn("…"), msg("…")) and missing from en.json fails CI, as does a plural without its forms, a
 * translation whose {{placeholders}} differ, or an entry no longer used. Course content (the voyage
 * experience) and tests are not scanned.
 */
const SRC = resolve(process.cwd(), "src")
const SKIP = /(\.test\.tsx?$|[\\/]voyage[\\/]|[\\/]i18n[\\/])/
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(ts|tsx)$/.test(name) && !SKIP.test(path) ? [path] : []
  })
}
const CALL = /\b(t|tn|msg)\(\s*("(?:[^"\\]|\\.)*")/g
const plain = new Set<string>(), plural = new Set<string>()
for (const file of files(SRC)) {
  for (const match of readFileSync(file, "utf8").matchAll(CALL)) (match[1] === "tn" ? plural : plain).add(JSON.parse(match[2]) as string)
}
const english = en as Record<string, string>
const french = fr as Record<string, string>
const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()

it("scans the interface", () => {
  expect(plain.size).toBeGreaterThan(1000)
  expect(plural.size).toBeGreaterThan(15)
})

it("every key used in the code has an English text with the same placeholders", () => {
  const missing = [...plain].filter((key) => !english[key])
  expect(missing, `missing in en.json:\n${missing.join("\n")}`).toEqual([])
  const mismatched = [...plain].filter((key) => english[key] && placeholders(key).join() !== placeholders(english[key]).join())
  expect(mismatched).toEqual([])
})

it("every plural has its one/other forms in French and English", () => {
  const forms = (key: string) => [`${key}_one`, `${key}_other`]
  const missing = [...plural].flatMap(forms).filter((key) => !english[key] || !french[key])
  expect(missing, `missing plural forms:\n${missing.join("\n")}`).toEqual([])
  for (const key of [...plural].flatMap(forms)) {
    expect(placeholders(english[key]).filter((p) => p !== "count"), key).toEqual(placeholders(french[key]).filter((p) => p !== "count"))
  }
})

it("no entry is left over once its text is gone from the code", () => {
  const used = new Set([...plain, ...[...plural].flatMap((key) => [`${key}_one`, `${key}_other`])])
  expect(Object.keys(english).filter((key) => !used.has(key))).toEqual([])
  expect(Object.keys(french).filter((key) => !used.has(key))).toEqual([])
})
