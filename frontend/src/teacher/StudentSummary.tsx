import { Box, Grid, Heading, Stack, Text } from "@chakra-ui/react"
import { t } from "../i18n"
import { ActivityTime } from "../shared/ActivityTime"
import { formatPoints } from "../student/ui"
export type StudentSummaryData = {
  core_points: number; core_possible: number; bonus_points: number; bonus_possible: number
  completed: number; total: number; remaining: number; lessons_read: number; lessons_total: number
  attempted_unfinished: number; not_started_open: number; not_started_closed: number; not_started_locked: number
  help_pending_count: number; help_pending: { mission: string; created_at: string }[]; last_activity: string | null
}
/** The server supplies retained points and disjoint counts; this view never derives a grade. */
export function StudentSummary({ data, now }: { data: StudentSummaryData; now?: number }) {
  return <Stack as="section" gap="3" aria-label={t("Synthèse de l’étudiant")}>
    <Heading as="h4" size="sm">{t("Synthèse du parcours actuel")}</Heading>
    <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap="2">
      <Metric title={t("Points du socle conservés")} value={`${formatPoints(data.core_points)} / ${formatPoints(data.core_possible)}`} />
      <Metric title={t("Points bonus séparés")} value={`${formatPoints(data.bonus_points)} / ${formatPoints(data.bonus_possible)}`} />
      <Metric title={t("Réussies (socle et bonus)")} value={`${data.completed} / ${data.total}`} />
      <Metric title={t("Restant à réussir")} value={String(data.remaining)} />
    </Grid>
    <Text fontSize="xs" color="app.muted">{t("Les points partiels déjà obtenus sont conservés. Les leçons et les bonus restent distincts du socle.")}</Text>
    <Box as="dl" fontSize="sm" display="grid" gridTemplateColumns="1fr auto" gap="2">
      <Text as="dt">{t("Tentées, à reprendre")}</Text><Text as="dd">{data.attempted_unfinished}</Text>
      <Text as="dt">{t("Jamais tentées, ouvertes")}</Text><Text as="dd">{data.not_started_open}</Text>
      <Text as="dt">{t("Jamais tentées, blocs fermés")}</Text><Text as="dd">{data.not_started_closed}</Text>
      <Text as="dt">{t("Jamais tentées, prérequis manquant")}</Text><Text as="dd">{data.not_started_locked}</Text>
      <Text as="dt">{t("Leçons lues")}</Text><Text as="dd">{data.lessons_read} / {data.lessons_total}</Text>
    </Box>
    <Text fontSize="sm" color="app.muted">{t("Dernière réponse, indice ou demande d’aide")} : <ActivityTime value={data.last_activity} now={now} /></Text>
    <Text fontWeight="semibold" fontSize="sm">{t("Demandes d’aide en attente : {{count}}", { count: data.help_pending_count })}</Text>
    {data.help_pending_count === 0 ? <Text color="app.muted" fontSize="sm">{t("Aucune demande d’aide en attente.")}</Text> : <Stack as="ul" pl="4" gap="1" fontSize="sm">
      {data.help_pending.map((item, index) => <Box as="li" key={index}>{item.mission} · <ActivityTime value={item.created_at} now={now} /></Box>)}
      {data.help_pending_count > data.help_pending.length && <Text fontSize="xs" color="app.muted">{t("Les dix demandes les plus récentes sont affichées.")}</Text>}
    </Stack>}
  </Stack>
}
function Metric({ title, value }: { title: string; value: string }) {
  return <Box p="3" bg="app.sunken" rounded="lg"><Text fontSize="xs" color="app.muted">{title}</Text><Text fontWeight="semibold" css={{ fontVariantNumeric: "tabular-nums" }}>{value}</Text></Box>
}
