import { LANGUAGES, info, setLanguage, t, useLanguage, type Lang } from "../i18n"
import type { ReactNode } from "react"
import { Box, Flex, Menu, Portal, Text, chakra } from "@chakra-ui/react"
import { useColorMode, type ThemeChoice } from "../useColorMode"
import { displayName, initials, roleLabel } from "./account"
import { ZOOM_STEPS, modKey, percent, useZoom } from "./display"
import { usePreferences, type Account } from "./PreferencesProvider"

const ICONS: Record<string, ReactNode> = {
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  theme: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  language: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  text: <><path d="M4 7V5h11v2M9.5 5v14M7 19h5" /><path d="M14 13v-1.5h6V13M17 11.5V19M15.5 19h3" /></>,
  keyboard: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6.5 10h1M10.5 10h1M14.5 10h1M6.5 14h11" /></>,
  logout: <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />,
  chevrons: <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />,
}

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{ICONS[name]}</svg>
}

function Avatar({ username, size = "8" }: { username: string; size?: string }) {
  return <Flex as="span" w={size} h={size} flexShrink={0} rounded="full" align="center" justify="center" bg="brand.solid" color="brand.contrast"
    fontSize="xs" fontWeight="semibold" letterSpacing="0.02em" aria-hidden="true">{initials(username)}</Flex>
}

const itemStyle = { rounded: "md", px: "2.5", minH: "9", gap: "2.5", fontSize: "sm", cursor: "pointer" } as const
/** Radio items: the check mark sits in its own column on the left, the label never moves. */
const radioStyle = { ...itemStyle, ps: "8", position: "relative" } as const
const check = <Menu.ItemIndicator position="absolute" insetStart="2.5" color="brand.fg" />

/**
 * Account menu (ADR-0036), at the bottom of the teacher sidebar or in the student header: theme, language,
 * text size, settings dialog, shortcuts and sign-out, with short fade and scale transitions.
 */
export function AccountMenu({ account, onLogout, busy = false, variant, collapsed = false }: {
  account: Account; onLogout: () => void; busy?: boolean; variant: "sidebar" | "header"; collapsed?: boolean
}) {
  const { openSettings } = usePreferences()
  const lang = useLanguage()
  const { choice, choose } = useColorMode()
  const { zoom, setZoom } = useZoom()
  const name = displayName(account.username)
  const sidebar = variant === "sidebar"
  const submenu = sidebar ? "right-end" : "left-start"

  const trigger = sidebar
    ? <chakra.button type="button" aria-label={t("Compte et paramètres : {{name}}", { name })} display="flex" alignItems="center" gap="2.5" w="full" minH="12" px="2" rounded="lg"
        textAlign="start" color="app.ink" cursor="pointer" justifyContent={collapsed ? "center" : "flex-start"}
        _hover={{ bg: "app.sunken" }} _expanded={{ bg: "app.sunken" }}>
        <Avatar username={account.username} />
        {!collapsed && <><Box flex="1" minW="0" display={{ base: "none", md: "block" }}>
          <Text fontSize="sm" fontWeight="medium" lineClamp={1}>{name}</Text>
          <Text fontSize="xs" color="app.muted" lineClamp={1}>{roleLabel(account.role)}</Text>
        </Box>
        <Box color="app.muted" display={{ base: "none", md: "block" }}><Icon name="chevrons" /></Box></>}
      </chakra.button>
    : <chakra.button type="button" aria-label={t("Compte et paramètres : {{name}}", { name })} display="inline-flex" alignItems="center" justifyContent="center" p="1" rounded="full"
        cursor="pointer" _hover={{ bg: "app.sunken" }} _expanded={{ bg: "app.sunken" }}>
        <Avatar username={account.username} size="8" />
      </chakra.button>

  // Actions run on click: a mouse click, and Enter or Space on the highlighted item (Ark UI clicks it).
  return <Menu.Root positioning={{ placement: sidebar ? "top-start" : "bottom-end", gutter: 6 }}>
    <Menu.Trigger asChild>{trigger}</Menu.Trigger>
    <Portal>
      <Menu.Positioner>
        <Menu.Content minW="64" p="1.5" rounded="xl" bg="app.surface" borderWidth="1px" borderColor="app.border" boxShadow="lg" className="menu-pop">
          <Box px="2.5" pt="1.5" pb="2">
            <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>{name}</Text>
            <Text fontSize="xs" color="app.muted" lineClamp={1}>{account.username} · {roleLabel(account.role)}</Text>
          </Box>
          <Menu.Separator borderColor="app.border" />
          <Menu.Item value="settings" {...itemStyle} onClick={() => openSettings("general")}>
            <Icon name="settings" /><Box flex="1">{t("Paramètres")}</Box><Menu.ItemCommand color="app.muted">{modKey()} ,</Menu.ItemCommand>
          </Menu.Item>
          <Menu.Root positioning={{ placement: submenu, gutter: 4 }}>
            <Menu.TriggerItem {...itemStyle}><Icon name="theme" /><Box flex="1">{t("Thème")}</Box><Text as="span" fontSize="xs" color="app.muted">{choice === "light" ? t("Clair") : choice === "dark" ? t("Sombre") : t("Système")}</Text></Menu.TriggerItem>
            <Portal><Menu.Positioner><Menu.Content minW="44" p="1.5" rounded="xl" bg="app.surface" borderWidth="1px" borderColor="app.border" boxShadow="lg" className="menu-pop">
              <Menu.RadioItemGroup value={choice} onValueChange={(event) => choose(event.value as ThemeChoice)}>
                {([["system", t("Système")], ["light", t("Clair")], ["dark", t("Sombre")]] as const).map(([value, label]) =>
                  <Menu.RadioItem key={value} value={value} {...radioStyle}>{check}<Box flex="1">{label}</Box></Menu.RadioItem>)}
              </Menu.RadioItemGroup>
            </Menu.Content></Menu.Positioner></Portal>
          </Menu.Root>
          <Menu.Root positioning={{ placement: submenu, gutter: 4 }}>
            <Menu.TriggerItem {...itemStyle}><Icon name="text" /><Box flex="1">{t("Taille du texte")}</Box><Text as="span" fontSize="xs" color="app.muted">{percent(zoom)}</Text></Menu.TriggerItem>
            <Portal><Menu.Positioner><Menu.Content minW="44" p="1.5" rounded="xl" bg="app.surface" borderWidth="1px" borderColor="app.border" boxShadow="lg" className="menu-pop">
              <Menu.RadioItemGroup value={String(zoom)} onValueChange={(event) => setZoom(Number(event.value))}>
                {ZOOM_STEPS.map((step) => <Menu.RadioItem key={step} value={String(step)} {...radioStyle}>
                  {check}<Box flex="1" css={{ fontVariantNumeric: "tabular-nums" }}>{percent(step)}{step === 1 ? t(" (normal)") : ""}</Box></Menu.RadioItem>)}
              </Menu.RadioItemGroup>
            </Menu.Content></Menu.Positioner></Portal>
          </Menu.Root>
          <Menu.Root positioning={{ placement: submenu, gutter: 4 }}>
            <Menu.TriggerItem {...itemStyle}><Icon name="language" /><Box flex="1">{t("Langue")}</Box><Text as="span" fontSize="xs" color="app.muted">{info(lang).label}</Text></Menu.TriggerItem>
            <Portal><Menu.Positioner><Menu.Content minW="52" p="1.5" rounded="xl" bg="app.surface" borderWidth="1px" borderColor="app.border" boxShadow="lg" className="menu-pop">
              <Menu.RadioItemGroup value={lang} onValueChange={(event) => setLanguage(event.value as Lang)}>
                {/* Each language is named in itself (never translated), with its own lang attribute. */}
                {LANGUAGES.map((item) => <Menu.RadioItem key={item.code} value={item.code} {...radioStyle}>{check}<Box flex="1" lang={item.code}>{item.label}</Box></Menu.RadioItem>)}
              </Menu.RadioItemGroup>
            </Menu.Content></Menu.Positioner></Portal>
          </Menu.Root>
          <Menu.Item value="shortcuts" {...itemStyle} onClick={() => openSettings("shortcuts")}><Icon name="keyboard" /><Box flex="1">{t("Raccourcis clavier")}</Box></Menu.Item>
          <Menu.Separator borderColor="app.border" />
          <Menu.Item value="logout" {...itemStyle} disabled={busy} onClick={onLogout}><Icon name="logout" /><Box flex="1">{t("Se déconnecter")}</Box></Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Portal>
  </Menu.Root>
}
