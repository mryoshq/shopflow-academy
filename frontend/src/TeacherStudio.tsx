import { useEffect, useState } from "react"
import { Badge, Box, Button, Field, Flex, Heading, Input, NativeSelect, SimpleGrid, Stack, Tabs, Text, Textarea } from "@chakra-ui/react"
import { api, ApiError } from "./api"
import { CoursePreview, type PreviewTree } from "./CoursePreview"
import { MissionEditor } from "./MissionEditor"
import { CourseImport, CourseSearch, ReleaseTools } from "./teacher/ContentAdmin"
import type { Chapter, Cohort, CohortDetail, CourseModule, CourseSummary, CourseTree, Mission, MissionDefinition, Release, StudentAccount } from "./studioTypes"

function slugify(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return `Conflit : ${error.message}. Vérifiez le nom ou l’état du cours.`
    if (error.status === 422) return `Contenu incomplet ou invalide : ${error.message}. Corrigez les champs puis réessayez.`
    return error.message
  }
  return "Connexion réseau indisponible. Réessayez."
}

type Direction = -1 | 1

export function TeacherStudio() {
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [students, setStudents] = useState<StudentAccount[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [course, setCourse] = useState<CourseTree | null>(null)
  const [releases, setReleases] = useState<Release[]>([])
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(null)
  const [selectedCohortId, setSelectedCohortId] = useState<number | null>(null)
  const [cohortDetail, setCohortDetail] = useState<CohortDetail | null>(null)
  const [selectedReleaseId, setSelectedReleaseId] = useState<number | null>(null)
  const [preview, setPreview] = useState<PreviewTree | null>(null)
  const [tab, setTab] = useState("structure")
  const [newCourseTitle, setNewCourseTitle] = useState("")
  const [newCourseDescription, setNewCourseDescription] = useState("")
  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [objectiveCode, setObjectiveCode] = useState("")
  const [objectiveStatement, setObjectiveStatement] = useState("")
  const [newModuleTitle, setNewModuleTitle] = useState("")
  const [chapterTitles, setChapterTitles] = useState<Record<number, string>>({})
  const [missionTitles, setMissionTitles] = useState<Record<number, string>>({})
  const [newCohortLabel, setNewCohortLabel] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([
      api<CourseSummary[]>("/teacher/courses"),
      api<Cohort[]>("/teacher/cohorts"),
      api<StudentAccount[]>("/teacher/students"),
    ]).then(([items, groups, accounts]) => {
      if (!live) return
      setCourses(items)
      setCohorts(groups)
      setStudents(accounts)
      setSelectedId(items[0]?.id ?? null)
      setSelectedCohortId(groups[0]?.id ?? null)
    }).catch((cause) => { if (live) setError(errorText(cause)) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (selectedId === null) { setCourse(null); setReleases([]); return }
    let live = true
    Promise.all([
      api<CourseTree>(`/teacher/courses/${selectedId}`),
      api<Release[]>(`/teacher/courses/${selectedId}/releases`),
    ]).then(([item, versions]) => {
      if (!live) return
      setCourse(item)
      setReleases(versions)
      setEditTitle(item.title)
      setEditDescription(item.description)
      setSelectedMissionId(null)
      setSelectedReleaseId(versions.find((release) => release.status === "published")?.id ?? null)
      setPreview(null)
    }).catch((cause) => { if (live) setError(errorText(cause)) })
    return () => { live = false }
  }, [selectedId])

  useEffect(() => {
    if (selectedCohortId === null) { setCohortDetail(null); return }
    let live = true
    api<CohortDetail>(`/teacher/cohorts/${selectedCohortId}`)
      .then((detail) => { if (live) setCohortDetail(detail) })
      .catch((cause) => { if (live) setError(errorText(cause)) })
    return () => { live = false }
  }, [selectedCohortId])

  async function refreshCourse(id: number) {
    const [items, item, versions] = await Promise.all([
      api<CourseSummary[]>("/teacher/courses"),
      api<CourseTree>(`/teacher/courses/${id}`),
      api<Release[]>(`/teacher/courses/${id}/releases`),
    ])
    setCourses(items)
    setRefreshKey((value) => value + 1)
    setCourse(item)
    setEditTitle(item.title)
    setEditDescription(item.description)
    setReleases(versions)
    setSelectedReleaseId(versions.find((release) => release.status === "published")?.id ?? null)
    setPreview(null)
  }

  async function refreshCohorts(id?: number) {
    const groups = await api<Cohort[]>("/teacher/cohorts")
    setCohorts(groups)
    const target = id ?? selectedCohortId
    if (target !== null) setCohortDetail(await api<CohortDetail>(`/teacher/cohorts/${target}`))
  }

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true)
    setError("")
    setNotice("")
    try { await action(); setNotice(success) }
    catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }

  function createCourse() {
    return run(async () => {
      const title = newCourseTitle.trim()
      const slug = slugify(title)
      if (!title || !slug) throw new ApiError(422, "Saisissez un titre de cours.")
      const created = await api<{ id: number }>("/teacher/courses", "POST", { slug, title, description: newCourseDescription.trim() })
      setNewCourseTitle("")
      setNewCourseDescription("")
      setCourses(await api<CourseSummary[]>("/teacher/courses"))
      setRefreshKey((value) => value + 1)
      setSelectedId(created.id)
      setTab("structure")
    }, "Cours créé. Ajoutez maintenant un objectif, un module et une mission.")
  }

  function saveCourse() {
    if (!course) return
    return run(async () => {
      await api(`/teacher/courses/${course.id}`, "PATCH", { title: editTitle.trim(), description: editDescription.trim() })
      await refreshCourse(course.id)
    }, "Cours enregistré.")
  }

  function addObjective() {
    if (!course) return
    return run(async () => {
      const code = objectiveCode.trim().toUpperCase() || `OBJ-${course.objectives.length + 1}`
      await api(`/teacher/courses/${course.id}/objectives`, "POST", { code, statement: objectiveStatement.trim() })
      setObjectiveCode("")
      setObjectiveStatement("")
      await refreshCourse(course.id)
    }, "Objectif ajouté.")
  }

  function addModule() {
    if (!course) return
    return run(async () => {
      await api(`/teacher/courses/${course.id}/modules`, "POST", { title: newModuleTitle.trim(), sort_order: course.modules.length })
      setNewModuleTitle("")
      await refreshCourse(course.id)
    }, "Module ajouté.")
  }

  function addChapter(module: CourseModule) {
    if (!course) return
    return run(async () => {
      await api(`/teacher/modules/${module.id}/chapters`, "POST", { title: (chapterTitles[module.id] ?? "").trim(), sort_order: module.chapters.length })
      setChapterTitles({ ...chapterTitles, [module.id]: "" })
      await refreshCourse(course.id)
    }, "Chapitre ajouté.")
  }

  function addMission(chapter: Chapter) {
    if (!course) return
    return run(async () => {
      const title = (missionTitles[chapter.id] ?? "").trim()
      const slug = slugify(title)
      if (!slug) throw new ApiError(422, "Saisissez un titre de mission.")
      const created = await api<{ id: number }>(`/teacher/chapters/${chapter.id}/missions`, "POST", { slug, title, sort_order: chapter.missions.length })
      setMissionTitles({ ...missionTitles, [chapter.id]: "" })
      await refreshCourse(course.id)
      setSelectedMissionId(created.id)
      setTab("mission")
    }, "Mission créée. Complétez maintenant ses champs.")
  }

  function reorder<T extends { id: number }>(items: T[], index: number, direction: Direction, route: (id: number) => string) {
    if (!course) return
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const copy = [...items]
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
    return run(async () => {
      for (let order = 0; order < copy.length; order += 1) await api(route(copy[order].id), "PATCH", { sort_order: order })
      await refreshCourse(course.id)
    }, "Ordre enregistré.")
  }

  function saveMission(title: string, definition: MissionDefinition) {
    if (!course || selectedMissionId === null) return Promise.resolve()
    return run(async () => {
      await api(`/teacher/missions/${selectedMissionId}`, "PATCH", { title })
      await api(`/teacher/missions/${selectedMissionId}/draft`, "PUT", definition)
      await refreshCourse(course.id)
    }, "Mission enregistrée.")
  }

  function loadPreview() {
    if (!course) return
    return run(async () => {
      setPreview(await api<PreviewTree>(`/teacher/courses/${course.id}/preview`, "POST"))
      setTab("preview")
    }, "Aperçu chargé sans créer de note ni de tentative.")
  }

  function validate() {
    if (!course) return
    return run(async () => {
      const result = await api<{ valid: boolean; mission_count: number }>(`/teacher/courses/${course.id}/validate`, "POST")
      setNotice(`Brouillon valide : ${result.mission_count} mission(s).`)
    }, "Brouillon valide.")
  }

  function publish() {
    if (!course) return
    return run(async () => {
      const result = await api<{ version: number }>(`/teacher/courses/${course.id}/publish`, "POST")
      await refreshCourse(course.id)
      setNotice(`Version ${result.version} publiée. Vous pouvez maintenant l’attribuer à une cohorte.`)
    }, "Version publiée.")
  }

  function archive() {
    if (!course || !window.confirm("Archiver ce cours et retirer ses versions de l’accès étudiant ?")) return
    return run(async () => {
      await api(`/teacher/courses/${course.id}/archive`, "POST")
      await refreshCourse(course.id)
    }, "Cours archivé. Son contenu reste consultable par l’enseignant en lecture seule.")
  }

  function createCohort() {
    return run(async () => {
      const created = await api<Cohort>("/teacher/cohorts", "POST", { label: newCohortLabel.trim() })
      setNewCohortLabel("")
      setSelectedCohortId(created.id)
      await refreshCohorts(created.id)
    }, "Cohorte créée.")
  }

  function enroll(studentId: number) {
    if (selectedCohortId === null) return
    return run(async () => {
      await api(`/teacher/cohorts/${selectedCohortId}/enrollments`, "POST", { user_id: studentId })
      await refreshCohorts()
    }, "Étudiant inscrit à la cohorte.")
  }

  function assign() {
    if (selectedCohortId === null || selectedReleaseId === null) return
    return run(async () => {
      await api(`/teacher/cohorts/${selectedCohortId}/assignments`, "POST", { course_release_id: selectedReleaseId })
      await refreshCohorts()
    }, "Version attribuée à la cohorte.")
  }

  const missions = course?.modules.flatMap((module) => module.chapters.flatMap((chapter) => chapter.missions)) ?? []
  const selectedMission: Mission | undefined = missions.find((item) => item.id === selectedMissionId)
  const corrections = Object.fromEntries(missions.filter((item) => item.definition).map((item) => [item.id, item.definition!]))
  const archived = course?.status === "archived"

  return <Stack gap="6" aria-label="Studio de cours">
    <Flex align="center" justify="space-between" gap="4" wrap="wrap"><Box><Heading as="h2" size="xl">Studio de cours</Heading><Text color="gray.600" mt="1">Créez une démonstration, puis vérifiez-la avant de publier une version.</Text></Box><Badge colorPalette="brand" variant="subtle">Aucun code requis</Badge></Flex>
    {error && <Box role="alert" bg="red.50" color="red.800" p="4" rounded="md">{error}</Box>}
    {notice && <Box role="status" bg="brand.subtle" color="brand.fg" p="4" rounded="md">{notice}</Box>}
    {loading ? <Text role="status">Chargement du studio…</Text> : <SimpleGrid columns={{ base: 1, lg: 2 }} gap="6" gridTemplateColumns={{ lg: "270px minmax(0, 1fr)" }} alignItems="start">
      <Stack gap="5" as="aside" bg="white" p="5" rounded="xl" borderWidth="1px">
        <Heading as="h3" size="md">Mes cours</Heading>
        {courses.length === 0 ? <Text color="gray.600">Aucun cours créé. Commencez ci-dessous.</Text> : <CourseSearch selectedId={selectedId} refreshKey={refreshKey} onSelect={(id) => { setSelectedId(id); setTab("structure"); setError(""); setNotice("") }} />}
        <Box borderTopWidth="1px" pt="4"><Heading as="h4" size="sm" mb="3">Nouveau cours</Heading><Stack gap="3"><Field.Root required><Field.Label>Titre</Field.Label><Input value={newCourseTitle} onChange={(event) => setNewCourseTitle(event.target.value)} placeholder="Démo : qualité des données" /></Field.Root><Field.Root><Field.Label>Description</Field.Label><Textarea value={newCourseDescription} onChange={(event) => setNewCourseDescription(event.target.value)} rows={3} /></Field.Root><Button colorPalette="brand" onClick={createCourse} loading={busy} disabled={!newCourseTitle.trim()}>Créer le cours</Button></Stack></Box>
        <Box borderTopWidth="1px" pt="4"><CourseImport onImported={(id) => { setCourses((items) => [...items]); setRefreshKey((value) => value + 1); setSelectedId(id); setTab("structure"); setNotice("Cours importé comme nouveau brouillon. Vérifiez-le puis publiez une version.") }} /></Box>
      </Stack>
      <Box minW="0">{course ? <Tabs.Root value={tab} onValueChange={(event) => setTab(event.value)} variant="line">
        <Flex justify="space-between" align="center" wrap="wrap" gap="3" mb="3"><Box><Heading as="h3" size="lg">{course.title}</Heading><Text color="gray.600">{course.status === "archived" ? "Archivé — lecture seule" : course.status === "published" ? "Publié — une nouvelle édition créera une révision" : "Brouillon"}</Text></Box><Badge colorPalette={archived ? "gray" : "brand"}>{course.status === "archived" ? "Archivé" : course.status === "published" ? "Publié" : "Brouillon"}</Badge></Flex>
        <Tabs.List overflowX="auto"><Tabs.Trigger value="structure">Structure</Tabs.Trigger><Tabs.Trigger value="mission">Missions</Tabs.Trigger><Tabs.Trigger value="preview">Aperçu</Tabs.Trigger><Tabs.Trigger value="publication">Publication</Tabs.Trigger></Tabs.List>
        <Tabs.Content value="structure"><Stack gap="6" py="5">
          <Box bg="white" p="5" rounded="xl" borderWidth="1px"><Stack gap="3"><Heading as="h4" size="md">Informations du cours</Heading><Field.Root><Field.Label>Titre</Field.Label><Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} disabled={archived} /></Field.Root><Field.Root><Field.Label>Description</Field.Label><Textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} disabled={archived} rows={3} /></Field.Root><Button alignSelf="start" colorPalette="brand" onClick={saveCourse} loading={busy} disabled={archived}>Enregistrer le cours</Button></Stack></Box>
          <Box bg="white" p="5" rounded="xl" borderWidth="1px"><Stack gap="3"><Heading as="h4" size="md">Objectifs pédagogiques</Heading>{course.objectives.length === 0 && <Text color="gray.600">Aucun objectif pour le moment.</Text>}{course.objectives.map((objective) => <Text key={objective.id}>{objective.code} — {objective.statement}</Text>)}<Flex gap="2" wrap="wrap"><Input aria-label="Code de l’objectif" value={objectiveCode} onChange={(event) => setObjectiveCode(event.target.value)} placeholder={`OBJ-${course.objectives.length + 1}`} maxW="40" disabled={archived} /><Input aria-label="Description de l’objectif" value={objectiveStatement} onChange={(event) => setObjectiveStatement(event.target.value)} placeholder="Ce que l’étudiant saura faire" flex="1" minW="44" disabled={archived} /><Button colorPalette="brand" variant="outline" onClick={addObjective} loading={busy} disabled={archived || !objectiveStatement.trim()}>Ajouter l’objectif</Button></Flex></Stack></Box>
          <Box bg="white" p="5" rounded="xl" borderWidth="1px"><Stack gap="4"><Heading as="h4" size="md">Modules, chapitres et missions</Heading>{course.modules.length === 0 && <Text color="gray.600">Ajoutez un module pour organiser les missions.</Text>}{course.modules.map((module, moduleIndex) => <Box key={module.id} borderWidth="1px" rounded="md" p="4"><Stack gap="3"><Flex align="center" gap="2" wrap="wrap"><Heading as="h5" size="sm" flex="1">{module.title}</Heading><Button size="xs" variant="outline" aria-label={`Monter le module ${module.title}`} disabled={archived || moduleIndex === 0} onClick={() => reorder(course.modules, moduleIndex, -1, (id) => `/teacher/modules/${id}`)}>Monter</Button><Button size="xs" variant="outline" aria-label={`Descendre le module ${module.title}`} disabled={archived || moduleIndex === course.modules.length - 1} onClick={() => reorder(course.modules, moduleIndex, 1, (id) => `/teacher/modules/${id}`)}>Descendre</Button></Flex>{module.chapters.map((chapter, chapterIndex) => <Box key={chapter.id} bg="gray.50" p="3" rounded="md"><Stack gap="2"><Flex gap="2" align="center" wrap="wrap"><Text fontWeight="semibold" flex="1">{chapter.title}</Text><Button size="xs" variant="outline" aria-label={`Monter le chapitre ${chapter.title}`} disabled={archived || chapterIndex === 0} onClick={() => reorder(module.chapters, chapterIndex, -1, (id) => `/teacher/chapters/${id}`)}>Monter</Button><Button size="xs" variant="outline" aria-label={`Descendre le chapitre ${chapter.title}`} disabled={archived || chapterIndex === module.chapters.length - 1} onClick={() => reorder(module.chapters, chapterIndex, 1, (id) => `/teacher/chapters/${id}`)}>Descendre</Button></Flex>{chapter.missions.map((mission, missionIndex) => <Flex key={mission.id} gap="2" align="center" wrap="wrap"><Button size="sm" variant="ghost" colorPalette="brand" onClick={() => { setSelectedMissionId(mission.id); setTab("mission") }}>{mission.title}{mission.definition ? "" : " · à compléter"}</Button><Button size="xs" variant="outline" aria-label={`Monter la mission ${mission.title}`} disabled={archived || missionIndex === 0} onClick={() => reorder(chapter.missions, missionIndex, -1, (id) => `/teacher/missions/${id}`)}>Monter</Button><Button size="xs" variant="outline" aria-label={`Descendre la mission ${mission.title}`} disabled={archived || missionIndex === chapter.missions.length - 1} onClick={() => reorder(chapter.missions, missionIndex, 1, (id) => `/teacher/missions/${id}`)}>Descendre</Button></Flex>)}<Flex gap="2" wrap="wrap"><Input aria-label={`Nouvelle mission pour ${chapter.title}`} value={missionTitles[chapter.id] ?? ""} onChange={(event) => setMissionTitles({ ...missionTitles, [chapter.id]: event.target.value })} placeholder="Titre de la mission" flex="1" minW="44" disabled={archived} /><Button size="sm" colorPalette="brand" variant="outline" onClick={() => addMission(chapter)} disabled={archived || !(missionTitles[chapter.id] ?? "").trim()}>Ajouter une mission</Button></Flex></Stack></Box>)}<Flex gap="2" wrap="wrap"><Input aria-label={`Nouveau chapitre pour ${module.title}`} value={chapterTitles[module.id] ?? ""} onChange={(event) => setChapterTitles({ ...chapterTitles, [module.id]: event.target.value })} placeholder="Titre du chapitre" flex="1" minW="44" disabled={archived} /><Button size="sm" variant="outline" onClick={() => addChapter(module)} disabled={archived || !(chapterTitles[module.id] ?? "").trim()}>Ajouter un chapitre</Button></Flex></Stack></Box>)}<Flex gap="2" wrap="wrap"><Input aria-label="Titre du nouveau module" value={newModuleTitle} onChange={(event) => setNewModuleTitle(event.target.value)} placeholder="Titre du module" flex="1" minW="44" disabled={archived} /><Button colorPalette="brand" variant="outline" onClick={addModule} disabled={archived || !newModuleTitle.trim()}>Ajouter un module</Button></Flex></Stack></Box>
        </Stack></Tabs.Content>
        <Tabs.Content value="mission" py="5">{missions.length === 0 ? <Text>Créez d’abord un module, un chapitre et une mission dans Structure.</Text> : <Stack gap="5"><NativeSelect.Root maxW="md"><NativeSelect.Field aria-label="Mission à éditer" value={selectedMissionId ?? ""} onChange={(event) => setSelectedMissionId(Number(event.target.value))}><option value="">Choisir une mission</option>{missions.map((mission) => <option key={mission.id} value={mission.id}>{mission.title}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>{selectedMission && <Box bg="white" p={{ base: "4", md: "6" }} borderWidth="1px" rounded="xl"><MissionEditor key={selectedMission.id} mission={selectedMission} course={course} busy={busy} onSave={saveMission} /></Box>}</Stack>}</Tabs.Content>
        <Tabs.Content value="preview" py="5"><Stack gap="4"><Text color="gray.600">Aperçu étudiant sans notation ni tentative. Les corrections restent réservées à l’enseignant.</Text><Button alignSelf="start" colorPalette="brand" onClick={loadPreview} loading={busy}>Charger l’aperçu</Button>{preview ? <CoursePreview course={preview} corrections={corrections} /> : <Text>Chargez l’aperçu du brouillon actuel.</Text>}</Stack></Tabs.Content>
        <Tabs.Content value="publication" py="5"><Stack gap="6"><Box bg="white" p="5" borderWidth="1px" rounded="xl"><Stack gap="3"><Heading as="h4" size="md">Vérifier et publier</Heading><Text>La publication fige une version. Les anciennes versions et leurs réponses privées restent intactes.</Text><Flex gap="3" wrap="wrap"><Button variant="outline" onClick={validate} disabled={archived} loading={busy}>Vérifier le brouillon</Button><Button colorPalette="brand" onClick={publish} disabled={archived} loading={busy}>Publier une version</Button><Button colorPalette="red" variant="outline" onClick={archive} disabled={archived} loading={busy}>Archiver le cours</Button></Flex>{releases.length === 0 && <Text color="gray.600">Aucune version publiée.</Text>}</Stack></Box>
          <Box bg="white" p="5" borderWidth="1px" rounded="xl"><Stack gap="3"><Heading as="h4" size="md">Versions, sauvegardes et historique</Heading><Text>Chaque version publiée reste intacte. Vous pouvez l’exporter, ou remettre son contenu dans le brouillon ; le brouillon actuel est alors sauvegardé.</Text><ReleaseTools courseId={course.id} releases={releases} archived={archived} refreshKey={refreshKey} onRestored={() => void refreshCourse(course.id)} /></Stack></Box>
          <Box bg="white" p="5" borderWidth="1px" rounded="xl"><Stack gap="4"><Heading as="h4" size="md">Attribuer une version</Heading><Text>Créez une cohorte, inscrivez les étudiants voulus, puis attribuez la version publiée.</Text><Flex gap="2" wrap="wrap"><Input aria-label="Nom de la nouvelle cohorte" value={newCohortLabel} onChange={(event) => setNewCohortLabel(event.target.value)} placeholder="Nom de la cohorte" flex="1" minW="44" /><Button variant="outline" onClick={createCohort} disabled={!newCohortLabel.trim()} loading={busy}>Créer la cohorte</Button></Flex><Field.Root><Field.Label>Cohorte</Field.Label><NativeSelect.Root><NativeSelect.Field value={selectedCohortId ?? ""} onChange={(event) => setSelectedCohortId(Number(event.target.value))}><option value="">Choisir une cohorte</option>{cohorts.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>{selectedCohortId !== null && <><Heading as="h5" size="sm">Étudiants de la cohorte</Heading>{students.length === 0 ? <Text>Aucun étudiant actif.</Text> : <Stack gap="2" maxH="52" overflowY="auto">{students.map((student) => <Flex key={student.id} gap="2" align="center" justify="space-between"><Text overflowWrap="anywhere">{student.username}</Text>{cohortDetail?.student_ids.includes(student.id) ? <Badge colorPalette="brand">Inscrit</Badge> : <Button size="xs" variant="outline" onClick={() => enroll(student.id)} loading={busy}>Inscrire</Button>}</Flex>)}</Stack>}</>}<Field.Root><Field.Label>Version publiée</Field.Label><NativeSelect.Root><NativeSelect.Field value={selectedReleaseId ?? ""} onChange={(event) => setSelectedReleaseId(Number(event.target.value))}><option value="">Choisir une version</option>{releases.filter((release) => release.status === "published").map((release) => <option key={release.id} value={release.id}>Version {release.version}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root><Button colorPalette="brand" alignSelf="start" onClick={assign} disabled={archived || selectedCohortId === null || selectedReleaseId === null || cohortDetail?.release_ids.includes(selectedReleaseId)} loading={busy}>{selectedReleaseId !== null && cohortDetail?.release_ids.includes(selectedReleaseId) ? "Déjà attribuée" : "Attribuer à la cohorte"}</Button></Stack></Box>
        </Stack></Tabs.Content>
      </Tabs.Root> : <Box bg="white" p="8" borderWidth="1px" rounded="xl"><Heading as="h3" size="md">Choisissez un cours</Heading><Text mt="2">Créez votre premier cours dans le panneau de gauche.</Text></Box>}</Box>
    </SimpleGrid>}
  </Stack>
}
