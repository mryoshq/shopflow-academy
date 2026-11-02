import { locale, t, useLanguage } from "../i18n"

export const ACTIVITY_TIMEZONE = "Africa/Casablanca"
export function validActivityDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}
/** Always use the teaching timezone, independently of the browser timezone. */
export function activityDateTime(value: string | null | undefined): string {
  const date = validActivityDate(value)
  return date ? new Intl.DateTimeFormat(locale(), { dateStyle: "medium", timeStyle: "short", timeZone: ACTIVITY_TIMEZONE }).format(date) : t("Aucune activité")
}
export function activityRelative(value: string | null | undefined, now = Date.now()): string {
  const date = validActivityDate(value)
  if (!date) return t("Aucune activité")
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000))
  const [amount, unit] = seconds < 60 ? [seconds, "second"] : seconds < 3600 ? [Math.floor(seconds / 60), "minute"] : seconds < 86400 ? [Math.floor(seconds / 3600), "hour"] : [Math.floor(seconds / 86400), "day"]
  return new Intl.RelativeTimeFormat(locale()).format(-Number(amount), unit as Intl.RelativeTimeFormatUnit)
}
export function ActivityTime({ value, now = Date.now(), relative = true }: { value: string | null | undefined; now?: number; relative?: boolean }) {
  useLanguage()
  const date = validActivityDate(value)
  if (!date) return <span>{t("Aucune activité")}</span>
  return <time dateTime={date.toISOString()} title={t("Heure du Maroc (Africa/Casablanca)")}>
    {relative ? `${activityRelative(value, now)} · ` : ""}{activityDateTime(value)}
  </time>
}
