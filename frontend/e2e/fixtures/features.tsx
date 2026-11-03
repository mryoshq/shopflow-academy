import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { Badge, Box, Button, ChakraProvider, Heading, Input, Stack, Text } from "@chakra-ui/react"
import { system } from "../../src/theme"
import { SettingsDialog, type SettingsTab } from "../../src/preferences/SettingsDialog"
import { setLanguage } from "../../src/i18n"
import { useColorMode } from "../../src/useColorMode"
import { LineChart } from "../../src/student/displays"
function Fixture() {
  useColorMode()
  const [open, setOpen] = useState(false), [tab, setTab] = useState<SettingsTab>("appearance")
  return <Box as="main" p="4" bg="app.canvas" color="app.ink" minH="100vh">
    <Heading>Fonctions locales fictives</Heading>
    <Button my="3" onClick={() => setOpen(true)}>Ouvrir les paramètres</Button>
    <Stack p="4" bg="app.surface" color="app.ink" borderWidth="1px" borderColor="app.border" rounded="lg" gap="3">
      <Text color="app.muted">Données et compte fictifs</Text>
      <label htmlFor="fixture-input">Champ de démonstration</label><Input id="fixture-input" placeholder="Saisir une valeur" />
      <Box><Badge colorPalette="green">Réussi</Badge> <Badge colorPalette="saffron">À revoir</Badge></Box>
      <LineChart data={{ kind: "line_chart", title: "Progression fictive", labels: ["Lun", "Mar", "Mer"], series: [{ name: "Réussites", values: [1, 2, 3] }, { name: "Bonus", values: [0, 1, 1] }] }} />
    </Stack>
    <SettingsDialog open={open} onClose={() => setOpen(false)} tab={tab} onTab={setTab} account={null} />
  </Box>
}
setLanguage("fr")
createRoot(document.getElementById("root")!).render(<ChakraProvider value={system}><Fixture /></ChakraProvider>)
