import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { Box, Dialog, Input, Kbd, Portal, Stack, Text, chakra } from "@chakra-ui/react"
import { api } from "../api"
import { VIEWS, type TeacherRoute } from "./routes"

export type PaletteItem = { id: string; label: string; group: "Vues" | "Étudiants" | "Blocs"; route: TeacherRoute; keywords?: string }

/** Accent- and case-insensitive match on every word of the query. */
export function matches(item: PaletteItem, query: string): boolean {
  const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  const haystack = plain(`${item.label} ${item.group} ${item.keywords ?? ""}`)
  return plain(query).split(/\s+/).filter(Boolean).every((word) => haystack.includes(word))
}

export function viewItems(): PaletteItem[] {
  return VIEWS.flatMap((view) => view.subs.length
    ? view.subs.map((sub) => ({ id: `v-${view.key}-${sub.key}`, label: `${view.label} · ${sub.label}`, group: "Vues" as const, route: { view: view.key, sub: sub.key, params: {} } }))
    : [{ id: `v-${view.key}`, label: view.label, group: "Vues" as const, route: { view: view.key, sub: "", params: {} } }])
}

/** Cmd+K / Ctrl+K: go to a view, a student or a block (ADR-0031). */
export function CommandPalette({ open, onClose, onGo, assignmentId }: {
  open: boolean; onClose: () => void; onGo: (route: TeacherRoute) => void; assignmentId: number | null
}) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const [extra, setExtra] = useState<PaletteItem[]>([])
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery("")
    setActive(0)
    if (!assignmentId) return
    let live = true
    const base = `/teacher/classes/${assignmentId}`
    void Promise.allSettled([
      api<{ students: { id: number; display_name: string }[] }>(`${base}/overview`),
      api<{ blocks: { chapter_id: number; title: string; module: string }[] }>(`${base}/timeline`),
    ]).then(([overview, timeline]) => {
      if (!live) return
      const students = overview.status === "fulfilled" ? overview.value.students.map((student) => ({
        id: `s-${student.id}`, label: student.display_name, group: "Étudiants" as const,
        route: { view: "classe" as const, sub: "etudiants", params: { eleve: String(student.id) } } })) : []
      const blocks = timeline.status === "fulfilled" ? timeline.value.blocks.map((block) => ({
        id: `b-${block.chapter_id}`, label: block.title, group: "Blocs" as const, keywords: block.module,
        route: { view: "classe" as const, sub: "frise", params: {} } })) : []
      setExtra([...students, ...blocks])
    })
    return () => { live = false }
  }, [open, assignmentId])

  const items = useMemo(() => [...viewItems(), ...extra].filter((item) => matches(item, query)).slice(0, 30), [extra, query])
  useEffect(() => { setActive(0) }, [query])

  function go(item: PaletteItem | undefined) {
    if (!item) return
    onGo(item.route)
    onClose()
  }
  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(items.length - 1, value + 1)) }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(0, value - 1)) }
    if (event.key === "Enter") { event.preventDefault(); go(items[active]) }
  }

  return <Dialog.Root open={open} onOpenChange={(event) => { if (!event.open) onClose() }} initialFocusEl={() => input.current} placement="top" size="lg">
    <Portal>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content bg="app.surface" color="app.ink" mt={{ base: "4", md: "20" }} mx="4" aria-label="Recherche rapide">
          <Dialog.Header pb="2"><Dialog.Title fontSize="md">Aller à…</Dialog.Title></Dialog.Header>
          <Dialog.Body pb="5">
            <Input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKey} size="lg"
              placeholder="Une vue, un étudiant, un bloc…" role="combobox" aria-expanded="true" aria-controls="palette-list"
              aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined} aria-label="Rechercher une vue, un étudiant ou un bloc" />
            <Stack as="ul" id="palette-list" role="listbox" aria-label="Résultats" listStyleType="none" p="0" m="0" mt="3" gap="0.5" maxH="60vh" overflowY="auto">
              {items.length === 0 && <Text as="li" color="app.muted" p="3">Aucun résultat.</Text>}
              {items.map((item, index) => <chakra.li key={item.id} id={`palette-${item.id}`} role="option" aria-selected={index === active}
                onMouseEnter={() => setActive(index)} onClick={() => go(item)} cursor="pointer" px="3" py="2.5" rounded="md" display="flex" gap="3" alignItems="center"
                bg={index === active ? "brand.subtle" : "transparent"} color={index === active ? "brand.fg" : undefined}>
                <Box flex="1" minW="0" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{item.label}</Box>
                <Text fontSize="xs" color="app.muted">{item.group}</Text>
              </chakra.li>)}
            </Stack>
            <Text fontSize="xs" color="app.muted" mt="3">↑ ↓ pour choisir, <Kbd>Entrée</Kbd> pour ouvrir, <Kbd>Échap</Kbd> pour fermer.</Text>
          </Dialog.Body>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog.Root>
}
