import { useEffect, useId, useRef, useState } from "react"
import { Box, Flex, Link, Stack, Text } from "@chakra-ui/react"
import { t, tn } from "../i18n"
import type { LiveStudent } from "./LivePanel"

const CLOSE_DELAY_MS = 150

/** « depuis 12 min », from the start of the current connection. */
export function onlineFor(since: string | null, now: number): string {
  if (!since) return ""
  const minutes = Math.floor((now - new Date(since).getTime()) / 60000)
  if (minutes < 1) return t("depuis moins d’une minute")
  if (minutes < 60) return tn("depuis {{count}} min", minutes)
  return t("depuis {{hours}} h {{minutes}}", { hours: Math.floor(minutes / 60), minutes: String(minutes % 60).padStart(2, "0") })
}

/**
 * « n en ligne » of the top bar. Hover, keyboard focus or a first touch shows who is online
 * (name, current mission, since when), from the same refresh as the count; a click still opens
 * Ma classe > Étudiants.
 */
export function OnlineStatus({ online, total, students }: { online: number; total: number; students: LiveStudent[] }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const touch = useRef(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const here = students.filter((student) => student.online)
  const now = Date.now()

  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false) }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", outside)
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", outside) }
  }, [open])

  const show = () => { window.clearTimeout(timer.current); setOpen(true) }
  const hide = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS) }

  return <Box ref={wrapper} position="relative"
    onPointerEnter={(event) => { if (event.pointerType === "mouse") show() }}
    onPointerLeave={(event) => { if (event.pointerType === "mouse") hide() }}
    onFocus={show}
    onBlur={(event) => { if (!wrapper.current?.contains(event.relatedTarget as Node)) hide() }}>
    <Link href="#/classe/etudiants" display="inline-flex" alignItems="center" gap="2" minH="11" px="2" rounded="md" fontSize="sm" color="app.ink"
      textDecoration="none" aria-label={tn("{{count}} étudiant en ligne sur {{total}}", online, { total })} aria-describedby={open ? panelId : undefined}
      onPointerDown={(event) => { touch.current = event.pointerType === "touch" }}
      onClick={(event) => {
        // A first touch shows the list; the next one (or the link in the list) opens the class.
        if (touch.current && !open) { event.preventDefault(); show() }
      }}>
      <Box w="2.5" h="2.5" rounded="full" bg={online ? "green.solid" : "app.border"} aria-hidden="true" />
      <Text as="span" aria-hidden="true" css={{ fontVariantNumeric: "tabular-nums" }}>{online}<Box as="span" display={{ base: "none", sm: "inline" }}> {t("en ligne")}</Box></Text>
    </Link>
    {open && <Box id={panelId} role="group" aria-label={t("Étudiants en ligne")} data-testid="online-panel"
      position="absolute" top="calc(100% + 4px)" right={{ base: "-24", sm: "0" }} zIndex="popover" w="xs" maxW="calc(100vw - 24px)"
      bg="app.surface" borderWidth="1px" borderColor="app.border" rounded="lg" boxShadow="lg" p="3"
      onPointerEnter={(event) => { if (event.pointerType === "mouse") show() }}>
      <Text fontWeight="semibold" fontSize="sm" mb="2">{tn("{{count}} étudiant en ligne sur {{total}}", online, { total })}</Text>
      {here.length === 0 ? <Text fontSize="sm" color="app.muted">{t("Personne n’est en ligne pour le moment.")}</Text>
        : <Stack as="ul" listStyleType="none" p="0" m="0" gap="2" maxH="60vh" overflowY="auto">{here.map((student) => <Flex as="li" key={student.id} gap="2.5" align="start">
          <Box mt="1.5" w="2" h="2" rounded="full" flexShrink={0} bg="green.solid" aria-hidden="true" />
          <Box minW="0">
            <Text fontSize="sm" fontWeight="medium">{student.name}</Text>
            <Text fontSize="xs" color="app.muted">{student.mission ?? t("Tableau de bord")}{student.online_since ? ` · ${onlineFor(student.online_since, now)}` : ""}</Text>
          </Box>
        </Flex>)}</Stack>}
      <Link href="#/classe/etudiants" display="inline-block" mt="3" fontSize="sm" color="brand.fg" onClick={() => setOpen(false)}>{t("Voir toute la classe")}</Link>
    </Box>}
  </Box>
}
