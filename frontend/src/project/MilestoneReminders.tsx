import { Badge, Box, Flex, Stack, Switch, Text } from "@chakra-ui/react"
import { locale, msg, t, tn } from "../i18n"
import type { ReminderPlan } from "./types"

/**
 * Send times in Morocco time (ADR-0045). The server gives the wall-clock time (« 2026-11-18T09:00 »), computed
 * with its own time zone rules: a browser may carry older rules for Morocco, so nothing is converted here.
 */
export function moroccoTime(local: string): string {
  return new Intl.DateTimeFormat(locale(), { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    .format(new Date(`${local}:00Z`))
}

const STATUS: Record<ReminderPlan["items"][number]["status"], { label: string; palette: string }> = {
  planned: { label: msg("Prévu"), palette: "brand" }, sent: { label: msg("Envoyé"), palette: "green" },
  passed: { label: msg("Non envoyé (passé)"), palette: "gray" }, off: { label: msg("Désactivé"), palette: "gray" },
}

/** ADR-0045, Projet > Jalons: the planned reminders of a milestone and the switch to turn them off. */
export function MilestoneReminders({ plan, readOnly, onToggle }: { plan: ReminderPlan; readOnly: boolean; onToggle: (enabled: boolean) => void }) {
  if (plan.items.length === 0) return <Text fontSize="sm" color="app.muted">{t("Pas de rappel automatique : ce jalon n’a pas de date limite.")}</Text>
  return <Box borderTopWidth="1px" borderColor="app.border" pt="3" data-testid="milestone-reminders">
    <Stack gap="2">
      <Flex gap="3" align="center" wrap="wrap">
        <Text fontWeight="semibold" fontSize="sm" flex="1">{t("Rappels automatiques")}</Text>
        {!readOnly && <Switch.Root checked={plan.enabled} onCheckedChange={(event) => onToggle(event.checked)} colorPalette="brand" size="sm">
          <Switch.HiddenInput /><Switch.Control><Switch.Thumb /></Switch.Control>
          <Switch.Label fontSize="sm">{plan.enabled ? t("Activés") : t("Désactivés")}</Switch.Label>
        </Switch.Root>}
      </Flex>
      <Text fontSize="xs" color="app.muted">{plan.pairing
        ? t("Envoyés à 9 h (heure du Maroc) aux étudiants sans binôme et non inscrits au binôme surprise.")
        : t("Envoyés à 9 h (heure du Maroc) aux membres des binômes qui n’ont encore rien déposé.")}</Text>
      <Stack as="ul" listStyleType="none" p="0" m="0" gap="1.5">{plan.items.map((item) => <Flex as="li" key={item.key} gap="2" align="center" wrap="wrap" fontSize="sm">
        <Text minW="24">{tn("{{count}} jour avant", item.days)}</Text>
        <Text color="app.muted" flex="1">{moroccoTime(item.local)}</Text>
        <Badge variant="subtle" colorPalette={STATUS[item.status].palette}>{t(STATUS[item.status].label)}{item.status === "sent" ? ` · ${tn("{{count}} envoi", item.sent)}` : ""}</Badge>
      </Flex>)}</Stack>
    </Stack>
  </Box>
}
