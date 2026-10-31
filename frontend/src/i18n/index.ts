import { useEffect, useState } from "react"
import i18next, { type TOptions } from "i18next"
import en from "./en.json"
import fr from "./fr.json"

/**
 * Interface languages (ADR-0040). French is the reference: its texts are the keys, so a French text with
 * no entry is shown as written. `en.json` gives the English text of every key (checked in CI); `fr.json`
 * only holds French plural forms. Course content is never translated: it stays in its own language.
 *
 * Adding Arabic later: add { code: "ar", dir: "rtl" } below and `ar.json`; `applyLanguage` already sets
 * `dir` on <html>, and the layout uses logical properties where the direction matters.
 */
export type Lang = "fr" | "en"
export type LanguageInfo = { code: Lang; label: string; locale: string; dir: "ltr" | "rtl" }
export const LANGUAGES: LanguageInfo[] = [
  { code: "fr", label: "Français", locale: "fr-FR", dir: "ltr" },
  { code: "en", label: "English", locale: "en-GB", dir: "ltr" },
]
const KEY = "shopflow:lang"
const EVENT = "shopflow:lang-change"

function valid(value: unknown): value is Lang {
  return LANGUAGES.some((item) => item.code === value)
}

/** Remembered choice, else the browser's language (English when it asks for English), else French. */
export function detectLanguage(): Lang {
  try {
    const stored = window.localStorage.getItem(KEY)
    if (valid(stored)) return stored
  } catch { /* storage blocked */ }
  try {
    const wanted = (navigator.languages?.length ? navigator.languages : [navigator.language]).map((item) => item.toLowerCase().slice(0, 2))
    const first = wanted.find((item) => valid(item))
    if (first) return first as Lang
  } catch { /* no navigator */ }
  return "fr"
}

void i18next.init({
  lng: typeof window === "undefined" ? "fr" : detectLanguage(),
  fallbackLng: "fr",
  resources: { fr: { translation: fr }, en: { translation: en } },
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
  initAsync: false,
})

export function language(): Lang {
  return valid(i18next.language) ? i18next.language : "fr"
}

export function info(lang: Lang = language()): LanguageInfo {
  return LANGUAGES.find((item) => item.code === lang)!
}

/** The locale for Intl (dates, numbers) in the current language. */
export function locale(): string {
  return info().locale
}

/** Translate a French text (the key). Interpolation: t("Bonjour, {{name}}", { name }). */
export function t(key: string, options?: TOptions): string {
  return i18next.t(key, options) as string
}

/** Marks a French text kept in a constant, translated where it is shown with t(); lets CI find the key. */
export function msg<T extends string>(key: T): T {
  return key
}

export function applyLanguage(lang: Lang = language()) {
  const root = document.documentElement
  root.lang = lang
  root.dir = info(lang).dir
}

export function setLanguage(lang: Lang) {
  try { window.localStorage.setItem(KEY, lang) } catch { /* not remembered, still applied */ }
  void i18next.changeLanguage(lang)
  applyLanguage(lang)
  window.dispatchEvent(new CustomEvent<Lang>(EVENT, { detail: lang }))
}

/** Current language; the component re-renders when it changes. */
export function useLanguage(): Lang {
  const [lang, set] = useState(language)
  useEffect(() => {
    const sync = (event: Event) => set((event as CustomEvent<Lang>).detail)
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])
  return lang
}

// Formatting with Intl, in the current language ------------------------------------------------

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale(), options).format(value)
}

export function formatDate(value: string | number | Date, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  return new Intl.DateTimeFormat(locale(), options).format(new Date(value))
}

export function formatTime(value: string | number | Date): string {
  return new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

export function formatDateTime(value: string | number | Date): string {
  return new Intl.DateTimeFormat(locale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

/**
 * Plural: tn("{{count}} mission réussie", n). The key is the French singular; both fr.json and en.json
 * give `<key>_one` and `<key>_other` (French « one » covers 0 and 1, like the former `n > 1` rule).
 */
export function tn(key: string, count: number, options?: TOptions): string {
  return i18next.t(key, { ...options, count }) as string
}
