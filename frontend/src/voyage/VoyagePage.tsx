import { useEffect, useState, type KeyboardEvent } from "react"
import { Box, Button, Flex, Heading, Stack, Text } from "@chakra-ui/react"
import { api } from "../api"
import { DEFAULT_VOYAGE, SCENE_COUNT, mergeVoyageData, type VoyageData } from "./data"

/**
 * Host page of « Le voyage d'une donnée » (#/voyage, #/voyage/<scene>). The scenes of the owner's application
 * are mounted here at integration; this frame already gives the route, the scene navigation (buttons and
 * arrow keys), the course values (merged over the defaults) and lazy loading.
 */
export default function VoyagePage({ scene = 1, onScene }: { scene?: number; onScene?: (scene: number) => void }) {
  const [data, setData] = useState<VoyageData>(DEFAULT_VOYAGE)
  const [fromCourse, setFromCourse] = useState(false)
  const [current, setCurrent] = useState(scene)
  useEffect(() => setCurrent(scene), [scene])
  useEffect(() => {
    let live = true
    api<{ data: unknown }>("/experiences/voyage/data")
      .then((result) => { if (live) { setData(mergeVoyageData(DEFAULT_VOYAGE, result.data)); setFromCourse(result.data !== null) } })
      .catch(() => undefined)
    return () => { live = false }
  }, [])
  function go(next: number) {
    const value = Math.min(SCENE_COUNT, Math.max(1, next))
    setCurrent(value)
    onScene?.(value)
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === "ArrowRight") { event.preventDefault(); go(current + 1) }
    if (event.key === "ArrowLeft") { event.preventDefault(); go(current - 1) }
  }
  return <Stack as="section" gap="5" aria-labelledby="voyage-title" onKeyDown={onKey}>
    <Stack gap="1">
      <Heading as="h1" id="voyage-title" size={{ base: "2xl", md: "3xl" }}>Le voyage d’une donnée</Heading>
      <Text color="app.muted">Une ligne de commande traverse le pipeline, de la source à la table propre.</Text>
    </Stack>
    <Flex as="nav" aria-label="Scènes" gap="2" wrap="wrap">
      {Array.from({ length: SCENE_COUNT }, (_, index) => index + 1).map((value) =>
        <Button key={value} size="sm" minW="11" variant={value === current ? "solid" : "outline"} colorPalette="brand"
          aria-current={value === current ? "step" : undefined} aria-label={`Scène ${value} sur ${SCENE_COUNT}`} onClick={() => go(value)}>{value}</Button>)}
    </Flex>
    <Box p={{ base: "4", md: "6" }} borderWidth="1px" borderColor="app.border" rounded="card" bg="app.surface" minH="48" aria-live="polite">
      <Text fontWeight="semibold">Scène {current} sur {SCENE_COUNT}</Text>
      <Text color="app.muted" mt="2">L’animation du propriétaire sera intégrée ici. Valeurs : {fromCourse ? "fournies par le cours" : "par défaut"}
        {Object.keys(data).length ? ` (${Object.keys(data).length} rubrique${Object.keys(data).length > 1 ? "s" : ""})` : ""}.</Text>
    </Box>
    <Flex gap="2" justify="space-between">
      <Button variant="outline" onClick={() => go(current - 1)} disabled={current <= 1}>← Scène précédente</Button>
      <Button colorPalette="brand" onClick={() => go(current + 1)} disabled={current >= SCENE_COUNT}>Scène suivante →</Button>
    </Flex>
  </Stack>
}
