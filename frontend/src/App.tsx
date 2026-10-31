import { t } from "./i18n"
import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Badge, Box, Button, Container, Field, Flex, Heading, Input, Link, Stack, Text, chakra } from "@chakra-ui/react"
import { TeacherApp } from "./teacher/TeacherApp"
import { StudentHome } from "./StudentHome"
import { ObserverHome } from "./observer/ObserverHome"
import { InvitationPage, invitationToken } from "./observer/InvitationPage"
import { useColorMode } from "./useColorMode"
import { LoginIntro } from "./LoginIntro"
import { AccountMenu } from "./preferences/AccountMenu"
import { PreferencesProvider } from "./preferences/PreferencesProvider"
import { Logo } from "./Logo"
import { BrandName } from "./BrandName"
import { NotificationBell, NotificationProvider } from "./live/notifications"
import { ComfortButton } from "./comfort/Comfort"
import { LeaderboardNavigation } from "./leaderboard/LeaderboardPage"
import type { User } from "./studioTypes"
import { RECOVERED_EVENT, isGatewayFailure, reportOutage } from "./resilience"
import { OutageBanner, UnavailablePage } from "./Unavailable"

type PageState = "loading" | "anonymous" | "authenticated" | "unavailable"

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
  // The login page has no theme switch: it follows the system, or the choice already remembered (ADR-0036).
  useColorMode()
  const cardLogo = useRef<HTMLDivElement>(null)
  const [user, setUser] = useState<User | null>(null)
  const [username, setUsername] = useState("")
  const [invitation, setInvitation] = useState(() => invitationToken(window.location.hash))
  const [notice, setNotice] = useState("")
  useEffect(() => {
    const changed = () => setInvitation(invitationToken(window.location.hash))
    window.addEventListener("hashchange", changed)
    return () => window.removeEventListener("hashchange", changed)
  }, [])
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  // ADR-0031: a resumed session reopens the teacher's last view; a fresh login starts on « Aujourd’hui ».
  const [resumed, setResumed] = useState(false)

  // ADR-0038: only a 401 means « signed out ». A gateway error or a cut network shows the « momentanément
  // indisponible » page, which tries again by itself and then opens the requested address (the hash is kept).
  const check = useCallback((signal?: AbortSignal) => {
    fetch("/api/v1/auth/me", { credentials: "same-origin", signal })
      .then(async (response) => {
        if (response.status === 401) return setState("anonymous")
        if (!response.ok) {
          setState("unavailable")
          reportOutage()
          return
        }
        setUser(await response.json() as User)
        setResumed(true)
        setState("authenticated")
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return
        setState("unavailable")
        reportOutage()
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    check(controller.signal)
    return () => controller.abort()
  }, [check])

  const stateRef = useRef(state)
  stateRef.current = state
  useEffect(() => {
    const again = () => { if (stateRef.current === "unavailable") check() }
    window.addEventListener(RECOVERED_EVENT, again)
    return () => window.removeEventListener(RECOVERED_EVENT, again)
  }, [check])

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
        body: JSON.stringify({ username, password }),
      })
      if (response.status === 429) return setMessage(t("Trop de tentatives. Réessayez dans une minute."))
      if (isGatewayFailure(response)) return setMessage(t("La plateforme est momentanément indisponible. Réessayez dans un instant."))
      if (!response.ok) return setMessage(t("Identifiant ou mot de passe incorrect."))
      setUser(await response.json() as User)
      setResumed(false)
      setPassword("")
      setState("authenticated")
    } catch {
      setMessage(t("Connexion réseau indisponible. Réessayez."))
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
      setMessage(t("Déconnexion impossible. Réessayez."))
    } finally {
      setBusy(false)
    }
  }

  const page = (
    <Box minH="100vh" bg="app.canvas" color="app.ink">
      {/* ADR-0024: keyboard users skip the header. */}
      <Link href="#contenu" position="absolute" left="2" top="-16" minH="11" zIndex="skipLink" px="3" py="2" rounded="md" bg="brand.solid" color="brand.contrast"
        fontWeight="semibold" _focus={{ top: "2" }}>{t("Aller au contenu")}</Link>
      <Box as="header" borderBottomWidth="1px" borderColor="app.border" bg="app.surface">
        <Container maxW="7xl" py="3.5">
          <Flex align="center" justify="space-between" gap="3" wrap="wrap">
            <Flex align="center" gap="2.5">
              <Logo size={32} />
              <BrandName />
            </Flex>
            <Flex align="center" gap={{ base: "2", md: "3" }} wrap="wrap" justify="end">
            {state === "authenticated" && user ? <Flex align="center" gap={{ base: "1.5", md: "2" }} wrap="wrap" justify="end">
              {user.role === "student" && <ComfortButton />}
              {user.role !== "observer" && <NotificationBell />}
              {user.role === "observer" && <Badge display={{ base: "none", sm: "inline-flex" }} colorPalette="gray" variant="subtle" rounded="full" px="2.5">{t("Observateur (lecture seule)")}</Badge>}
              <AccountMenu account={{ username: user.username, role: user.role }} onLogout={() => void onLogout()} busy={busy} variant="header" />
            </Flex> : null}
            </Flex>
          </Flex>
        </Container>
      </Box>
      <Container as="main" id="contenu" tabIndex={-1} outline="none" maxW="7xl" py={{ base: "8", md: "12" }}>
        {state === "loading" && <Text role="status" color="app.muted">{t("Chargement de votre espace…")}</Text>}
        {/* ADR-0042: an invited observer chooses a password before signing in. */}
        {state === "anonymous" && invitation && <InvitationPage token={invitation} onDone={(name) => {
          setUsername(name); setInvitation(null); setNotice(t("Compte activé : connectez-vous avec votre mot de passe."))
          window.history.replaceState(null, "", "#/")
        }} />}
        {state === "anonymous" && !invitation && (
          <Flex gap={{ base: "10", md: "16" }} align="center" direction={{ base: "column", md: "row" }} minH={{ md: "60vh" }}>
            <Stack gap="5" flex="1" maxW="xl">
              <Text fontWeight="bold" color="saffron.fg" textTransform="uppercase" letterSpacing="0.12em" fontSize="sm">{t("Rapidfox Academy")}</Text>
              <Heading as="h1" size={{ base: "3xl", md: "5xl" }} lineHeight="1.1" letterSpacing="-0.02em">{t("Apprenez la data en prenant de vraies décisions.")}</Heading>
              <Text fontWeight="medium" fontSize={{ base: "md", md: "lg" }}>{t("Module : Python Data Engineering & SQL Avancé · Classe : B3 IA/Data")}</Text>
              <Text fontSize="lg" color="app.muted" lineHeight="1.7">{t("Rapidfox Academy forme aux métiers de la donnée par la pratique : des missions courtes sur des cas réalistes, un retour immédiat à chaque décision, et votre meilleur essai qui compte. Dans ce module, vous travaillez sur ShopFlow, une boutique en ligne fictive, et CampusEquip, la location de matériel entre campus.")}</Text>
            </Stack>
            <Box as="section" bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="card" boxShadow="card" p={{ base: "6", md: "8" }} w="full" maxW="md" aria-label={t("Connexion")}>
              <form onSubmit={onLogin}>
              <Stack gap="5">
                {/* The opening animation (LoginIntro) lands on this logo, once per browser session. */}
                <Flex align="center" gap="3"><Box ref={cardLogo} w="56px" h="56px" flexShrink={0}><Logo size={56} /></Box>
                  <BrandName size="lg" /></Flex>
                <Stack gap="1"><Heading as="h2" size="xl">{t("Connexion")}</Heading><Text color="app.muted" fontSize="sm">{t("Utilisez l’identifiant transmis par votre enseignant.")}</Text></Stack>
                <Field.Root required>
                  <Field.Label>{t("Identifiant")}</Field.Label>
                  <Input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required size="lg" />
                </Field.Root>
                <Field.Root required>
                  <Field.Label>{t("Mot de passe")}</Field.Label>
                  <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required size="lg" />
                </Field.Root>
                {notice && <Text role="status" color="brand.fg" fontSize="sm" fontWeight="medium">{notice}</Text>}
                {message && <Text role="alert" color="red.fg" fontSize="sm">{message}</Text>}
                <Button type="submit" colorPalette="brand" size="lg" loading={busy} loadingText={t("Connexion…")}>{t("Se connecter")}</Button>
                {/* ADR-0038: every session lasts 30 days, kept by the server cookie only (never a token in localStorage). */}
                <Text fontSize="xs" color="app.muted" textAlign="center">{t("Vous restez connecté 30 jours sur cet appareil. Sur un ordinateur partagé, déconnectez-vous depuis le menu de votre compte.")}</Text>
              </Stack>
              </form>
            </Box>
            <LoginIntro target={cardLogo} size={56} />
          </Flex>
        )}
        {state === "authenticated" && user?.role === "observer" && <Stack gap="4"><ObserverHome />{message && <Text role="alert" color="red.fg">{message}</Text>}</Stack>}
        {state === "authenticated" && user?.role === "student" && <LeaderboardNavigation key={user.id} role={user.role}>
          <Stack gap="4"><StudentHome />{message && <Text role="alert" color="red.fg">{message}</Text>}</Stack></LeaderboardNavigation>}
      </Container>
    </Box>
  )
  const account = state === "authenticated" && user ? { username: user.username, role: user.role } : null
  if (state === "unavailable") return <UnavailablePage />
  if (state === "authenticated" && user?.role === "teacher") {
    return <PreferencesProvider account={account}><NotificationProvider key={user.id}>
      <OutageBanner />
      <TeacherApp username={user.username} onLogout={() => void onLogout()} busy={busy} resumed={resumed} />
      {message && <Text role="alert" color="red.fg" position="fixed" bottom="4" left="50%" transform="translateX(-50%)" bg="app.surface" px="4" py="2" rounded="md" boxShadow="card">{message}</Text>}
    </NotificationProvider></PreferencesProvider>
  }
  // ADR-0023: notifications for the signed-in user; students also send a presence heartbeat.
  return <PreferencesProvider account={account}>{state === "authenticated" && <OutageBanner />}{state === "authenticated" && user && user.role !== "observer"
    ? <NotificationProvider key={user.id} heartbeat={user.role === "student"}>{page}</NotificationProvider>
    : page}</PreferencesProvider>
}
