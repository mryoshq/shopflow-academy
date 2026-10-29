import { Box, Link, Text } from "@chakra-ui/react"
import type { ExperienceDisplay } from "../studioTypes"
import { VOYAGE_READY } from "../voyage"

/** A lesson opens « Le voyage d'une donnée » at its starting scene (ADR-0033). */
export function ExperienceCard({ data }: { data: ExperienceDisplay }) {
  const title = data.title || "Le voyage d’une donnée"
  return <Box as="section" aria-label={title} p="4" borderWidth="1px" borderColor="brand.solid" borderLeftWidth="4px" rounded="lg" bg="brand.subtle">
    <Text fontWeight="semibold">{title}</Text>
    <Text fontSize="sm" color="app.muted" mt="1">Expérience interactive{data.scene ? `, à partir de la scène ${data.scene}` : ""}.</Text>
    {VOYAGE_READY
      ? <Link href={`#/voyage/${data.scene ?? 1}`} mt="3" display="inline-flex" alignItems="center" minH="11" px="4" rounded="md" bg="brand.solid" color="brand.contrast"
        fontWeight="semibold" _hover={{ textDecoration: "none" }}>Ouvrir l’expérience</Link>
      : <Text fontSize="sm" mt="2">Bientôt disponible dans l’Academy.</Text>}
  </Box>
}
