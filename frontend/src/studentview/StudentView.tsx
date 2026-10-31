import { useLayoutEffect, useMemo, useState } from "react"
import { Box, Button, Checkbox, Container, Flex, Text } from "@chakra-ui/react"
import { t } from "../i18n"
import { Logo } from "../Logo"
import { BrandName } from "../BrandName"
import { StudentHome } from "../StudentHome"
import { parseRoute, StudentRouterContext } from "../useHashRoute"
import { enterStudentView, leaveStudentView } from "./adapter"

const ALL_KEY = "shopflow:student-view:all"

function readAll(): boolean {
  try { return window.localStorage.getItem(ALL_KEY) === "1" } catch { return false }
}

/**
 * ADR-0043 « Vue étudiant »: the student application, on the version published for the class, read only.
 * `sub` is the student's own route (« », « mission/12 », « projet », « voyage/3 ») inside #/etudiant/.
 */
export function StudentView({ assignmentId, sub, onNavigate, onLeave, label }: {
  assignmentId: number; sub: string; onNavigate: (sub: string) => void; onLeave: () => void; label: string
}) {
  const [all, setAll] = useState(readAll)
  // Before the pages fetch anything (layout effects run before the children's effects).
  useLayoutEffect(() => {
    enterStudentView(assignmentId, all)
    return () => leaveStudentView()
  }, [assignmentId, all])
  const router = useMemo(() => ({
    route: parseRoute(sub ? `#/${sub}` : "#/"),
    navigate: (path: string) => { onNavigate(path.replace(/^\//, "")); window.scrollTo?.({ top: 0 }) },
    href: (path: string) => `#/etudiant${path === "/" ? "" : path}`,
  }), [sub, onNavigate])

  function chooseAll(value: boolean) {
    try { window.localStorage.setItem(ALL_KEY, value ? "1" : "0") } catch { /* not remembered */ }
    setAll(value)
  }

  return <Box minH="100dvh" bg="app.canvas" color="app.ink">
    <Box as="section" aria-label={t("Vue étudiant")} bg="saffron.subtle" borderBottomWidth="1px" borderColor="saffron.solid" position="sticky" top="0" zIndex="sticky">
      <Container maxW="7xl" py="2.5">
        <Flex align="center" gap={{ base: "2", md: "4" }} wrap="wrap">
          <Box flex="1" minW="48">
            <Text fontWeight="semibold" data-testid="student-view-banner">{t("Vue étudiant, rien n’est enregistré")}</Text>
            <Text fontSize="xs" color="app.muted">{label}</Text>
          </Box>
          <Checkbox.Root checked={all} onCheckedChange={(event) => chooseAll(Boolean(event.checked))} colorPalette="brand" size="sm">
            <Checkbox.HiddenInput /><Checkbox.Control />
            <Checkbox.Label fontSize="sm">{t("Afficher aussi les blocs fermés")}</Checkbox.Label>
          </Checkbox.Root>
          <Button size="sm" colorPalette="brand" onClick={onLeave}>{t("Revenir à mon interface")}</Button>
        </Flex>
      </Container>
    </Box>
    <Box as="header" borderBottomWidth="1px" borderColor="app.border" bg="app.surface">
      <Container maxW="7xl" py="3.5"><Flex align="center" gap="2.5"><Logo size={32} /><BrandName /></Flex></Container>
    </Box>
    <Container as="main" id="contenu" tabIndex={-1} outline="none" maxW="7xl" py={{ base: "8", md: "12" }}>
      <StudentRouterContext.Provider value={router}>
        <StudentHome key={String(all)} />
      </StudentRouterContext.Provider>
    </Container>
  </Box>
}
