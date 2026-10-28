import type { ReactNode } from "react"
import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react"
import type { MissionStatus } from "./types"

export type IconName = "check" | "retry" | "lock" | "bulb" | "arrow-right" | "arrow-left" | "alert" | "clock" | "target" | "pencil"
  | "book" | "list" | "sort" | "link" | "chart" | "code" | "play" | "star" | "search" | "chevron" | "layers" | "bell" | "send" | "user"

/** Small inline icons (no icon font, no emoji). Always paired with text. */
export function Icon({ name, size = 18 }: { name: "check" | "retry" | "lock" | "bulb" | "arrow-right" | "arrow-left" | IconName; size?: number }) {
  const paths: Record<string, ReactNode> = {
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    retry: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></>,
    lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></>,
    "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
    "arrow-left": <path d="M19 12H5M11 6l-6 6 6 6" />,
    alert: <><path d="M12 8v5M12 16.5v.5" /><circle cx="12" cy="12" r="9" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.5" /></>,
    pencil: <><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
    sort: <><path d="M8 4v16M4 8l4-4 4 4" /><path d="M16 20V4M12 16l4 4 4-4" /></>,
    link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
    chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5M12 16V8M16 16v-3" /></>,
    code: <><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /></>,
    play: <path d="M7 5l12 7-12 7z" />,
    star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" />,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
    chevron: <path d="M9 6l6 6-6 6" />,
    layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
    bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
    send: <><path d="M21 3L10 14" /><path d="M21 3l-7 18-4-7-7-4z" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>
}

const STATUS: Record<MissionStatus, { label: string; palette: string; icon?: "check" | "lock" }> = {
  completed: { label: "Réussie", palette: "green", icon: "check" },
  in_progress: { label: "En cours", palette: "saffron" },
  not_started: { label: "À faire", palette: "gray" },
  locked: { label: "Verrouillée", palette: "gray", icon: "lock" },
}

export function StatusBadge({ status }: { status: MissionStatus }) {
  const item = STATUS[status]
  return <Badge colorPalette={item.palette} variant={status === "completed" ? "solid" : "subtle"} gap="1" px="2" py="0.5" rounded="full">
    {item.icon && <Icon name={item.icon} size={12} />}{item.label}
  </Badge>
}

export function DemoBadge() {
  return <Badge colorPalette="saffron" variant="subtle" rounded="full" px="2">Démonstration</Badge>
}

export function Panel({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) {
  return <Box bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="card" boxShadow="card" p={{ base: "5", md: "6" }} {...rest}>{children}</Box>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <Panel role="alert">
    <Stack gap="3" align="start">
      <Flex gap="2" align="center" color="red.fg"><Icon name="alert" /><Text fontWeight="semibold">{message}</Text></Flex>
      <Text color="app.muted">Vérifiez votre connexion. Votre sélection en cours est conservée.</Text>
      <Button onClick={onRetry} colorPalette="brand"><Icon name="retry" />Réessayer</Button>
    </Stack>
  </Panel>
}

export function LoadingState({ label }: { label: string }) {
  return <Panel aria-busy="true"><Text role="status" color="app.muted">{label}</Text>
    <Stack gap="3" mt="4" aria-hidden="true">{[70, 90, 55].map((width) => <Box key={width} h="3" w={`${width}%`} bg="app.sunken" rounded="full" />)}</Stack>
  </Panel>
}

export const formatPoints = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",")

export function ScoreBar({ value, max, label }: { value: number; max: number; label: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0
  return <Box h="2" bg="app.sunken" rounded="full" overflow="hidden" role="img" aria-label={label}>
    <Box h="full" bg="brand.solid" w={`${ratio * 100}%`} transition="width 300ms ease-out" />
  </Box>
}
