import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react"
import { Badge, Box, Button, Flex, Heading, Link, Stack, Tabs, Text, chakra } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { Logo } from "../Logo"
import { ThemeSwitch } from "../ThemeSwitch"
import { TeacherStudio } from "../TeacherStudio"
import { LeaderboardPage } from "../leaderboard/LeaderboardPage"
import { NotificationBell } from "../live/notifications"
import { ErrorState, LoadingState, Panel } from "../student/ui"
import { ClassTimeline } from "./ClassTimeline"
import { CommandPalette } from "./CommandPalette"
import { AutoPlanPanel, LivePanel, NotificationSettingsPanel, type Live } from "./LivePanel"
import { ObserversPanel } from "./ObserversPanel"
import { Results } from "./Results"
import { TeacherDashboard } from "./TeacherDashboard"
import { Today } from "./Today"
import { TeacherProject } from "../project/TeacherProject"
import { VOYAGE_READY, VoyagePage } from "../voyage"
import { VIEWS, formatRoute, initialRoute, rememberRoute, viewInfo, parseRoute, type TeacherRoute, type ViewKey } from "./routes"

export type MainState = {
  course: { id: number; slug: string; title: string; status: "draft" | "published" | "archived" } | null
  cohort: { id: number; label: string; student_count: number } | null
  assignment_id: number | null
  assigned_version: number | null
  latest_version: number | null
}

const COLLAPSED_KEY = "shopflow:teacher:sidebar"
const ONLINE_REFRESH_MS = 15000

const ICONS: Record<string, ReactNode> = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M8 7h7" /></>,
  chart: <><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>,
  trophy: <><path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  collapse: <path d="M15 6l-6 6 6 6" />,
  expand: <path d="M9 6l6 6-6 6" />,
  logout: <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M8 13h8" /></>,
  route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" /></>,
}

function NavIcon({ name, size = 20 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{ICONS[name]}</svg>
}

function useTeacherRoute(resumed: boolean) {
  const [route, setRoute] = useState<TeacherRoute>(() => initialRoute(window.location.hash, resumed))
  useEffect(() => {
    // The landing view gets an address without adding a history entry.
    const address = formatRoute(route)
    if (window.location.hash !== address) window.history.replaceState(null, "", address)
    const changed = () => {
      const next = parseRoute(window.location.hash)
      if (next) setRoute(next)
    }
    window.addEventListener("hashchange", changed)
    return () => window.removeEventListener("hashchange", changed)
  // The first route only; later changes come from the address.
  }, [])
  useEffect(() => { rememberRoute(route) }, [route])
  const navigate = useCallback((next: TeacherRoute, replace = false) => {
    const address = formatRoute(next)
    if (window.location.hash === address) return
    if (replace) { window.history.replaceState(null, "", address); setRoute(next) }
    else window.location.hash = address.slice(1)
  }, [])
  return { route, navigate }
}

function readCollapsed(): boolean {
  try { return window.localStorage.getItem(COLLAPSED_KEY) === "1" } catch { return false }
}

/**
 * Teacher single-page application (ADR-0031): fixed sidebar, top bar, one view per address,
 * sub-views as tabs, details in right-hand panels, « Aujourd’hui » dashboard and Cmd+K.
 */
export function TeacherApp({ username, onLogout, busy, resumed }: { username: string; onLogout: () => void; busy: boolean; resumed: boolean }) {
  const { route, navigate } = useTeacherRoute(resumed)
  const [main, setMain] = useState<MainState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [palette, setPalette] = useState(false)
  const [online, setOnline] = useState<{ online: number; total: number } | null>(null)

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

  const assignmentId = main?.assignment_id ?? null
  useEffect(() => {
    if (!assignmentId) return
    let active = true
    const load = () => api<Live>(`/teacher/classes/${assignmentId}/live`)
      .then((data) => { if (active) setOnline({ online: data.online_count, total: data.student_count }) }).catch(() => undefined)
    void load()
    const timer = window.setInterval(load, ONLINE_REFRESH_MS)
    return () => { active = false; window.clearInterval(timer) }
  }, [assignmentId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette((value) => !value) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  function toggleSidebar() {
    setCollapsed((value) => {
      try { window.localStorage.setItem(COLLAPSED_KEY, value ? "0" : "1") } catch { /* not remembered */ }
      return !value
    })
  }

  const info = viewInfo(route.view)
  const go = (view: ViewKey, sub = "", params: Record<string, string> = {}) => navigate({ view, sub, params })

  const sidebar = <chakra.nav aria-label="Navigation enseignant" position="sticky" top="0" h="100dvh" flexShrink={0}
    w={{ base: "16", md: collapsed ? "20" : "60" }} bg="app.surface" borderRightWidth="1px" borderColor="app.border"
    display="flex" flexDirection="column" py="3" px={{ base: "2", md: collapsed ? "2" : "3" }} gap="1"
    css={{ transition: "width 160ms ease" }}>
    <Flex align="center" gap="2.5" px="1.5" mb="4" minH="11">
      <Logo size={30} />
      {!collapsed && <Text display={{ base: "none", md: "block" }} fontWeight="bold" letterSpacing="0.02em" lineHeight="1.1">ShopFlow <Text as="span" color="brand.fg">Academy</Text></Text>}
    </Flex>
    {VIEWS.filter((view) => view.key !== "voyage" || VOYAGE_READY).map((view) => {
      const current = route.view === view.key
      return <Link key={view.key} href={formatRoute({ view: view.key, sub: view.subs[0]?.key ?? "", params: {} })} aria-current={current ? "page" : undefined}
        aria-label={view.label} title={view.label} display="flex" alignItems="center" gap="3" minH="11" px="3" rounded="lg" fontWeight={current ? "semibold" : "medium"}
        color={current ? "brand.fg" : "app.ink"} bg={current ? "brand.subtle" : "transparent"} textDecoration="none"
        _hover={{ bg: current ? "brand.subtle" : "app.sunken", textDecoration: "none" }} justifyContent={{ base: "center", md: collapsed ? "center" : "flex-start" }}>
        <NavIcon name={view.icon} />
        <Box as="span" display={{ base: "none", md: collapsed ? "none" : "inline" }} aria-hidden="true">{view.label}</Box>
      </Link>
    })}
    <Box mt="auto" display={{ base: "none", md: "block" }}>
      <Button variant="ghost" size="sm" w="full" justifyContent={collapsed ? "center" : "flex-start"} onClick={toggleSidebar} aria-expanded={!collapsed}
        aria-label={collapsed ? "Déplier la navigation" : "Replier la navigation"}>
        <NavIcon name={collapsed ? "expand" : "collapse"} size={18} />{!collapsed && <span>Replier</span>}</Button>
    </Box>
  </chakra.nav>

  const topbar = <Flex as="header" align="center" gap={{ base: "2", md: "3" }} px={{ base: "3", md: "6" }} py="2.5" minH="16" wrap="wrap"
    borderBottomWidth="1px" borderColor="app.border" bg="app.surface" position="sticky" top="0" zIndex="sticky">
    {route.view === "aujourdhui"
      ? <Text fontWeight="bold" fontSize={{ base: "md", md: "lg" }} flex="1" minW="fit-content">{info.title}</Text>
      : <Heading as="h1" size={{ base: "md", md: "lg" }} flex="1" minW="fit-content">{info.title}</Heading>}
    {online && <Link href="#/classe/etudiants" display="inline-flex" alignItems="center" gap="2" minH="11" px="2" rounded="md" fontSize="sm" color="app.ink"
      textDecoration="none" aria-label={`${online.online} étudiant${online.online > 1 ? "s" : ""} en ligne sur ${online.total}`}>
      <Box w="2.5" h="2.5" rounded="full" bg={online.online ? "green.solid" : "app.border"} aria-hidden="true" />
      <Text as="span" aria-hidden="true" css={{ fontVariantNumeric: "tabular-nums" }}>{online.online} en ligne</Text>
    </Link>}
    <Button variant="outline" size="sm" onClick={() => setPalette(true)} aria-label="Recherche rapide (Ctrl+K)" gap="2" color="app.muted">
      <NavIcon name="search" size={16} /><Box as="span" display={{ base: "none", lg: "inline" }}>Rechercher</Box>
      <Box as="span" display={{ base: "none", lg: "inline" }} fontSize="xs" borderWidth="1px" borderColor="app.border" rounded="sm" px="1">Ctrl K</Box></Button>
    <NotificationBell />
    <ThemeSwitch />
    <Flex align="center" gap="2">
      <Text fontSize="sm" color="app.muted" display={{ base: "none", xl: "block" }} maxW="48" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{username}</Text>
      <Badge display={{ base: "none", sm: "inline-flex" }} colorPalette="saffron" variant="subtle" rounded="full" px="2.5">Enseignant</Badge>
      <Button size="sm" variant="outline" onClick={onLogout} loading={busy} aria-label="Se déconnecter">
        <NavIcon name="logout" size={18} /><Box as="span" display={{ base: "none", sm: "inline" }}>Se déconnecter</Box></Button>
    </Flex>
  </Flex>

  let content: ReactNode
  if (error) content = <ErrorState message={error} onRetry={() => void setup()} />
  else if (!main?.course || !main.cohort) content = <LoadingState label="Préparation de votre classe…" />
  else content = <ViewContent route={route} main={main} username={username} go={go} navigate={navigate} reload={reload} />

  return <Flex minH="100dvh" bg="app.canvas" color="app.ink">
    <Link href="#contenu" position="absolute" left="2" top="-16" minH="11" zIndex="skipLink" px="3" py="2" rounded="md" bg="brand.solid" color="brand.contrast"
      fontWeight="semibold" _focus={{ top: "2" }} onClick={(event) => { event.preventDefault(); document.getElementById("contenu")?.focus() }}>Aller au contenu</Link>
    {sidebar}
    <Flex direction="column" flex="1" minW="0">
      {topbar}
      <Box as="main" id="contenu" tabIndex={-1} outline="none" flex="1" minW="0" px={{ base: "3", md: "8" }} py={{ base: "5", md: "8" }} maxW="7xl" w="full" mx="auto">
        <Box key={`${route.view}`} className="view-enter">{content}</Box>
      </Box>
    </Flex>
    <CommandPalette open={palette} onClose={() => setPalette(false)} onGo={(next) => navigate(next)} assignmentId={assignmentId} />
  </Flex>
}

function SubTabs({ route, go, children, label }: { route: TeacherRoute; go: (view: ViewKey, sub: string) => void; children: ReactNode; label: string }) {
  const info = viewInfo(route.view)
  return <Tabs.Root value={route.sub} onValueChange={(event) => go(route.view, event.value)} variant="line" colorPalette="brand" lazyMount unmountOnExit>
    <Tabs.List aria-label={label} overflowX="auto" mb="6">{info.subs.map((sub) => <Tabs.Trigger key={sub.key} value={sub.key}>{sub.label}</Tabs.Trigger>)}</Tabs.List>
    {children}
  </Tabs.Root>
}

function NoClass() {
  return <Panel><Stack gap="2">
    <Text fontWeight="semibold">Votre cours n’est pas encore publié</Text>
    <Text color="app.muted">Dans « Mon cours », onglet Publication, cliquez sur « Publier pour la classe ». Les blocs arrivent fermés : vous les ouvrirez ici, un par un.</Text>
    <Link href="#/cours/publication" color="brand.fg" fontWeight="semibold">Aller à la publication →</Link>
  </Stack></Panel>
}

function ViewContent({ route, main, username, go, navigate, reload }: {
  route: TeacherRoute; main: MainState; username: string; go: (view: ViewKey, sub?: string, params?: Record<string, string>) => void
  navigate: (route: TeacherRoute, replace?: boolean) => void; reload: () => Promise<void>
}) {
  const assignmentId = main.assignment_id
  const context = <Flex gap="3" align="center" wrap="wrap" mb="4">
    <Badge colorPalette="brand" variant="subtle" rounded="full" whiteSpace="normal" maxW="full" lineHeight="1.4" py="0.5">{main.cohort!.label} · {main.cohort!.student_count} étudiants</Badge>
    <Text fontSize="sm" color="app.muted">{main.course!.title}{main.assigned_version ? ` · version ${main.assigned_version} pour la classe` : " · pas encore publié"}</Text>
  </Flex>

  switch (route.view) {
    case "aujourdhui":
      return <Today username={username} assignmentId={assignmentId} />
    case "classe":
      return <Stack gap="0">{context}<SubTabs route={route} go={go} label="Ma classe">
        {!assignmentId ? <NoClass /> : <>
          <Tabs.Content value="frise"><Stack gap="8"><ClassTimeline assignmentId={assignmentId} section="frise" /><AutoPlanPanel assignmentId={assignmentId} /></Stack></Tabs.Content>
          <Tabs.Content value="etudiants"><Stack gap="8">
            <LivePanel assignmentId={assignmentId} />
            <TeacherDashboard assignmentId={assignmentId} studentId={route.params.eleve ? Number(route.params.eleve) : null}
              onStudent={(id) => navigate({ ...route, params: id === null ? {} : { eleve: String(id) } }, id === null)} />
          </Stack></Tabs.Content>
          <Tabs.Content value="aide"><ClassTimeline assignmentId={assignmentId} section="aide" /></Tabs.Content>
          <Tabs.Content value="difficultes"><ClassTimeline assignmentId={assignmentId} section="difficultes" /></Tabs.Content>
        </>}
      </SubTabs></Stack>
    case "cours":
      return <TeacherStudio mainCourseId={main.course!.id} onPublished={() => void reload()} tab={route.sub} onTab={(sub) => go("cours", sub)} />
    case "resultats":
      return assignmentId ? <Stack gap="0">{context}<Results assignmentId={assignmentId} /></Stack> : <NoClass />
    case "projet":
      return assignmentId ? <Stack gap="0">{context}<TeacherProject assignmentId={assignmentId} /></Stack> : <NoClass />
    case "voyage":
      return <Suspense fallback={<LoadingState label="Chargement de l’expérience…" />}>
        <VoyagePage scene={route.sub ? Number(route.sub) : 1} onScene={(scene) => navigate({ view: "voyage", sub: String(scene), params: {} })} /></Suspense>
    case "classement": {
      const selected = route.sub ? Number(route.sub) : assignmentId
      return selected ? <LeaderboardPage key={selected} role="teacher" assignmentId={selected} /> : <NoClass />
    }
    case "reglages":
      return <SubTabs route={route} go={go} label="Réglages">
        <Tabs.Content value="notifications"><Panel><NotificationSettingsPanel /></Panel></Tabs.Content>
        <Tabs.Content value="observateurs"><ObserversPanel /></Tabs.Content>
        <Tabs.Content value="classes"><TeacherDashboard /></Tabs.Content>
      </SubTabs>
  }
}
