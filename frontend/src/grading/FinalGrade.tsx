import { Badge, Box, Flex, Stack, Text } from "@chakra-ui/react"
import { formatNumber, msg, t } from "../i18n"

/** ADR-0046: the final grade on 20 as the server computes it (never stored). */
export type FinalPart = { points: number | null; possible: number; on20: number | null; pending: boolean; weight: number }
export type FinalGrade = {
  parts: Record<"course" | "workshops" | "project", FinalPart>
  base: number | null; project_bonus: number; course_bonus: number; course_bonus_points: number; course_bonus_possible: number
  raw: number | null; final: number | null; capped: boolean; provisional: boolean; pending: ("course" | "workshops" | "project")[]
}
export type GradingConfig = {
  weights: { course: number; workshops: number; project: number }; cap: number; project_bonus_max: number; course_bonus_max: number
  workshop_modules: string[] | null; visible_to_students: boolean
}

export const PART_LABELS = { course: msg("Cours"), workshops: msg("Ateliers"), project: "CampusEquip" } as const

const n = (value: number | null) => value === null ? "—" : formatNumber(value)

/** « 13,75 / 20 » (or « en attente »), with the « provisoire » badge. */
export function FinalValue({ grade }: { grade: FinalGrade }) {
  return <Flex gap="2" align="center" wrap="wrap" css={{ fontVariantNumeric: "tabular-nums" }}>
    <Text as="span" fontWeight="semibold">{grade.final === null ? t("en attente") : `${n(grade.final)} / 20`}</Text>
    {grade.provisional && <Badge size="sm" variant="subtle" colorPalette="saffron">{t("provisoire")}</Badge>}
  </Flex>
}

/** Each component of the final grade: parts on 20 with their weight, bonuses, cap and rounding. */
export function FinalBreakdown({ grade, config }: { grade: FinalGrade; config: GradingConfig }) {
  return <Stack gap="1.5" fontSize="sm" css={{ fontVariantNumeric: "tabular-nums" }} data-testid="final-breakdown">
    {(["course", "workshops", "project"] as const).map((key) => {
      const part = grade.parts[key]
      if (part.weight === 0) return null
      return <Flex key={key} justify="space-between" gap="3">
        <Text>{t(PART_LABELS[key])} <Text as="span" color="app.muted">({formatNumber(part.weight)} %)</Text></Text>
        <Text color={part.pending ? "app.muted" : undefined}>{part.pending ? t("en attente") : `${n(part.on20)} / 20`}</Text>
      </Flex>
    })}
    <Flex justify="space-between" gap="3" borderTopWidth="1px" borderColor="app.border" pt="1.5"><Text>{t("Socle")}</Text><Text>{grade.base === null ? t("en attente") : `${n(grade.base)} / 20`}</Text></Flex>
    <Flex justify="space-between" gap="3"><Text>{t("Bonus du projet (au plus +{{max}})", { max: formatNumber(config.project_bonus_max) })}</Text><Text>+{n(grade.project_bonus)}</Text></Flex>
    <Flex justify="space-between" gap="3"><Text>{t("Bonus du cours (au plus +{{max}})", { max: formatNumber(config.course_bonus_max) })}</Text><Text>+{n(grade.course_bonus)}</Text></Flex>
    <Flex justify="space-between" gap="3" fontWeight="semibold"><Text>{t("Note finale")}</Text><FinalValue grade={grade} /></Flex>
    <Box color="app.muted" fontSize="xs">
      {grade.capped && <Text>{t("Plafonnée à {{cap}}.", { cap: formatNumber(config.cap) })}</Text>}
      <Text>{t("Arrondie à 0,25 près.")}</Text>
      {grade.provisional && <Text>{t("Aperçu provisoire : une partie en attente ne compte pas comme zéro, les autres sont repondérées.")}</Text>}
    </Box>
  </Stack>
}
