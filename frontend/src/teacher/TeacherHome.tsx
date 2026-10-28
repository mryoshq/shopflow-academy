import { useCallback, useEffect, useState } from "react"
import { Badge, Box, Flex, Stack, Tabs, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { TeacherStudio, Advanced } from "../TeacherStudio"
import { ErrorState, LoadingState, Panel } from "../student/ui"
import { ClassTimeline } from "./ClassTimeline"
import { AutoPlanPanel, LivePanel, NotificationSettingsPanel } from "./LivePanel"
import { ObserversPanel } from "./ObserversPanel"
import { TeacherProject } from "../project/TeacherProject"
import { Results } from "./Results"
import { TeacherDashboard } from "./TeacherDashboard"

export type MainState = {
  course: { id: number; slug: string; title: string; status: "draft" | "published" | "archived" } | null
  cohort: { id: number; label: string; student_count: number } | null
  assignment_id: number | null
  assigned_version: number | null
  latest_version: number | null
}

/** One class, one course: "Mon cours", "Ma classe", "Résultats", plus the read-only "Observateurs" (ADR-0025). */
export function TeacherHome() {
  const [main, setMain] = useState<MainState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState("cours")

  const setup = useCallback(async () => {
    setError(null)
    try { setMain(await api<MainState>("/teacher/main/setup", "POST")) }
    catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) return
      setError(reason instanceof ApiError && reason.status === 409
        ? "Le cours principal appartient à un autre compte enseignant."
        : "Impossible de préparer votre classe et votre cours.")
    }
  }, [])
  const reload = useCallback(async () => {
    try { setMain(await api<MainState>("/teacher/main")) } catch { /* the next action retries */ }
  }, [])
  useEffect(() => { void setup() }, [setup])

  if (error) return <ErrorState message={error} onRetry={() => void setup()} />
  if (!main?.course || !main.cohort) return <LoadingState label="Préparation de votre classe…" />

  const noClass = <Panel><Stack gap="2">
    <Text fontWeight="semibold">Votre cours n’est pas encore publié</Text>
    <Text color="app.muted">Dans « Mon cours », onglet Publication, cliquez sur « Publier pour la classe ». Les blocs arrivent fermés : vous les ouvrirez ici, un par un.</Text>
  </Stack></Panel>

  return <Tabs.Root value={tab} onValueChange={(event) => setTab(event.value)} variant="line" colorPalette="brand" lazyMount>
    <Flex gap="3" align="center" wrap="wrap" mb="2">
      <Badge colorPalette="brand" variant="subtle" rounded="full">{main.cohort.label} · {main.cohort.student_count} étudiants</Badge>
      <Text fontSize="sm" color="app.muted">{main.course.title}{main.assigned_version ? ` · version ${main.assigned_version} pour la classe` : " · pas encore publié"}</Text>
    </Flex>
    <Tabs.List aria-label="Espace enseignant">
      <Tabs.Trigger value="cours">Mon cours</Tabs.Trigger>
      <Tabs.Trigger value="classe">Ma classe</Tabs.Trigger>
      <Tabs.Trigger value="resultats">Résultats</Tabs.Trigger>
      <Tabs.Trigger value="projet">Projet</Tabs.Trigger>
      <Tabs.Trigger value="observateurs">Observateurs</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="cours" pt="6"><TeacherStudio mainCourseId={main.course.id} onPublished={() => void reload()} /></Tabs.Content>
    <Tabs.Content value="classe" pt="6">
      <Stack gap="8">
        {main.assignment_id ? <>
          <LivePanel assignmentId={main.assignment_id} />
          <ClassTimeline assignmentId={main.assignment_id} />
          <AutoPlanPanel assignmentId={main.assignment_id} />
          <TeacherDashboard assignmentId={main.assignment_id} />
        </> : noClass}
        <Box borderTopWidth="1px" borderColor="app.border" pt="4">
          <Advanced label="Réglages des notifications"><NotificationSettingsPanel /></Advanced>
          <Advanced label="Options avancées : autres classes"><TeacherDashboard /></Advanced>
        </Box>
      </Stack>
    </Tabs.Content>
    <Tabs.Content value="resultats" pt="6">{main.assignment_id ? <Results assignmentId={main.assignment_id} /> : noClass}</Tabs.Content>
    <Tabs.Content value="projet" pt="6">{main.assignment_id ? <TeacherProject assignmentId={main.assignment_id} /> : noClass}</Tabs.Content>
    <Tabs.Content value="observateurs" pt="6"><ObserversPanel /></Tabs.Content>
  </Tabs.Root>
}
