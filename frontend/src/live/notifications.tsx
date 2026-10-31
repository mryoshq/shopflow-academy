import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Badge, Box, Button, CloseButton, Flex, Stack, Text } from "@chakra-ui/react"
import { api, ApiError } from "../api"
import { Icon } from "../student/ui"

/** Sprint 2, part H (ADR-0023): notifications for students and the teacher, heartbeat, Web Push. */

export type NotificationKind = "message" | "block_open" | "block_unlocked" | "help_handled"
  | "help" | "blocked" | "block_done" | "auto_soon" | "auto_done" | "disconnect"
export type Note = { id: number; kind: NotificationKind | string; text: string; data: Record<string, unknown>; sender: string | null; created_at: string; read_at: string | null }
type Feed = { unread: number; items: Note[] }

export const NOTIFICATION_POLL_MS = 8000
export const HEARTBEAT_MS = 30000
export const TOAST_MS = 10000
const GROUP_WINDOW_MS = 5 * 60 * 1000

export const KIND_LABELS: Record<string, string> = {
  message: "Message", block_open: "Bloc ouvert", block_unlocked: "Ouvert pour vous", help_handled: "Aide",
  help: "Demande d’aide", blocked: "Étudiant bloqué", block_done: "Bloc terminé", auto_soon: "Ouverture dans 2 min",
  auto_done: "Ouverture automatique", disconnect: "Déconnexion",
}
const REFRESH_KINDS = new Set(["block_open", "block_unlocked", "badge", "class_goal"])

type Ctx = { items: Note[]; unread: number; markRead: (ids: number[]) => Promise<void>; markAll: () => Promise<void> }
const NotificationsContext = createContext<Ctx>({ items: [], unread: 0, markRead: async () => {}, markAll: async () => {} })
export const useNotificationFeed = () => useContext(NotificationsContext)

/** Consecutive notifications of the same type within 5 minutes are shown as one group. */
export function groupNotes(items: Note[]): { kind: string; items: Note[] }[] {
  const groups: { kind: string; items: Note[] }[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    const previous = last?.items[last.items.length - 1]
    if (last && last.kind === item.kind && item.kind !== "message" && previous
      && Math.abs(new Date(previous.created_at).getTime() - new Date(item.created_at).getTime()) <= GROUP_WINDOW_MS) last.items.push(item)
    else groups.push({ kind: item.kind, items: [item] })
  }
  return groups
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

/** System notification when the tab is hidden and the user allowed it (no Web Push needed). */
function systemNotify(note: Note) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return
    new Notification("Rapidfox Academy", { body: note.text, tag: `academy-${note.id}`, icon: "/icons/icon-192.png" })
  } catch { /* not supported */ }
}

/** Polls the feed, raises toasts for new items, keeps the history. Mounted once for the signed-in user. */
export function NotificationProvider({ children, heartbeat = false }: { children: ReactNode; heartbeat?: boolean }) {
  const [items, setItems] = useState<Note[]>([])
  const [unread, setUnread] = useState(0)
  const [toasts, setToasts] = useState<Note[]>([])
  const lastId = useRef<number | null>(null)

  const poll = useCallback(async () => {
    try {
      const feed = await api<Feed>(`/notifications?after=${lastId.current ?? 0}`)
      setUnread(feed.unread)
      if (feed.items.length === 0) { if (lastId.current === null) lastId.current = 0; return }
      const first = lastId.current === null
      lastId.current = Math.max(lastId.current ?? 0, ...feed.items.map((item) => item.id))
      setItems((previous) => [...feed.items, ...previous.filter((item) => !feed.items.some((n) => n.id === item.id))].slice(0, 100))
      const fresh = feed.items.filter((item) => !item.read_at).reverse()
      if (!first) {
        setToasts((previous) => [...previous, ...fresh].slice(-3))
        fresh.forEach(systemNotify)
      }
      // A block opened while the page was loading arrives in the first batch too: refresh the dashboard.
      if (fresh.some((item) => REFRESH_KINDS.has(item.kind))) window.dispatchEvent(new Event("academy:refresh"))
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) return
    }
  }, [])

  useEffect(() => {
    void poll()
    const timer = setInterval(() => { void poll() }, NOTIFICATION_POLL_MS)
    // A Web Push "tickle" from the service worker: fetch at once.
    const onMessage = (event: MessageEvent) => { if (event.data === "academy:push") void poll() }
    navigator.serviceWorker?.addEventListener?.("message", onMessage)
    return () => { clearInterval(timer); navigator.serviceWorker?.removeEventListener?.("message", onMessage) }
  }, [poll])

  useEffect(() => {
    if (!heartbeat) return
    const beat = () => {
      const match = /^#\/mission\/(\d+)/.exec(window.location.hash)
      void api<{ unread: number }>("/presence", "POST", { mission_version_id: match ? Number(match[1]) : null })
        .then((result) => setUnread(result.unread)).catch(() => { /* next beat retries */ })
    }
    beat()
    const timer = setInterval(beat, HEARTBEAT_MS)
    window.addEventListener("hashchange", beat)
    return () => { clearInterval(timer); window.removeEventListener("hashchange", beat) }
  }, [heartbeat])

  const markRead = useCallback(async (ids: number[]) => {
    const pending = ids.filter((id) => items.find((item) => item.id === id && !item.read_at))
    if (!pending.length) return
    const now = new Date().toISOString()
    setItems((previous) => previous.map((item) => pending.includes(item.id) ? { ...item, read_at: now } : item))
    setUnread((value) => Math.max(0, value - pending.length))
    await Promise.all(pending.map((id) => api(`/notifications/${id}/read`, "POST").catch(() => undefined)))
  }, [items])
  const markAll = useCallback(async () => {
    const now = new Date().toISOString()
    setItems((previous) => previous.map((item) => item.read_at ? item : { ...item, read_at: now }))
    setUnread(0)
    await api("/notifications/read-all", "POST").catch(() => undefined)
  }, [])

  const value = useMemo(() => ({ items, unread, markRead, markAll }), [items, unread, markRead, markAll])
  return <NotificationsContext.Provider value={value}>
    {children}
    <Toasts toasts={toasts} onClose={(note, read) => {
      setToasts((previous) => previous.filter((item) => item.id !== note.id))
      if (read) void markRead([note.id])
    }} />
  </NotificationsContext.Provider>
}

/** Bottom-right toasts, 10 s at most; « J’ai lu » marks the item read (read receipt for the teacher). */
function Toasts({ toasts, onClose }: { toasts: Note[]; onClose: (note: Note, read: boolean) => void }) {
  return <Stack position="fixed" bottom={{ base: "3", md: "6" }} right={{ base: "3", md: "6" }} left={{ base: "3", md: "auto" }} gap="2" zIndex="toast"
    maxW={{ md: "sm" }} role="region" aria-label="Notifications récentes">
    {toasts.map((note) => <Toast key={note.id} note={note} onClose={onClose} />)}
  </Stack>
}

function Toast({ note, onClose }: { note: Note; onClose: (note: Note, read: boolean) => void }) {
  // The provider re-renders on every poll: keep the 10 s timer independent of the callback identity.
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const timer = setTimeout(() => close.current(note, false), TOAST_MS)
    return () => clearTimeout(timer)
  }, [note])
  return <Box role="status" aria-live="polite" bg="app.surface" borderWidth="1px" borderColor={note.kind === "message" ? "brand.solid" : "app.border"}
    borderLeftWidth="4px" borderLeftColor={note.kind === "message" ? "brand.solid" : note.kind === "help" || note.kind === "blocked" ? "saffron.solid" : "brand.400"}
    rounded="lg" boxShadow="lg" p="3">
    <Flex gap="2" align="start">
      <Box color="brand.fg" mt="0.5"><Icon name="bell" size={16} /></Box>
      <Stack gap="1" flex="1" minW="0">
        <Text fontSize="xs" fontWeight="bold" color="app.muted" textTransform="uppercase" letterSpacing="0.06em">
          {KIND_LABELS[note.kind] ?? "Notification"}{note.sender ? ` · ${note.sender}` : ""}
        </Text>
        <Text>{note.text}</Text>
        <Button size="xs" variant="outline" colorPalette="brand" alignSelf="start" onClick={() => onClose(note, true)}>J’ai lu</Button>
      </Stack>
      <CloseButton size="xs" aria-label="Fermer la notification" onClick={() => onClose(note, false)} />
    </Flex>
  </Box>
}

/** Header bell: unread badge, history (grouped), « Tout marquer comme lu », system notifications and Web Push. */
export function NotificationBell() {
  const { items, unread, markAll } = useNotificationFeed()
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKey)
    panel.current?.focus()
    return () => window.removeEventListener("keydown", onKey)
  }, [open])
  const groups = groupNotes(items)
  return <Box position="relative">
    <Button size="sm" variant="outline" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}
      aria-label={unread ? `Notifications : ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"}>
      <Icon name="bell" size={16} />{unread > 0 && <Badge colorPalette="saffron" variant="solid" rounded="full" minW="5" justifyContent="center">{unread > 99 ? "99+" : unread}</Badge>}
    </Button>
    {open && <Box ref={panel} tabIndex={-1} role="dialog" aria-label="Historique des notifications" position="absolute" right="0" top="calc(100% + 8px)" zIndex="popover"
      w={{ base: "min(92vw, 22rem)", md: "24rem" }} maxH="70vh" overflowY="auto" bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="lg" boxShadow="lg" p="3">
      <Flex justify="space-between" align="center" mb="2" gap="2">
        <Text fontWeight="semibold">Notifications</Text>
        <Flex gap="1">
          <Button size="xs" variant="ghost" disabled={!unread} onClick={() => void markAll()}>Tout marquer comme lu</Button>
          <CloseButton size={{ base: "md", md: "xs" }} minW={{ base: "11", md: "auto" }} aria-label="Fermer l’historique" onClick={() => setOpen(false)} />
        </Flex>
      </Flex>
      <SystemNotificationsSwitch />
      {groups.length === 0 ? <Text fontSize="sm" color="app.muted" py="2">Aucune notification pour le moment.</Text>
        : <Stack as="ul" listStyleType="none" p="0" m="0" gap="1.5">{groups.map((group) => <Box as="li" key={group.items[0].id} p="2" rounded="md"
          bg={group.items.some((item) => !item.read_at) ? "brand.subtle" : "transparent"}>
          <Text fontSize="xs" fontWeight="bold" color="app.muted">{KIND_LABELS[group.kind] ?? "Notification"}{group.items.length > 1 ? ` (${group.items.length})` : ""} · {timeOf(group.items[0].created_at)}</Text>
          {group.items.slice(0, 3).map((item) => <Text key={item.id} fontSize="sm">{item.sender ? `${item.sender} : ` : ""}{item.text}</Text>)}
          {group.items.length > 3 && <Text fontSize="xs" color="app.muted">et {group.items.length - 3} autre{group.items.length > 4 ? "s" : ""}</Text>}
        </Box>)}</Stack>}
    </Box>}
  </Box>
}

function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - value.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** Asks the browser's permission; subscribes to Web Push too when the server has VAPID keys. */
function SystemNotificationsSwitch() {
  const supported = typeof Notification !== "undefined"
  const [permission, setPermission] = useState(() => supported ? Notification.permission : "denied")
  const [status, setStatus] = useState("")
  // Permission already granted but no Web Push subscription in this browser: keep a way to finish.
  const [pushMissing, setPushMissing] = useState(false)
  useEffect(() => {
    if (!supported || Notification.permission !== "granted" || !("serviceWorker" in navigator) || !("PushManager" in window)) return
    let cancelled = false
    void (async () => {
      try {
        const key = await api<{ enabled: boolean }>("/push/key")
        if (!key.enabled) return
        const registration = await navigator.serviceWorker.getRegistration("/sw.js")
        const subscription = registration ? await registration.pushManager.getSubscription() : null
        if (!cancelled && !subscription) setPushMissing(true)
      } catch { /* leave as is */ }
    })()
    return () => { cancelled = true }
  }, [supported])
  if (!supported) return null
  async function enable() {
    setStatus("")
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result !== "granted") return setStatus("Notifications refusées par le navigateur.")
    try {
      const key = await api<{ enabled: boolean; public_key: string | null }>("/push/key")
      if (!key.enabled || !key.public_key || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        return setStatus("Notifications système activées (onglet ouvert).")
      }
      const registration = await navigator.serviceWorker.register("/sw.js")
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(key.public_key) })
      await api("/push/subscribe", "POST", { endpoint: subscription.endpoint })
      setStatus("Notifications système activées, même onglet fermé.")
    } catch {
      setStatus("Notifications système activées (onglet ouvert) ; l’envoi hors de l’onglet n’a pas pu être activé.")
    }
  }
  return <Box mb="2">
    {(permission !== "granted" || pushMissing) && <Button size="xs" variant="outline" colorPalette="brand" onClick={() => void enable().then(() => setPushMissing(false))}>
      {permission === "granted" ? "Activer les notifications hors de l’onglet" : "Activer les notifications système"}</Button>}
    {status && <Text fontSize="xs" color="app.muted" role="status" mt="1">{status}</Text>}
  </Box>
}
