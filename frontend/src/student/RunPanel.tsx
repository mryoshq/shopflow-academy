import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react"
import type { RunView } from "../studioTypes"
import { CodeBlock } from "./displays"

/** Preconfigured executions of a mission: the code is shown; the server runs it (lab database, part C). */
export function RunPanel({ runs }: { runs: RunView[] | undefined }) {
  if (!runs || runs.length === 0) return null
  return <Stack gap="3" as="section" aria-label="Code à exécuter">
    {runs.map((run) => <Stack key={run.id} gap="2">
      <CodeBlock code={run.code} language={run.language} title={run.label} />
      <Flex gap="3" align="center" wrap="wrap">
        <Button size="sm" variant="outline" colorPalette="brand" disabled>Exécuter</Button>
        <Text fontSize="sm" color="app.muted">L’exécution sera disponible dès l’ouverture de la base de laboratoire.</Text>
      </Flex>
    </Stack>)}
    <Box />
  </Stack>
}
