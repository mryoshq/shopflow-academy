import { useEffect, useState } from "react"
import { Box, Button, Heading, Stack, Text } from "@chakra-ui/react"
import { api } from "./api"
import { CoursePreview } from "./CoursePreview"
import type { StudentCourse } from "./studioTypes"

type Assigned = { id: number; course_id: number; version: number; title: string }

export function StudentHome() {
  const [courses, setCourses] = useState<Assigned[]>([])
  const [selected, setSelected] = useState<StudentCourse | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    api<Assigned[]>("/student/courses").then((items) => { if (active) setCourses(items) })
      .catch(() => { if (active) setError("Impossible de charger les cours attribués.") })
    return () => { active = false }
  }, [])
  async function openCourse(id: number) {
    setError("")
    try { setSelected(await api<StudentCourse>(`/student/courses/${id}`)) }
    catch { setError("Ce cours n’est plus disponible."); setSelected(null) }
  }
  return <Stack gap="5">
    <Heading as="h2" size="xl">Mes cours</Heading>
    {error && <Text role="alert" color="red.700">{error}</Text>}
    {courses.length === 0 ? <Text>Aucun cours ne vous est encore attribué.</Text> : <Stack gap="3">{courses.map((item) =>
      <Box key={item.id} bg="white" borderWidth="1px" p="4" rounded="lg"><Button variant="outline" colorPalette="teal" onClick={() => openCourse(item.id)}>{item.title} · version {item.version}</Button></Box>
    )}</Stack>}
    {selected && <Box bg="white" p="5" rounded="xl" borderWidth="1px"><CoursePreview course={selected} /></Box>}
  </Stack>
}
