import { useState } from "react"
import { Badge, Box, Button, Flex, Heading, Stack, Table, Text } from "@chakra-ui/react"
import { formatNumber, t } from "../i18n"
import { Panel } from "../student/ui"
import { FinalBreakdown, FinalValue, PART_LABELS, type FinalGrade, type GradingConfig } from "./FinalGrade"

type Row = { id?: number; display_name: string; final_grade?: FinalGrade }

const part = (grade: FinalGrade, key: "course" | "workshops" | "project") =>
  grade.parts[key].pending ? <Text as="span" color="app.muted">{t("en attente")}</Text> : formatNumber(grade.parts[key].on20 ?? 0)

/** ADR-0046, Résultats: the final grade on 20 of each student, with every component visible. */
export function FinalGradesPanel({ assignmentId, students, config }: { assignmentId: number; students: Row[]; config: GradingConfig }) {
  const [open, setOpen] = useState<string | null>(null)
  const rows = students.filter((row) => row.final_grade)
  if (rows.length === 0) return null
  const provisional = rows.some((row) => row.final_grade!.provisional)
  const w = config.weights
  const selected = rows.find((row) => String(row.id ?? row.display_name) === open)
  return <Panel minW="0" as="section" aria-labelledby="final-grade-title"><Stack gap="3">
    <Flex gap="3" justify="space-between" align="center" wrap="wrap">
      <Stack gap="1">
        <Flex gap="2" align="center"><Heading as="h3" size="md" id="final-grade-title">{t("Note finale sur 20")}</Heading>
          {provisional && <Badge variant="subtle" colorPalette="saffron">{t("provisoire")}</Badge>}</Flex>
        <Text fontSize="sm" color="app.muted">{t("Socle = {{course}} % cours + {{workshops}} % ateliers + {{project}} % CampusEquip, chaque partie sur 20 ; bonus au plus +{{pb}} (projet) et +{{cb}} (cours) ; plafond {{cap}} ; arrondi à 0,25. Réglages > Notes.",
          { course: formatNumber(w.course), workshops: formatNumber(w.workshops), project: formatNumber(w.project), pb: formatNumber(config.project_bonus_max),
            cb: formatNumber(config.course_bonus_max), cap: formatNumber(config.cap) })}</Text>
        <Text fontSize="sm" color="app.muted">{config.visible_to_students ? t("Visible des étudiants.") : t("Non visible des étudiants.")}</Text>
      </Stack>
      <Button size="sm" variant="outline" asChild><a href={`/api/v1/teacher/classes/${assignmentId}/results/final.csv`} download>{t("Exporter la note finale (CSV)")}</a></Button>
    </Flex>
    <Box overflowX="auto" tabIndex={0} role="region" aria-label={t("Note finale de la classe")} borderWidth="1px" borderColor="app.border" rounded="lg">
      <Table.Root size="sm" css={{ fontVariantNumeric: "tabular-nums" }}>
        <Table.Header><Table.Row>
          <Table.ColumnHeader>{t("Étudiant")}</Table.ColumnHeader>
          {(["course", "workshops", "project"] as const).map((key) => <Table.ColumnHeader key={key}>{t(PART_LABELS[key])} /20</Table.ColumnHeader>)}
          <Table.ColumnHeader>{t("Socle")}</Table.ColumnHeader><Table.ColumnHeader>{t("Bonus")}</Table.ColumnHeader>
          <Table.ColumnHeader>{t("Note finale")}</Table.ColumnHeader>
        </Table.Row></Table.Header>
        <Table.Body>{rows.map((row) => {
          const grade = row.final_grade!
          const key = String(row.id ?? row.display_name)
          return <Table.Row key={key} bg={open === key ? "brand.subtle" : undefined}>
            <Table.Cell><Flex gap="2" align="center" wrap="wrap"><Text as="span" fontWeight="semibold">{row.display_name}</Text>
              <Button size="xs" variant="outline" aria-expanded={open === key} aria-controls="final-detail" onClick={() => setOpen(open === key ? null : key)}
                aria-label={t("Détail de la note de {{name}}", { name: row.display_name })}>{t("Détail")}</Button></Flex></Table.Cell>
            <Table.Cell>{part(grade, "course")}</Table.Cell><Table.Cell>{part(grade, "workshops")}</Table.Cell><Table.Cell>{part(grade, "project")}</Table.Cell>
            <Table.Cell>{grade.base === null ? "—" : formatNumber(grade.base)}</Table.Cell>
            <Table.Cell>+{formatNumber(grade.project_bonus + grade.course_bonus)}</Table.Cell>
            <Table.Cell><FinalValue grade={grade} /></Table.Cell>
          </Table.Row>
        })}</Table.Body>
      </Table.Root>
    </Box>
    {selected && <Box id="final-detail" borderWidth="1px" borderColor="app.border" rounded="lg" p="4" bg="app.sunken" maxW="md">
      <Text fontWeight="semibold" mb="2">{t("Détail : {{name}}", { name: selected.display_name })}</Text>
      <FinalBreakdown grade={selected.final_grade!} config={config} />
    </Box>}
  </Stack></Panel>
}
