import { useEffect, useState } from "react"
import { Badge, Box, Container, Flex, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react"

type ApiState = "loading" | "online" | "offline"

export function App() {
  const [apiState, setApiState] = useState<ApiState>("loading")

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/v1/status", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable")
        setApiState("online")
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") setApiState("offline")
      })
    return () => controller.abort()
  }, [])

  return (
    <Box minH="100vh" bg="#f6f5f1" color="#132624">
      <Box as="header" borderBottomWidth="1px" borderColor="#d8dfd9" bg="white">
        <Container maxW="6xl" py="5">
          <Flex align="center" justify="space-between" gap="4">
            <Text fontWeight="bold" letterSpacing="0.08em">SHOPFLOW / ACADEMY</Text>
            <Badge colorPalette="teal" variant="subtle">Fondations</Badge>
          </Flex>
        </Container>
      </Box>
      <Container as="main" maxW="6xl" py={{ base: "12", md: "20" }}>
        <Stack gap="10">
          <Stack gap="5" maxW="3xl">
            <Text fontWeight="semibold" color="#306f65" textTransform="uppercase" letterSpacing="0.12em">Python Data Engineering & SQL avancé</Text>
            <Heading as="h1" size={{ base: "3xl", md: "5xl" }} lineHeight="1.1">Apprendre en agissant sur des données.</Heading>
            <Text fontSize="lg" color="#405550" lineHeight="1.7">L’Academy prend forme. Le studio de création de cours, les missions interactives et le suivi des étudiants seront ouverts progressivement. Aucun cours n’est publié pour le moment.</Text>
          </Stack>
          <SimpleGrid columns={{ base: 1, md: 3 }} gap="5">
            <Feature title="Studio enseignant" description="Créer, prévisualiser et publier des cours depuis le navigateur." />
            <Feature title="Parcours étudiant" description="Décider, tester et recevoir un retour pédagogique sans écrire de code." />
            <Feature title="Progression fiable" description="Retrouver ses missions et ses résultats dans un espace personnel." />
          </SimpleGrid>
          <Box borderWidth="1px" borderColor="#cbd9d4" rounded="xl" bg="white" p="6" maxW="3xl" role="status" aria-live="polite">
            <Text fontWeight="semibold">État du socle technique</Text>
            <Text color="#405550" mt="2">{apiState === "loading" ? "Vérification de l’API…" : apiState === "online" ? "API disponible. Aucun cours publié." : "API momentanément indisponible. Réessayez plus tard."}</Text>
          </Box>
        </Stack>
      </Container>
    </Box>
  )
}

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <Box bg="white" borderWidth="1px" borderColor="#e0e6df" rounded="xl" p="6">
      <Heading as="h2" size="md">{title}</Heading>
      <Text mt="3" color="#405550" lineHeight="1.6">{description}</Text>
    </Box>
  )
}
