import type { ReactNode } from "react"
import { Box, Button, CloseButton, Dialog, Flex, HStack, Kbd, Portal, RadioCard, Stack, Switch, Tabs, Text } from "@chakra-ui/react"
import { useColorMode, type ThemeChoice } from "../useColorMode"
import { displayName, roleLabel } from "./account"
import { ZOOM_STEPS, modKey, nextZoom, percent, useReducedMotion, useZoom } from "./display"
import type { Account } from "./PreferencesProvider"

export type SettingsTab = "general" | "appearance" | "shortcuts"

const TABS: { value: SettingsTab; label: string }[] = [
  { value: "general", label: "Général" },
  { value: "appearance", label: "Apparence" },
  { value: "shortcuts", label: "Raccourcis" },
]

/** Settings dialog (ADR-0036): general information, appearance (theme, text size, motion), keyboard shortcuts. */
export function SettingsDialog({ open, onClose, tab, onTab, account }: {
  open: boolean; onClose: () => void; tab: SettingsTab; onTab: (tab: SettingsTab) => void; account: Account | null
}) {
  return <Dialog.Root open={open} onOpenChange={(event) => { if (!event.open) onClose() }} size={{ base: "full", md: "xl" }} placement="center" motionPreset="scale">
    <Portal>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content bg="app.surface" color="app.ink" rounded={{ base: "none", md: "2xl" }} overflow="hidden" minH={{ md: "28rem" }}>
          <Dialog.Header px="6" pt="5" pb="3" borderBottomWidth="1px" borderColor="app.border">
            <Dialog.Title fontFamily="heading" fontSize="2xl" fontWeight="semibold">Paramètres</Dialog.Title>
          </Dialog.Header>
          <Dialog.CloseTrigger asChild top="4" insetEnd="4"><CloseButton size="sm" aria-label="Fermer les paramètres" /></Dialog.CloseTrigger>
          <Dialog.Body p="0">
            <Tabs.Root value={tab} onValueChange={(event) => onTab(event.value as SettingsTab)} orientation="vertical" lazyMount unmountOnExit
              variant="subtle" colorPalette="gray" display="flex" flexDirection={{ base: "column", md: "row" }} h="full">
              {/* A column of sections on a computer, a row on a phone (CSS only: no media query in JavaScript). */}
              <Tabs.List aria-label="Rubriques des paramètres" w={{ base: "full", md: "44" }} flexShrink={0} p="3" gap="1"
                flexDirection={{ base: "row", md: "column" }} overflowX="auto"
                borderRightWidth={{ base: "0", md: "1px" }} borderBottomWidth={{ base: "1px", md: "0" }} borderColor="app.border" bg="app.canvas">
                {TABS.map((item) => <Tabs.Trigger key={item.value} value={item.value} justifyContent="flex-start" rounded="lg" px="3" h="9" fontWeight="medium"
                  color="app.muted" _selected={{ bg: "app.sunken", color: "app.ink" }}>{item.label}</Tabs.Trigger>)}
              </Tabs.List>
              <Box flex="1" minW="0" px={{ base: "5", md: "8" }} py="6" overflowY="auto" maxH={{ md: "70vh" }}>
                <Tabs.Content value="general" p="0"><Box className="view-enter"><General account={account} /></Box></Tabs.Content>
                <Tabs.Content value="appearance" p="0"><Box className="view-enter"><Appearance /></Box></Tabs.Content>
                <Tabs.Content value="shortcuts" p="0"><Box className="view-enter"><Shortcuts teacher={account?.role === "teacher"} /></Box></Tabs.Content>
              </Box>
            </Tabs.Root>
          </Dialog.Body>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog.Root>
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <Stack as="section" gap="3" pb="6" mb="6" borderBottomWidth="1px" borderColor="app.border" _last={{ borderBottomWidth: "0", mb: "0", pb: "0" }}>
    <Stack gap="0.5">
      <Text as="h3" fontWeight="semibold">{title}</Text>
      {description && <Text fontSize="sm" color="app.muted">{description}</Text>}
    </Stack>
    {children}
  </Stack>
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <Flex justify="space-between" align="center" gap="4" minH="10" wrap="wrap">
    <Text fontSize="sm" color="app.muted">{label}</Text>
    <Box fontSize="sm" textAlign="end">{children}</Box>
  </Flex>
}

function General({ account }: { account: Account | null }) {
  return <Stack gap="0">
    {account && <Section title="Profil" description="Ces informations viennent de votre compte ; votre enseignant les gère.">
      <Stack gap="1">
        <Row label="Nom affiché">{displayName(account.username)}</Row>
        <Row label="Identifiant"><Text as="span" css={{ overflowWrap: "anywhere" }}>{account.username}</Text></Row>
        <Row label="Rôle">{roleLabel(account.role)}</Row>
      </Stack>
    </Section>}
    <Section title="Langue" description="Langue de l’interface.">
      <Row label="Langue de l’interface">Français</Row>
      <Text fontSize="xs" color="app.muted">Le français est la seule langue disponible pour le moment.</Text>
    </Section>
  </Stack>
}

const THEMES: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: "light", label: "Clair", hint: "Fond ivoire" },
  { value: "dark", label: "Sombre", hint: "Fond anthracite" },
  { value: "system", label: "Système", hint: "Suit votre appareil" },
]

/** Small drawing of the interface in each theme (decorative). */
function ThemePreview({ value }: { value: ThemeChoice }) {
  const light = { bg: "#FAF9F5", card: "#FFFFFF", line: "#E6E3D9", ink: "#141413", accent: "#146457" }
  const dark = { bg: "#262624", card: "#30302E", line: "#3E3E3A", ink: "#FAF9F5", accent: "#B5532F" }
  const half = (colours: typeof light, clip?: string) => <Box position="absolute" inset="0" bg={colours.bg} css={clip ? { clipPath: clip } : undefined}>
    <Box position="absolute" left="10%" top="16%" w="50%" h="10%" rounded="sm" bg={colours.ink} opacity="0.85" />
    <Box position="absolute" left="10%" top="38%" w="80%" h="46%" rounded="md" bg={colours.card} borderWidth="1px" borderColor={colours.line} />
    <Box position="absolute" left="16%" top="50%" w="30%" h="8%" rounded="full" bg={colours.accent} />
  </Box>
  return <Box position="relative" w="full" h="20" rounded="lg" overflow="hidden" borderWidth="1px" borderColor="app.border" aria-hidden="true">
    {value === "dark" ? half(dark) : half(light)}
    {value === "system" && half(dark, "polygon(100% 0, 100% 100%, 0 100%)")}
  </Box>
}

function Appearance() {
  const { choice, choose } = useColorMode()
  const { zoom, setZoom } = useZoom()
  const { reduce, choose: chooseMotion } = useReducedMotion()
  const mod = modKey()
  return <Stack gap="0">
    <Section title="Thème" description="Mémorisé dans ce navigateur.">
      <RadioCard.Root value={choice} onValueChange={(event) => choose(event.value as ThemeChoice)} colorPalette="brand" variant="outline" size="sm">
        <RadioCard.Label srOnly>Thème</RadioCard.Label>
        <HStack gap="3" align="stretch">
          {THEMES.map((item) => <RadioCard.Item key={item.value} value={item.value} flex="1" rounded="xl" cursor="pointer"
            css={{ transition: "border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease", "&:hover": { transform: "translateY(-1px)" } }}>
            <RadioCard.ItemHiddenInput />
            <RadioCard.ItemControl flexDirection="column" alignItems="stretch" gap="2" p="2.5">
              <ThemePreview value={item.value} />
              <Stack gap="0">
                <RadioCard.ItemText fontSize="sm" fontWeight="semibold">{item.label}</RadioCard.ItemText>
                <RadioCard.ItemDescription fontSize="xs" color="app.muted">{item.hint}</RadioCard.ItemDescription>
              </Stack>
            </RadioCard.ItemControl>
          </RadioCard.Item>)}
        </HStack>
      </RadioCard.Root>
    </Section>
    <Section title="Taille du texte" description={`Agrandit ou réduit toute l’interface. Raccourcis : ${mod} + plus, ${mod} + moins, ${mod} + 0.`}>
      <HStack gap="2" role="group" aria-label="Taille du texte">
        <Button variant="outline" size="sm" onClick={() => setZoom(nextZoom(zoom, -1))} disabled={zoom === ZOOM_STEPS[0]} aria-label="Réduire la taille du texte">−</Button>
        <Text minW="16" textAlign="center" fontWeight="semibold" aria-live="polite" css={{ fontVariantNumeric: "tabular-nums" }}>{percent(zoom)}</Text>
        <Button variant="outline" size="sm" onClick={() => setZoom(nextZoom(zoom, 1))} disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]} aria-label="Agrandir la taille du texte">+</Button>
        <Button variant="ghost" size="sm" onClick={() => setZoom(1)} disabled={zoom === 1} color="app.muted">Réinitialiser</Button>
      </HStack>
    </Section>
    <Section title="Animations" description="Les transitions restent courtes ; vous pouvez les couper.">
      <Switch.Root checked={reduce} onCheckedChange={(event) => chooseMotion(event.checked)} colorPalette="brand" display="flex" justifyContent="space-between" w="full">
        <Switch.HiddenInput />
        <Switch.Label fontSize="sm" fontWeight="normal">Réduire les animations</Switch.Label>
        <Switch.Control><Switch.Thumb /></Switch.Control>
      </Switch.Root>
    </Section>
  </Stack>
}

function Shortcuts({ teacher }: { teacher: boolean }) {
  const mod = modKey()
  const rows: [string, string[]][] = [
    ...(teacher ? [["Recherche rapide", [mod, "K"]] as [string, string[]]] : []),
    ["Ouvrir les paramètres", [mod, ","]],
    ["Agrandir le texte", [mod, "+"]],
    ["Réduire le texte", [mod, "−"]],
    ["Taille normale", [mod, "0"]],
    ["Fermer un menu ou une fenêtre", ["Échap"]],
  ]
  return <Section title="Raccourcis clavier">
    <Stack gap="0" as="dl">
      {rows.map(([label, keys]) => <Flex key={label} justify="space-between" align="center" minH="11" borderBottomWidth="1px" borderColor="app.border" _last={{ borderBottomWidth: "0" }}>
        <Text as="dt" fontSize="sm">{label}</Text>
        <HStack as="dd" gap="1">{keys.map((key) => <Kbd key={key} size="sm">{key}</Kbd>)}</HStack>
      </Flex>)}
    </Stack>
  </Section>
}
