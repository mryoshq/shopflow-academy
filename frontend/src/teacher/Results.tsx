import { useCallback, useEffect, useState } from "react"
import { Box, Button, Flex, Heading, Stack, Table, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { ErrorState, Icon, LoadingState, Panel, formatPoints } from "../student/ui"
import type { Overview } from "./TeacherDashboard"

/** Grades of the class (best attempt kept, bonus apart) and CSV export for Excel. */
export function Results({ assignmentId }: { assignmentId: number }) {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try { setData(await api<Overview>(`/teacher/classes/${assignmentId}/overview`)) }
    catch (reason) { if (!(reason instanceof ApiError && reason.status === 401)) setError("Impossible de charger les résultats.") }
  }, [assignmentId])
  useEffect(() => { void load() }, [load])

  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (!data) return <LoadingState label="Chargement des résultats…" />
  const rows = [...data.students].sort((a, b) => a.display_name.localeCompare(b.display_name, "fr"))
  return <Stack gap="4">
    <Flex gap="3" justify="space-between" align="center" wrap="wrap">
      <Stack gap="1">
        <Heading as="h3" size="md">Notes de la classe</Heading>
        <Text fontSize="sm" color="app.muted">Meilleur essai de chaque mission. Les bonus sont comptés à part. Version {data.version}.</Text>
      </Stack>
      <Flex gap="2">
        <Button size="sm" variant="outline" onClick={() => void load()}><Icon name="retry" size={16} />Actualiser</Button>
        <Button size="sm" colorPalette="brand" asChild><a href={`/api/v1/teacher/classes/${assignmentId}/export.csv`} download>Exporter les notes (CSV)</a></Button>
      </Flex>
    </Flex>
    <Panel p="0" overflow="hidden">
      <Box overflowX="auto" tabIndex={0} role="region" aria-label="Tableau des notes (défilement horizontal)">
        <Table.Root size="sm" variant="line" aria-label="Notes de la classe">
          <Table.Header><Table.Row bg="app.sunken">{["Étudiant", "Note", "Bonus", "Missions réussies"].map((label) => <Table.ColumnHeader key={label} scope="col">{label}</Table.ColumnHeader>)}</Table.Row></Table.Header>
          <Table.Body>{rows.map((row) => <Table.Row key={row.id}>
            <Table.Cell fontWeight="semibold">{row.display_name}</Table.Cell>
            <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{formatPoints(row.core_points)} / {row.core_possible}</Table.Cell>
            <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{row.bonus_points > 0 ? `+${formatPoints(row.bonus_points)}` : "—"}</Table.Cell>
            <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{row.completed} / {row.total}</Table.Cell>
          </Table.Row>)}</Table.Body>
        </Table.Root>
      </Box>
      {rows.length === 0 && <Text p="5" color="app.muted">Aucun étudiant dans la classe.</Text>}
    </Panel>
  </Stack>
}
