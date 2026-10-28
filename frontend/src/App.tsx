import { useEffect, useState, type FormEvent } from "react"
import { Badge, Box, Button, Container, Field, Flex, Heading, Input, Stack, Text } from "@chakra-ui/react"

type User = { id: number; username: string; role: "student" | "teacher" }
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
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/v1/auth/me", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) return setState("anonymous")
        if (!response.ok) throw new Error("API unavailable")
        setUser(await response.json() as User)
        setState("authenticated")
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") setState("network_error")
      })
    return () => controller.abort()
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
      if (response.status === 429) return setMessage("Trop de tentatives. Réessayez dans une minute.")
      if (!response.ok) return setMessage("Identifiant ou mot de passe incorrect.")
      setUser(await response.json() as User)
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

  return (
    <Box minH="100vh" bg="#f6f5f1" color="#132624">
      <Box as="header" borderBottomWidth="1px" borderColor="#d8dfd9" bg="white">
        <Container maxW="6xl" py="5">
          <Flex align="center" justify="space-between" gap="4">
            <Text fontWeight="bold" letterSpacing="0.08em">SHOPFLOW / ACADEMY</Text>
            <Badge colorPalette="teal" variant="subtle">Accès privé</Badge>
          </Flex>
        </Container>
      </Box>
      <Container as="main" maxW="6xl" py={{ base: "12", md: "20" }}>
        {state === "loading" && <Text role="status">Chargement de votre espace…</Text>}
        {state === "network_error" && <Text role="alert">L’Academy est momentanément indisponible. Rechargez la page.</Text>}
        {state === "anonymous" && (
          <Flex gap="12" align="start" direction={{ base: "column", md: "row" }}>
            <Stack gap="5" flex="1" maxW="xl">
              <Text fontWeight="semibold" color="#306f65" textTransform="uppercase" letterSpacing="0.12em">Python Data Engineering & SQL avancé</Text>
              <Heading as="h1" size={{ base: "3xl", md: "5xl" }} lineHeight="1.1">Apprendre en agissant sur des données.</Heading>
              <Text fontSize="lg" color="#405550" lineHeight="1.7">Connectez-vous pour accéder à votre espace. Les cours et le studio de création seront ajoutés progressivement.</Text>
            </Stack>
            <Box as="section" bg="white" borderWidth="1px" borderColor="#d8dfd9" rounded="xl" p="8" w="full" maxW="md" aria-label="Connexion">
              <form onSubmit={onLogin}>
              <Stack gap="5">
                <Heading as="h2" size="lg">Connexion</Heading>
                <Field.Root required>
                  <Field.Label>Identifiant</Field.Label>
                  <Input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
                </Field.Root>
                <Field.Root required>
                  <Field.Label>Mot de passe</Field.Label>
                  <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                </Field.Root>
                {message && <Text role="alert" color="red.700">{message}</Text>}
                <Button type="submit" colorPalette="teal" loading={busy}>Se connecter</Button>
              </Stack>
              </form>
            </Box>
          </Flex>
        )}
        {state === "authenticated" && user && (
          <Stack gap="8" maxW="3xl">
            <Flex justify="space-between" align="center" gap="4" wrap="wrap">
              <Badge colorPalette="teal" variant="subtle">{user.role === "teacher" ? "Enseignant" : "Étudiant"}</Badge>
              <Button variant="outline" onClick={onLogout} loading={busy}>Se déconnecter</Button>
            </Flex>
            <Stack gap="4">
              <Heading as="h1" size={{ base: "3xl", md: "4xl" }}>Bonjour, {user.username}</Heading>
              <Text fontSize="lg" color="#405550">{user.role === "teacher" ? "Votre espace enseignant est prêt. Le studio de cours arrive dans le lot P0-04." : "Votre espace étudiant est prêt. Aucun cours ne vous est encore attribué."}</Text>
            </Stack>
            <Box bg="white" borderWidth="1px" borderColor="#d8dfd9" rounded="xl" p="6">
              <Heading as="h2" size="md">{user.role === "teacher" ? "Studio de cours" : "Mes cours"}</Heading>
              <Text mt="3" color="#405550">{user.role === "teacher" ? "Aucun cours publié pour le moment." : "Aucun cours attribué pour le moment."}</Text>
            </Box>
            {message && <Text role="alert" color="red.700">{message}</Text>}
          </Stack>
        )}
      </Container>
    </Box>
  )
}
