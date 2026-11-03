import { LANGUAGES, msg, setLanguage, t, useLanguage, type Lang } from "../i18n"
import type { ReactNode } from "react"
import { Box, Button, CloseButton, Dialog, Flex, HStack, Kbd, NativeSelect, Portal, RadioCard, Stack, Switch, Tabs, Text } from "@chakra-ui/react"
import { useColorMode, useColorPalette, type ThemeChoice, type PaletteChoice } from "../useColorMode"
import { displayName, roleLabel } from "./account"
import { ZOOM_STEPS, modKey, nextZoom, percent, useReducedMotion, useZoom } from "./display"
import { useSound } from "../rewards/celebrate"
import { useRafiSound } from "../rafi/sound"
import type { Account } from "./PreferencesProvider"

export type SettingsTab = "general" | "appearance" | "shortcuts"

const TABS: { value: SettingsTab; label: string }[] = [
  { value: "general", label: msg("Général") },
  { value: "appearance", label: msg("Apparence") },
  { value: "shortcuts", label: msg("Raccourcis") },
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
            <Dialog.Title fontFamily="heading" fontSize="2xl" fontWeight="semibold">{t("Paramètres")}</Dialog.Title>
          </Dialog.Header>
          <Dialog.CloseTrigger asChild top="4" insetEnd="4"><CloseButton size="sm" aria-label={t("Fermer les paramètres")} /></Dialog.CloseTrigger>
          <Dialog.Body p="0">
            <Tabs.Root value={tab} onValueChange={(event) => onTab(event.value as SettingsTab)} orientation="vertical" lazyMount unmountOnExit
              variant="subtle" colorPalette="gray" display="flex" flexDirection={{ base: "column", md: "row" }} h="full">
              {/* A column of sections on a computer, a row on a phone (CSS only: no media query in JavaScript). */}
              <Tabs.List aria-label={t("Rubriques des paramètres")} w={{ base: "full", md: "44" }} flexShrink={0} p="3" gap="1"
                flexDirection={{ base: "row", md: "column" }} overflowX="auto"
                borderRightWidth={{ base: "0", md: "1px" }} borderBottomWidth={{ base: "1px", md: "0" }} borderColor="app.border" bg="app.canvas">
                {TABS.map((item) => <Tabs.Trigger key={item.value} value={item.value} justifyContent="flex-start" rounded="lg" px="3" h="9" fontWeight="medium"
                  color="app.muted" _selected={{ bg: "app.sunken", color: "app.ink" }}>{t(item.label)}</Tabs.Trigger>)}
              </Tabs.List>
              <Box flex="1" minW="0" px={{ base: "5", md: "8" }} py="6" overflowY="auto" maxH={{ md: "70vh" }}>
                <Tabs.Content value="general" p="0"><Box className="view-enter"><General account={account} /></Box></Tabs.Content>
                <Tabs.Content value="appearance" p="0"><Box className="view-enter"><Appearance student={account?.role === "student"} /></Box></Tabs.Content>
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
  const lang = useLanguage()
  return <Stack gap="0">
    {account && <Section title={t("Profil")} description={t("Ces informations viennent de votre compte ; votre enseignant les gère.")}>
      <Stack gap="1">
        <Row label={t("Nom affiché")}>{displayName(account.username)}</Row>
        <Row label={t("Identifiant")}><Text as="span" css={{ overflowWrap: "anywhere" }}>{account.username}</Text></Row>
        <Row label={t("Rôle")}>{roleLabel(account.role)}</Row>
      </Stack>
    </Section>}
    <Section title={t("Langue")} description={t("Langue de l’interface. Le contenu des cours reste dans sa langue d’origine.")}>
      <Row label={t("Langue de l’interface")}>
        <NativeSelect.Root size="sm" w="40">
          <NativeSelect.Field aria-label={t("Langue de l’interface")} value={lang} onChange={(event) => setLanguage(event.target.value as Lang)}>
            {LANGUAGES.map((item) => <option key={item.code} value={item.code} lang={item.code}>{item.label}</option>)}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Row>
      <Text fontSize="xs" color="app.muted">{t("Mémorisé dans ce navigateur.")}</Text>
    </Section>
  </Stack>
}

const THEMES: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: "light", label: msg("Clair"), hint: msg("Fond ivoire") },
  { value: "dark", label: msg("Sombre"), hint: msg("Fond anthracite") },
  { value: "system", label: msg("Système"), hint: msg("Suit votre appareil") },
]

/** Small drawing of the interface in each theme (decorative). */
function ThemePreview({ value, palette }: { value: ThemeChoice; palette: PaletteChoice }) {
  const light = palette === "catppuccin" ? { bg: "#EFF1F5", card: "#EFF1F5", line: "#BCC0CC", ink: "#4C4F69", accent: "#8839EF" } : { bg: "#FAF9F5", card: "#FFFFFF", line: "#E6E3D9", ink: "#141413", accent: "#146457" }
  const dark = palette === "catppuccin" ? { bg: "#1E1E2E", card: "#313244", line: "#585B70", ink: "#CDD6F4", accent: "#CBA6F7" } : { bg: "#262624", card: "#30302E", line: "#3E3E3A", ink: "#FAF9F5", accent: "#B5532F" }
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

function Appearance({ student = false }: { student?: boolean }) {
  const { choice, choose } = useColorMode()
  const { palette, choosePalette } = useColorPalette()
  const { zoom, setZoom } = useZoom()
  const { reduce, choose: chooseMotion } = useReducedMotion()
  const sound = useSound()
  const rafi = useRafiSound()
  const mod = modKey()
  return <Stack gap="0">
    <Section title={t("Palette")} description={t("Indépendante du mode clair, sombre ou système. Le thème habituel reste le choix par défaut.")}>
      <NativeSelect.Root><NativeSelect.Field aria-label={t("Palette de couleurs")} value={palette} onChange={(event) => choosePalette(event.target.value as PaletteChoice)}>
        <option value="classic">{t("Rapidfox (par défaut)")}</option><option value="catppuccin">Catppuccin (Latte / Mocha)</option>
      </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
    </Section>
    <Section title={t("Thème")} description={t("Mémorisé dans ce navigateur.")}>
      <RadioCard.Root value={choice} onValueChange={(event) => choose(event.value as ThemeChoice)} colorPalette="brand" variant="outline" size="sm">
        <RadioCard.Label srOnly>{t("Thème")}</RadioCard.Label>
        <HStack gap="3" align="stretch">
          {THEMES.map((item) => <RadioCard.Item key={item.value} value={item.value} flex="1" rounded="xl" cursor="pointer"
            css={{ transition: "border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease", "&:hover": { transform: "translateY(-1px)" } }}>
            <RadioCard.ItemHiddenInput />
            <RadioCard.ItemControl flexDirection="column" alignItems="stretch" gap="2" p="2.5">
              <ThemePreview value={item.value} palette={palette} />
              <Stack gap="0">
                <RadioCard.ItemText fontSize="sm" fontWeight="semibold">{t(item.label)}</RadioCard.ItemText>
                <RadioCard.ItemDescription fontSize="xs" color="app.muted">{palette === "catppuccin" && item.value !== "system" ? item.value === "light" ? "Latte" : "Mocha" : t(item.hint)}</RadioCard.ItemDescription>
              </Stack>
            </RadioCard.ItemControl>
          </RadioCard.Item>)}
        </HStack>
      </RadioCard.Root>
    </Section>
    <Section title={t("Taille du texte")} description={t("Agrandit ou réduit toute l’interface. Raccourcis : {{mod}} + plus, {{mod1}} + moins, {{mod2}} + 0.", { mod, mod1: mod, mod2: mod })}>
      <HStack gap="2" role="group" aria-label={t("Taille du texte")}>
        <Button variant="outline" size="sm" onClick={() => setZoom(nextZoom(zoom, -1))} disabled={zoom === ZOOM_STEPS[0]} aria-label={t("Réduire la taille du texte")}>−</Button>
        <Text minW="16" textAlign="center" fontWeight="semibold" aria-live="polite" css={{ fontVariantNumeric: "tabular-nums" }}>{percent(zoom)}</Text>
        <Button variant="outline" size="sm" onClick={() => setZoom(nextZoom(zoom, 1))} disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]} aria-label={t("Agrandir la taille du texte")}>+</Button>
        <Button variant="ghost" size="sm" onClick={() => setZoom(1)} disabled={zoom === 1} color="app.muted">{t("Réinitialiser")}</Button>
      </HStack>
    </Section>
    <Section title={t("Animations")} description={t("Les transitions restent courtes ; vous pouvez les couper.")}>
      <Switch.Root checked={reduce} onCheckedChange={(event) => chooseMotion(event.checked)} colorPalette="brand" display="flex" justifyContent="space-between" w="full">
        <Switch.HiddenInput />
        <Switch.Label fontSize="sm" fontWeight="normal">{t("Réduire les animations")}</Switch.Label>
        <Switch.Control><Switch.Thumb /></Switch.Control>
      </Switch.Root>
    </Section>
    <Section title={t("Son de réussite")} description={t("Un son court à la fin d’un bloc ou d’une belle série. Coupé par défaut, et toujours coupé avec « Réduire les animations ».")}>
      <Switch.Root checked={sound.on} onCheckedChange={(event) => sound.choose(event.checked)} colorPalette="brand" display="flex" justifyContent="space-between" w="full">
        <Switch.HiddenInput />
        <Switch.Label fontSize="sm" fontWeight="normal">{t("Jouer un son de réussite")}</Switch.Label>
        <Switch.Control><Switch.Thumb /></Switch.Control>
      </Switch.Root>
    </Section>
    {student && <Section title={t("Sons de Rafi")} description={t("Deux notes courtes à l’arrivée d’une annonce, rarement. Rien avant votre premier clic ; votre enseignant peut aussi les couper pour la classe.")}>
      <Switch.Root checked={rafi.on} onCheckedChange={(event) => rafi.choose(event.checked)} colorPalette="brand" display="flex" justifyContent="space-between" w="full">
        <Switch.HiddenInput />
        <Switch.Label fontSize="sm" fontWeight="normal">{t("Sons de Rafi")}</Switch.Label>
        <Switch.Control><Switch.Thumb /></Switch.Control>
      </Switch.Root>
    </Section>}
  </Stack>
}

function Shortcuts({ teacher }: { teacher: boolean }) {
  const mod = modKey()
  const rows: [string, string[]][] = [
    ...(teacher ? [[t("Recherche rapide"), [mod, "K"]] as [string, string[]]] : []),
    [t("Ouvrir les paramètres"), [mod, ","]],
    [t("Agrandir le texte"), [mod, "+"]],
    [t("Réduire le texte"), [mod, "−"]],
    [t("Taille normale"), [mod, "0"]],
    [t("Fermer un menu ou une fenêtre"), [t("Échap")]],
  ]
  return <Section title={t("Raccourcis clavier")}>
    <Stack gap="0" as="dl">
      {rows.map(([label, keys]) => <Flex key={label} justify="space-between" align="center" minH="11" borderBottomWidth="1px" borderColor="app.border" _last={{ borderBottomWidth: "0" }}>
        <Text as="dt" fontSize="sm">{label}</Text>
        <HStack as="dd" gap="1">{keys.map((key) => <Kbd key={key} size="sm">{key}</Kbd>)}</HStack>
      </Flex>)}
    </Stack>
  </Section>
}
