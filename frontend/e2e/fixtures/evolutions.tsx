import React from "react"
import { createRoot } from "react-dom/client"
import { Box, ChakraProvider, Heading, Stack } from "@chakra-ui/react"
import { system } from "../../src/theme"
import { setLanguage } from "../../src/i18n"
import { ClassTimeline } from "../../src/teacher/ClassTimeline"
import { LivePanel } from "../../src/teacher/LivePanel"
import { BlockStudents } from "../../src/teacher/BlockStudents"

// Served by Vite only, never referenced by the application build. All API requests are mocked by the spec.
setLanguage("fr")
const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle("dark", params.get("theme") === "dark")
document.documentElement.classList.toggle("light", params.get("theme") !== "dark")
const bottom = params.has("bottom")
createRoot(document.getElementById("root")!).render(<ChakraProvider value={system}>
  <Box as="main" p="3" minH="100vh" bg="app.canvas" color="app.ink">
    <Heading as="h1" size="md">Évolutions locales fictives</Heading>
    <Stack gap="4" mt={bottom ? "70vh" : "4"} align="start">
      {params.has("bonus") ? <><ClassTimeline assignmentId={4} section="frise" /><LivePanel assignmentId={4} /></> : <BlockStudents assignmentId={4} chapterId={7} title="Bloc SQL" completed={1} total={2} />}
    </Stack>
  </Box>
</ChakraProvider>)
