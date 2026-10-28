import { useEffect, useState, type FormEvent } from "react"
import { Badge, Box, Button, Field, Flex, Heading, Input, NativeSelect, Stack, Table, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { ErrorState, Icon, LoadingState, Panel } from "../student/ui"

type Unsuccessful = { mission_version_id: number; title: string; best_points: number; possible: number; attempts: number }
export type ResultStudent = {
  id: number; display_name: string; core_points: number; core_possible: number; bonus_points: number
  percentage: number | null; needs_support: boolean; completed: number; total: number; unsuccessful_count: number
  unsuccessful_missions: Unsuccessful[]
}
export type ResultsData = {
  assignment_id: number; cohort: string; course_title: string; version: number; threshold: number; students: ResultStudent[]
  weakest_missions: { mission_version_id: number; title: string; completed: number; total: number; unsuccessful_count: number; success_percentage: number }[]
}
type Sort = "support" | "name" | "percentage_asc" | "percentage_desc"
const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 })

/** Results are a read-only projection: the platform owns every score and support flag. */
export function Results({ assignmentId }: { assignmentId: number }) {
  const [data, setData] = useState<ResultsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [threshold, setThreshold] = useState(50)
  const [draftThreshold, setDraftThreshold] = useState("50")
  const [sort, setSort] = useState<Sort>("support")
  const [supportOnly, setSupportOnly] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    setError(null); setData(null)
    void api<ResultsData>(`/teacher/classes/${assignmentId}/results?threshold=${threshold}`)
      .then(next => { if (active) setData(next) })
      .catch(reason => {
        if (active && !(reason instanceof ApiError && reason.status === 401)) setError("Impossible de charger les résultats.")
      })
    return () => { active = false }
  }, [assignmentId, threshold, refresh])

  function applyThreshold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(draftThreshold)
    if (draftThreshold.trim() && Number.isFinite(value) && value >= 0 && value <= 100) setThreshold(value)
  }

  const rows = (data?.students ?? []).filter(row => !supportOnly || row.needs_support).sort((a, b) => {
    if (sort === "support" && a.needs_support !== b.needs_support) return a.needs_support ? -1 : 1
    if (sort === "percentage_asc" || sort === "percentage_desc") {
      if (a.percentage === null && b.percentage !== null) return 1
      if (b.percentage === null && a.percentage !== null) return -1
      const difference = (a.percentage ?? 0) - (b.percentage ?? 0)
      if (difference) return sort === "percentage_asc" ? difference : -difference
    }
    return a.display_name.localeCompare(b.display_name, "fr")
  })
  return <Stack gap="5" minW="0">
    <Flex gap="3" justify="space-between" align="center" wrap="wrap">
      <Stack gap="1"><Heading as="h3" size="lg">Notes de la classe</Heading>
        <Text fontSize="sm" color="app.muted">Points retenus par la plateforme, dégressivité comprise. Bonus séparés du pourcentage.{data ? ` Version ${data.version}.` : ""}</Text>
      </Stack>
      <Flex gap="2" wrap="wrap">
        <Button size="sm" variant="outline" onClick={() => setRefresh(value => value + 1)}><Icon name="retry" size={16} />Actualiser</Button>
        {data && <Button size="sm" colorPalette="brand" asChild><a href={`/api/v1/teacher/classes/${assignmentId}/results/export.csv?threshold=${data.threshold}`} download>Exporter les notes (CSV)</a></Button>}
      </Flex>
    </Flex>
    <Panel minW="0">
      <Stack gap="4">
        <form onSubmit={applyThreshold}>
          <Flex gap="3" align="end" wrap="wrap">
            <Field.Root maxW="64" required><Field.Label>Seuil d’accompagnement (%)</Field.Label>
              <Input type="number" value={draftThreshold} min={0} max={100} step="any" required borderColor="app.muted" onChange={event => setDraftThreshold(event.target.value)} />
            </Field.Root><Button type="submit" size="sm" colorPalette="brand">Appliquer le seuil</Button>
          </Flex>
        </form>
        <Text fontSize="sm" color="app.muted">« À accompagner » signale un pourcentage strictement inférieur à {data?.threshold ?? threshold} %. Missions principales uniquement dans les compteurs et les points faibles ; leçons et bonus exclus. Les missions non commencées restent à réussir. Le CSV porte sur toute la classe avec le seuil appliqué.</Text>
        <Flex gap="4" wrap="wrap">
          <Field.Root maxW="72"><Field.Label>Trier les étudiants</Field.Label>
            <NativeSelect.Root><NativeSelect.Field value={sort} onChange={event => setSort(event.target.value as Sort)}>
              <option value="support">À accompagner d’abord</option><option value="name">Nom</option><option value="percentage_asc">Pourcentage croissant</option><option value="percentage_desc">Pourcentage décroissant</option>
            </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
          </Field.Root>
          <Field.Root maxW="72"><Field.Label>Afficher les étudiants</Field.Label>
            <NativeSelect.Root><NativeSelect.Field value={supportOnly ? "support" : "all"} onChange={event => setSupportOnly(event.target.value === "support")}>
              <option value="all">Toute la classe</option><option value="support">À accompagner uniquement</option>
            </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
          </Field.Root>
        </Flex>
      </Stack>
    </Panel>
    {error && <ErrorState message={error} onRetry={() => setRefresh(value => value + 1)} />}
    {!data && !error && <LoadingState label="Chargement des résultats…" />}
    {data && <>
      <Text role="status" fontSize="sm" color="app.muted">{rows.length} étudiant{rows.length > 1 ? "s" : ""} affiché{rows.length > 1 ? "s" : ""} sur {data.students.length} · {data.students.filter(row => row.needs_support).length} à accompagner</Text>
      <Panel p="0" overflow="hidden">
        <Box overflowX="auto" tabIndex={0} role="region" aria-label="Tableau des notes (défilement horizontal)">
          <Table.Root size="sm" variant="line" aria-label="Notes de la classe">
            <Table.Header><Table.Row bg="app.sunken">{["Étudiant", "Points principaux", "Points bonus", "Pourcentage", "Missions réussies", "Missions non réussies", "Accompagnement"].map(label => <Table.ColumnHeader key={label} scope="col">{label}</Table.ColumnHeader>)}</Table.Row></Table.Header>
            <Table.Body>{rows.map(row => <Table.Row key={row.id} bg={row.needs_support ? "saffron.subtle" : undefined}>
              <Table.Cell fontWeight="semibold" minW="32" overflowWrap="anywhere">{row.display_name}</Table.Cell>
              <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{number.format(row.core_points)} / {number.format(row.core_possible)}</Table.Cell>
              <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{number.format(row.bonus_points)}</Table.Cell>
              <Table.Cell css={{ fontVariantNumeric: "tabular-nums" }}>{row.percentage === null ? "Non calculable" : `${number.format(row.percentage)} %`}</Table.Cell>
              <Table.Cell>{row.completed} / {row.total}</Table.Cell>
              <Table.Cell minW="48">{row.unsuccessful_count ? <details><summary>{row.unsuccessful_count} mission{row.unsuccessful_count > 1 ? "s" : ""} à réussir</summary>
                <Box as="ul" pl="4" mt="2">{row.unsuccessful_missions.map(mission => <Box as="li" key={mission.mission_version_id} mb="2">
                  <Text>{mission.title}</Text><Text fontSize="xs" color="app.muted">{mission.attempts ? `${number.format(mission.best_points)} / ${number.format(mission.possible)} points retenus` : "Non commencée"}</Text>
                </Box>)}</Box>
              </details> : "Toutes réussies"}</Table.Cell>
              <Table.Cell>{row.needs_support ? <Badge colorPalette="saffron" variant="solid" gap="1"><Icon name="alert" size={14} />À accompagner</Badge> : row.percentage === null ? "Sans mission notée" : "—"}</Table.Cell>
            </Table.Row>)}</Table.Body>
          </Table.Root>
        </Box>
        {!rows.length && <Text p="5" color="app.muted">{data.students.length ? "Aucun étudiant ne correspond à ce filtre." : "Aucun étudiant dans la classe."}</Text>}
      </Panel>
      <Panel minW="0">
        <Stack gap="3"><Heading as="h4" size="md">Missions les moins réussies · top 5</Heading>
          <Text fontSize="sm" color="app.muted">Sur toute la classe, quel que soit le filtre des étudiants. Le taux mesure les réussites complètes, même si leurs points sont dégressifs.</Text>
          {data.weakest_missions.length ? <Box as="ol" pl="5">{data.weakest_missions.map(mission => <Box as="li" key={mission.mission_version_id} mb="3">
            <Text fontWeight="semibold" overflowWrap="anywhere">{mission.title}</Text><Text color="app.muted" fontSize="sm">{mission.completed} / {mission.total} réussites · {number.format(mission.success_percentage)} % · {mission.unsuccessful_count} à réussir</Text>
          </Box>)}</Box> : <Text color="app.muted">{data.students.length ? "Aucun point faible à signaler sur les missions principales." : "Les points faibles apparaîtront quand la classe aura des étudiants."}</Text>}
        </Stack>
      </Panel>
    </>}
  </Stack>
}
