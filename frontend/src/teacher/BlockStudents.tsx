import { useEffect, useId, useRef, useState } from "react"
import { Box, Button, Popover, Portal, Stack, Text } from "@chakra-ui/react"
import { api } from "../api"
import { msg, t } from "../i18n"
import { ActivityTime } from "../shared/ActivityTime"
import type { Live, LiveCell } from "./LivePanel"

export const BLOCK_STUDENTS_REFRESH_MS = 5000
const STATES: Record<LiveCell["state"], string> = {
  done: msg("terminé"), in_progress: msg("en cours"), not_started: msg("pas commencé"), closed: msg("fermé"),
}
/** Owner-only detail, fetched only while visible. Presence describes a page, never work. */
export function BlockStudents({ assignmentId, chapterId, title, completed, total }: {
  assignmentId: number; chapterId: number; title: string; completed: number; total: number
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Live | null>(null)
  const [stale, setStale] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const suppressFocus = useRef(false)
  const [now, setNow] = useState(Date.now)
  const [activated, setActivated] = useState(false)
  const closeTimer = useRef<number | undefined>(undefined)
  const panelId = useId()
  const show = () => { clearTimeout(closeTimer.current); if (!suppressFocus.current) setOpen(true) }
  const changeOpen = (value: boolean) => {
    if (!value) {
      suppressFocus.current = true
    }
    setOpen(value)
  }
  const hide = () => { closeTimer.current = window.setTimeout(() => { if (!content.current?.contains(document.activeElement)) changeOpen(false) }, 180) }
  useEffect(() => () => clearTimeout(closeTimer.current), [])
  useEffect(() => {
    if (!open) return
    const freshness = window.setInterval(() => setNow(Date.now()), 1000)
    let alive = true
    let timer: number | undefined
    setData(null); setStale(false)
    async function load() {
      try {
        const next = await api<Live>(`/teacher/classes/${assignmentId}/live`)
        if (alive) { setData(next); setStale(false) }
      } catch { if (alive) setStale(true) }
      if (alive) timer = window.setTimeout(() => void load(), BLOCK_STUDENTS_REFRESH_MS)
    }
    void load()
    return () => { alive = false; clearTimeout(timer); clearInterval(freshness) }
  }, [open, assignmentId, chapterId])
  const generated = data ? Date.parse(data.generated_at) : NaN
  const old = stale || !Number.isFinite(generated) || now - generated > 75_000
  return <Popover.Root open={open} onOpenChange={(event) => changeOpen(event.open)} autoFocus={false} restoreFocus={activated}
    finalFocusEl={() => trigger.current} positioning={{ placement: "bottom-end", flip: true, slide: true, overflowPadding: 12, gutter: 6 }} lazyMount unmountOnExit>
    <Popover.Anchor asChild><Box onMouseEnter={show} onMouseLeave={hide} onPointerMove={(event) => { if (event.pointerType === "mouse" && (event.movementX || event.movementY)) { suppressFocus.current = false; show() } }}>
      <Button ref={trigger} size="xs" variant="ghost" aria-expanded={open} aria-controls={open ? panelId : undefined} aria-haspopup="dialog"
        aria-label={t("Progression du bloc {{title}} : {{completed}} sur {{total}} terminé", { title, completed, total })}
        onFocus={() => { if (!suppressFocus.current) show() }} onClick={() => {
          suppressFocus.current = false; setActivated(true); show()
          requestAnimationFrame(() => closeButton.current?.focus())
        }}>{completed} / {total} {t("terminé")}</Button>
    </Box></Popover.Anchor>
    <Portal><Popover.Positioner><Popover.Content ref={content} id={panelId} aria-label={t("Progression du bloc {{title}}", { title })}
      w="sm" maxW="calc(100vw - 24px)" p="4" bg="app.surface" color="app.ink" maxH="var(--available-height)" overflowY="auto"
      onMouseEnter={show} onMouseLeave={hide} onKeyDown={(event) => { if (event.key === "Escape") changeOpen(false) }}>
      <Popover.Title fontWeight="semibold">{title}</Popover.Title>
      <Text fontSize="xs" color="app.muted" mb="3">{t("Une page ouverte ne prouve pas un travail en cours.")}</Text>
      {(stale || (data && old)) && <Text role="status" color="red.fg" fontSize="sm">{t("Connexion perdue : données possiblement anciennes.")}</Text>}
      {!data ? <Text role="status">{stale ? t("Impossible de charger le détail du bloc.") : t("Chargement du suivi en direct…")}</Text> : <>
        <Text fontSize="xs" color="app.muted" mb="2">{t("Dernière actualisation")} : <ActivityTime value={data.generated_at} /></Text>
        <Stack as="ul" tabIndex={0} aria-label={t("Étudiants")} p="0" m="0" listStyleType="none" gap="3" maxH="45vh" overflowY="auto">
          {data.students.map((student) => {
            const cell = student.cells.find((item) => item.chapter_id === chapterId)
            const present = student.online && !old && !!student.seen_at && Number.isFinite(Date.parse(student.seen_at)) && now - Date.parse(student.seen_at) <= 75_000
            const name = student.name.includes("@") ? t("Étudiant {{id}}", { id: student.id }) : student.name
            return <Box as="li" key={student.id} fontSize="sm">
              <Text fontWeight="semibold">{name} · {cell ? t(STATES[cell.state]) : t("État indisponible")}{cell ? ` (${cell.done}/${cell.total})` : ""}</Text>
              <Text color="app.muted">{old || (student.online && !present) ? t("Présence non confirmée") : present ? t("en ligne") : t("Hors ligne")}</Text>
              {student.mission && <Text>{present ? t("Page actuellement observée : {{mission}}", { mission: student.mission }) : t("Dernière page observée : {{mission}}", { mission: student.mission })}</Text>}
              <Text color="app.muted">{t("Dernière présence")} : <ActivityTime value={student.seen_at} /></Text>
            </Box>
          })}
        </Stack>
      </>}
      <Popover.CloseTrigger asChild aria-label={t("Fermer")} onClick={() => changeOpen(false)}><Button ref={closeButton} mt="3" variant="outline" size="xs">{t("Fermer")}</Button></Popover.CloseTrigger>
    </Popover.Content></Popover.Positioner></Portal>
  </Popover.Root>
}
