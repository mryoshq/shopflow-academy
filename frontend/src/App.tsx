import { useEffect, useState, type FormEvent } from "react"
import { Badge, Box, Button, Container, Field, Flex, Heading, Input, Link, Stack, Text, chakra } from "@chakra-ui/react"
import { TeacherApp } from "./teacher/TeacherApp"
import { StudentHome } from "./StudentHome"
import { ObserverHome } from "./observer/ObserverHome"
import { ThemeSwitch } from "./ThemeSwitch"
import { Logo } from "./Logo"
import { NotificationBell, NotificationProvider } from "./live/notifications"
import { ComfortButton } from "./comfort/Comfort"
import { LeaderboardNavigation } from "./leaderboard/LeaderboardPage"
import type { User } from "./studioTypes"

type PageState = "loading" | "anonymous" | "authenticated" | "network_error"

function csrfToken(): string {
  const names = ["academy_csrf", "__Host-academy_csrf"]
  for (const part of document.cookie.split("; ")) {
    const [name, value] = part.split("=", 2)
    if (names.includes(name)) return decodeURIComponent(value ?? "")
  }
  return ""
}

export function App() {
  const [state, setState] = useState<PageState>("loading")
  const [user, setUser] = useState<User | null>(null)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  // ADR-0031: a resumed session reopens the teacher's last view; a fresh login starts on « Aujourd’hui ».
  const [resumed, setResumed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/v1/auth/me", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) return setState("anonymous")
        if (!response.ok) throw new Error("API unavailable")
        setUser(await response.json() as User)
        setResumed(true)
        setState("authenticated")
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") setState("network_error")
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const reset = () => { setUser(null); setState("anonymous") }
    window.addEventListener("academy:unauthorized", reset)
    return () => window.removeEventListener("academy:unauthorized", reset)
  }, [])

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, remember }),
      })
      if (response.status === 429) return setMessage("Trop de tentatives. Réessayez dans une minute.")
      if (!response.ok) return setMessage("Identifiant ou mot de passe incorrect.")
      setUser(await response.json() as User)
      setResumed(false)
      setPassword("")
      setState("authenticated")
    } catch {
      setMessage("Connexion réseau indisponible. Réessayez.")
    } finally {
      setBusy(false)
    }
  }

  async function onLogout() {
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRF-Token": csrfToken() },
      })
      if (!response.ok) throw new Error("logout failed")
      setUser(null)
      setState("anonymous")
    } catch {
      setMessage("Déconnexion impossible. Réessayez.")
    } finally {
      setBusy(false)
    }
  }

  const page = (
    <Box minH="100vh" bg="app.canvas" color="app.ink">
      {/* ADR-0024: keyboard users skip the header. */}
      <Link href="#contenu" position="absolute" left="2" top="-16" minH="11" zIndex="skipLink" px="3" py="2" rounded="md" bg="brand.solid" color="brand.contrast"
        fontWeight="semibold" _focus={{ top: "2" }}>Aller au contenu</Link>
      <Box as="header" borderBottomWidth="1px" borderColor="app.border" bg="app.surface">
        <Container maxW="7xl" py="3.5">
          <Flex align="center" justify="space-between" gap="3" wrap="wrap">
            <Flex align="center" gap="2.5">
              <Logo size={32} />
              <Text fontWeight="bold" letterSpacing="0.02em">ShopFlow <Text as="span" color="brand.fg">Academy</Text></Text>
            </Flex>
            <Flex align="center" gap={{ base: "2", md: "3" }} wrap="wrap" justify="end">
            <ThemeSwitch />
            {state === "authenticated" && user ? <Flex align="center" gap={{ base: "2", md: "3" }} wrap="wrap" justify="end">
              {user.role === "student" && <ComfortButton />}
              {user.role !== "observer" && <NotificationBell />}
              <Badge display={{ base: "none", sm: "inline-flex" }} colorPalette={user.role === "teacher" ? "saffron" : user.role === "observer" ? "gray" : "brand"} variant="subtle" rounded="full" px="2.5">{user.role === "teacher" ? "Enseignant" : user.role === "observer" ? "Observateur (lecture seule)" : "Étudiant"}</Badge>
              <Button size="sm" variant="outline" onClick={onLogout} loading={busy} aria-label="Se déconnecter">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" /></svg>
                <Box as="span" display={{ base: "none", sm: "inline" }}>Se déconnecter</Box></Button>
            </Flex> : <Text fontSize="sm" color="app.muted" display={{ base: "none", md: "block" }}>Python Data Engineering & SQL avancé</Text>}
            </Flex>
          </Flex>
        </Container>
      </Box>
      <Container as="main" id="contenu" tabIndex={-1} outline="none" maxW="7xl" py={{ base: "8", md: "12" }}>
        {state === "loading" && <Text role="status" color="app.muted">Chargement de votre espace…</Text>}
        {state === "network_error" && <Box role="alert" bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="card" p="6">L’Academy est momentanément indisponible. Rechargez la page dans quelques instants.</Box>}
        {state === "anonymous" && (
          <Flex gap={{ base: "10", md: "16" }} align="center" direction={{ base: "column", md: "row" }} minH={{ md: "60vh" }}>
            <Stack gap="5" flex="1" maxW="xl">
              <Text fontWeight="bold" color="saffron.fg" textTransform="uppercase" letterSpacing="0.12em" fontSize="sm">Module B3 IA/Data</Text>
              <Heading as="h1" size={{ base: "3xl", md: "5xl" }} lineHeight="1.1" letterSpacing="-0.02em">Apprendre en décidant sur de vraies situations de données.</Heading>
              <Text fontSize="lg" color="app.muted" lineHeight="1.7">Des missions courtes autour de ShopFlow : vous observez les données, vous choisissez, et vous recevez un retour immédiat. Aucun code à écrire pour avancer.</Text>
            </Stack>
            <Box as="section" bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="card" boxShadow="card" p={{ base: "6", md: "8" }} w="full" maxW="md" aria-label="Connexion">
              <form onSubmit={onLogin}>
              <Stack gap="5">
                <Flex align="center" gap="3"><Logo size={56} />
                  <Text fontWeight="bold" fontSize="xl" letterSpacing="0.01em">ShopFlow <Text as="span" color="brand.fg">Academy</Text></Text></Flex>
                <Stack gap="1"><Heading as="h2" size="xl">Connexion</Heading><Text color="app.muted" fontSize="sm">Utilisez l’identifiant transmis par votre enseignant.</Text></Stack>
                <Field.Root required>
                  <Field.Label>Identifiant</Field.Label>
                  <Input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required size="lg" />
                </Field.Root>
                <Field.Root required>
                  <Field.Label>Mot de passe</Field.Label>
                  <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required size="lg" />
                </Field.Root>
                {/* ADR-0029: a 30-day session kept by the server cookie only, never a token in localStorage. */}
                <chakra.label display="flex" alignItems="center" gap="3" minH="11" cursor="pointer" fontSize="sm">
                  <chakra.input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} w="5" h="5" accentColor="var(--chakra-colors-brand-solid)" />
                  <span>Rester connecté <Text as="span" color="app.muted">(30 jours sur cet appareil)</Text></span>
                </chakra.label>
                {message && <Text role="alert" color="red.fg" fontSize="sm">{message}</Text>}
                <Button type="submit" colorPalette="brand" size="lg" loading={busy} loadingText="Connexion…">Se connecter</Button>
              </Stack>
              </form>
            </Box>
          </Flex>
        )}
        {state === "authenticated" && user?.role === "observer" && <Stack gap="4"><ObserverHome />{message && <Text role="alert" color="red.fg">{message}</Text>}</Stack>}
        {state === "authenticated" && user?.role === "student" && <LeaderboardNavigation key={user.id} role={user.role}>
          <Stack gap="4"><StudentHome />{message && <Text role="alert" color="red.fg">{message}</Text>}</Stack></LeaderboardNavigation>}
      </Container>
    </Box>
  )
  if (state === "authenticated" && user?.role === "teacher") {
    return <NotificationProvider key={user.id}>
      <TeacherApp username={user.username} onLogout={() => void onLogout()} busy={busy} resumed={resumed} />
      {message && <Text role="alert" color="red.fg" position="fixed" bottom="4" left="50%" transform="translateX(-50%)" bg="app.surface" px="4" py="2" rounded="md" boxShadow="card">{message}</Text>}
    </NotificationProvider>
  }
  // ADR-0023: notifications for the signed-in user; students also send a presence heartbeat.
  return state === "authenticated" && user && user.role !== "observer"
    ? <NotificationProvider key={user.id} heartbeat={user.role === "student"}>{page}</NotificationProvider>
    : page
}
