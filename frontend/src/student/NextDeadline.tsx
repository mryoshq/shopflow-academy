import { useEffect, useState } from "react"
import { Badge, Button, Flex, Stack, Text } from "@chakra-ui/react"
import { locale, t } from "../i18n"
import { Icon, Panel } from "./ui"

export type NextDeadline = { milestone_id: number; title: string; due_at: string; due_local: string; submitted: boolean; link: string }

/** « dans 2 j 5 h », « dans 3 h 10 », « dans 12 min » (time left, independent of the browser's time zone rules). */
export function timeLeft(dueAt: string, now: number): string {
  const minutes = Math.max(0, Math.floor((new Date(dueAt).getTime() - now) / 60000))
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), rest = minutes % 60
  if (days > 0) return t("dans {{days}} j {{hours}} h", { days, hours })
  if (hours > 0) return t("dans {{hours}} h {{minutes}}", { hours, minutes: String(rest).padStart(2, "0") })
  return t("dans {{minutes}} min", { minutes: rest })
}

/** The Morocco date and time the server computed (« 2026-11-21T23:59 »), never converted by the browser. */
export function dueText(local: string): string {
  const date = new Date(`${local}:00Z`)
  return new Intl.DateTimeFormat(locale(), { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(date)
}

/** ADR-0047: countdown to the next project deadline on the student dashboard. */
export function NextDeadlinePanel({ deadline, navigate }: { deadline: NextDeadline; navigate: (path: string) => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return <Panel as="section" aria-label={t("Prochaine échéance")}>
    <Stack gap="2">
      <Flex gap="2" align="center"><Icon name="clock" size={16} /><Text fontWeight="semibold" flex="1">{t("Prochaine échéance")}</Text>
        {deadline.submitted && <Badge colorPalette="green" variant="subtle">{t("Déposé")}</Badge>}</Flex>
      <Text fontWeight="medium">{deadline.title}</Text>
      <Text fontSize="2xl" fontWeight="bold" lineHeight="1.1" color="brand.fg" css={{ fontVariantNumeric: "tabular-nums" }}>{timeLeft(deadline.due_at, now)}</Text>
      <Text fontSize="sm" color="app.muted">{t("Attendu le {{date}} (heure du Maroc).", { date: dueText(deadline.due_local) })}</Text>
      <Text fontSize="sm">{deadline.submitted ? t("Votre binôme a déposé une version : vous pouvez encore l’améliorer.") : t("Un premier dépôt, même partiel, vous met sur les rails.")}</Text>
      <Button size="sm" variant="outline" alignSelf="start" onClick={() => navigate("/projet")}>{t("Ouvrir l’espace projet")}<Icon name="arrow-right" size={16} /></Button>
    </Stack>
  </Panel>
}
