import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react"
import { Badge, Box, Button, Flex, Stack, Text, VisuallyHidden } from "@chakra-ui/react"
import type { AnimationDisplay, FlowDisplay, MindNode, MindmapDisplay, SceneTable, VideoDisplay } from "../studioTypes"

/** Shared controls: play/pause, step by step, restart. Keyboard friendly, no timer shown. */
function Controls({ playing, onPlay, onPrevious, onNext, onRestart, step, total, label }: {
  playing: boolean; onPlay: () => void; onPrevious?: () => void; onNext: () => void; onRestart: () => void; step: number; total: number; label: string
}) {
  return <Flex gap="2" wrap="wrap" align="center" role="group" aria-label={`Commandes : ${label}`}>
    <Button size="sm" colorPalette="brand" onClick={onPlay} aria-pressed={playing}>{playing ? "Pause" : step >= total - 1 ? "Rejouer" : "Lecture"}</Button>
    {onPrevious && <Button size="sm" variant="outline" onClick={onPrevious} disabled={step === 0}>Étape précédente</Button>}
    <Button size="sm" variant="outline" onClick={onNext} disabled={step >= total - 1}>Étape suivante</Button>
    <Button size="sm" variant="ghost" onClick={onRestart}>Recommencer</Button>
    <Text fontSize="sm" color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }}>Étape {step + 1} sur {total}</Text>
  </Flex>
}

function useStepper(total: number, delay: number) {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing) return
    if (step >= total - 1) { setPlaying(false); return }
    const timer = window.setTimeout(() => setStep((value) => Math.min(total - 1, value + 1)), delay)
    return () => window.clearTimeout(timer)
  }, [playing, step, total, delay])
  return {
    step, playing,
    play: () => { if (playing) setPlaying(false); else { if (step >= total - 1) setStep(0); setPlaying(true) } },
    next: () => { setPlaying(false); setStep((value) => Math.min(total - 1, value + 1)) },
    previous: () => { setPlaying(false); setStep((value) => Math.max(0, value - 1)) },
    restart: () => { setPlaying(false); setStep(0) },
  }
}

const cssColor = (token: string) => `var(--chakra-colors-${token.replace(".", "-")})`
const BADGE = { ok: { palette: "green", label: "Correct" }, erreur: { palette: "red", label: "Erreur" }, attention: { palette: "saffron", label: "Attention" } } as const

function cellText(value: unknown): string {
  return value === null || value === undefined ? "vide" : String(value)
}

function describeTable(table: SceneTable): string {
  const rows = table.rows.map((row, index) => `ligne ${index + 1}${table.highlight.rows.includes(index) ? " (mise en évidence)" : ""} : ${row.map((cell, column) => `${table.columns[column]} ${cellText(cell)}`).join(", ")}`)
  return `${table.title || "Table"} — ${rows.length ? rows.join(" ; ") : "vide"}`
}

function SceneTableView({ table, index }: { table: SceneTable; index: number }) {
  const cells = new Set(table.highlight.cells.map(([row, column]) => `${row}:${column}`))
  return <Box flex="1" minW="44" borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface" overflow="hidden">
    {table.title && <Text px="3" py="1.5" fontSize="sm" fontWeight="semibold" bg="app.sunken">{table.title}</Text>}
    <table style={{ borderCollapse: "collapse", width: "100%", fontVariantNumeric: "tabular-nums" }}>
      <thead><tr>{table.columns.map((column) => <th key={column} scope="col" style={{ textAlign: "left", padding: "6px 10px", fontSize: 13, borderBottom: `1px solid ${cssColor("app.border")}` }}>{column}</th>)}</tr></thead>
      <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex} data-row={`${index}:${rowIndex}`}
        style={{ background: table.highlight.rows.includes(rowIndex) ? cssColor("saffron.subtle") : undefined }}>
        {row.map((cell, column) => <td key={column} style={{
          padding: "6px 10px", fontSize: 14, borderTop: `1px solid ${cssColor("app.border")}`,
          outline: cells.has(`${rowIndex}:${column}`) ? `3px solid ${cssColor("saffron.solid")}` : undefined, outlineOffset: -3,
          fontWeight: cells.has(`${rowIndex}:${column}`) ? 700 : undefined,
        }}>{cellText(cell)}</td>)}
      </tr>)}</tbody>
    </table>
  </Box>
}

/** Arrows between table rows, drawn over the scene from the rows' real positions. */
function ArrowLayer({ container, arrows, version }: { container: React.RefObject<HTMLDivElement | null>; arrows: AnimationDisplay["steps"][number]["scene"]["arrows"]; version: string }) {
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number; label: string }[]>([])
  const measure = useCallback(() => {
    const root = container.current
    if (!root) return
    const box = root.getBoundingClientRect()
    const next = []
    for (const arrow of arrows) {
      const from = root.querySelector<HTMLElement>(`[data-row="${arrow.source[0]}:${arrow.source[1]}"]`)
      const to = root.querySelector<HTMLElement>(`[data-row="${arrow.target[0]}:${arrow.target[1]}"]`)
      if (!from || !to) continue
      const a = from.getBoundingClientRect()
      const b = to.getBoundingClientRect()
      const leftToRight = a.left < b.left
      next.push({
        x1: (leftToRight ? a.right : a.left) - box.left, y1: a.top + a.height / 2 - box.top,
        x2: (leftToRight ? b.left : b.right) - box.left, y2: b.top + b.height / 2 - box.top, label: arrow.label,
      })
    }
    setLines(next)
  }, [container, arrows])
  useLayoutEffect(() => { measure() }, [measure, version])
  useEffect(() => {
    if (typeof ResizeObserver === "undefined" || !container.current) return
    const observer = new ResizeObserver(() => measure())
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [container, measure])
  if (!lines.length) return null
  return <svg aria-hidden="true" focusable="false" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
    <defs><marker id="sf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill={cssColor("brand.solid")} /></marker></defs>
    {lines.map((line, index) => <g key={index}>
      <path d={`M${line.x1},${line.y1} C${(line.x1 + line.x2) / 2},${line.y1} ${(line.x1 + line.x2) / 2},${line.y2} ${line.x2},${line.y2}`}
        fill="none" stroke={cssColor("brand.solid")} strokeWidth="2" markerEnd="url(#sf-arrow)" />
      {line.label && <text x={(line.x1 + line.x2) / 2} y={(line.y1 + line.y2) / 2 - 6} textAnchor="middle" fontSize="12" fill={cssColor("app.ink")}>{line.label}</text>}
    </g>)}
  </svg>
}

export function AnimationPlayer({ data }: { data: AnimationDisplay }) {
  const { step, playing, play, next, previous, restart } = useStepper(data.steps.length, 3200)
  const [describe, setDescribe] = useState(false)
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const current = data.steps[step]
  const { scene } = current
  return <Box as="figure" m="0" p="4" borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface">
    <Stack gap="3">
      <Text as="figcaption" fontWeight="semibold">{data.title}</Text>
      <Text aria-live="polite" fontSize="lg" minH="7"><VisuallyHidden>Étape {step + 1} sur {data.steps.length} : </VisuallyHidden>{current.caption}</Text>
      <Box ref={sceneRef} position="relative" key={step} css={{ animation: "fade-in 250ms ease-out" }}>
        <Flex gap={{ base: "4", md: "12" }} wrap="wrap" align="start">{scene.tables.map((table, index) => <SceneTableView key={index} table={table} index={index} />)}</Flex>
        <ArrowLayer container={sceneRef} arrows={scene.arrows} version={`${step}`} />
      </Box>
      {(scene.counter || scene.badge) && <Flex gap="3" align="center" wrap="wrap">
        {scene.counter && <Box px="3" py="2" rounded="md" bg="brand.subtle"><Text fontSize="sm" color="app.muted">{scene.counter.label}</Text>
          <Text fontSize="2xl" fontWeight="bold" lineHeight="1.1" css={{ fontVariantNumeric: "tabular-nums" }}>{String(scene.counter.value)}</Text></Box>}
        {scene.badge && <Badge colorPalette={BADGE[scene.badge.kind].palette} variant="subtle" rounded="full" px="3" py="1" fontSize="sm">
          <Text as="span" fontWeight="bold">{BADGE[scene.badge.kind].label} :</Text>&nbsp;{scene.badge.text}</Badge>}
      </Flex>}
      <Controls playing={playing} onPlay={play} onPrevious={previous} onNext={next} onRestart={restart} step={step} total={data.steps.length} label={data.title} />
      <Button alignSelf="start" size="sm" variant="ghost" colorPalette="brand" aria-expanded={describe} onClick={() => setDescribe(!describe)}>
        {describe ? "Masquer la description textuelle" : "Description textuelle de toutes les étapes"}</Button>
      {describe && <Stack as="ol" gap="2" pl="5" m="0" fontSize="sm">{data.steps.map((item, index) => <li key={index}>
        <Text fontWeight="semibold">{item.caption}</Text>
        {item.scene.tables.map((table, position) => <Text key={position}>{describeTable(table)}</Text>)}
        {item.scene.arrows.length > 0 && <Text>Flèches : {item.scene.arrows.map((arrow) => `ligne ${arrow.source[1] + 1} de « ${item.scene.tables[arrow.source[0]].title || `table ${arrow.source[0] + 1}`} » vers ligne ${arrow.target[1] + 1} de « ${item.scene.tables[arrow.target[0]].title || `table ${arrow.target[0] + 1}`} »${arrow.label ? ` (${arrow.label})` : ""}`).join(" ; ")}.</Text>}
        {item.scene.counter && <Text>{item.scene.counter.label} : {String(item.scene.counter.value)}.</Text>}
        {item.scene.badge && <Text>{BADGE[item.scene.badge.kind].label} : {item.scene.badge.text}.</Text>}
      </li>)}</Stack>}
    </Stack>
  </Box>
}

type FlatNode = { id: string; label: string; level: number; parent: string | null; children: string[] }

function flattenTree(root: MindNode): Map<string, FlatNode> {
  const map = new Map<string, FlatNode>()
  const visit = (node: MindNode, id: string, level: number, parent: string | null) => {
    map.set(id, { id, label: node.label, level, parent, children: node.children.map((_, index) => `${id}.${index}`) })
    node.children.forEach((child, index) => visit(child, `${id}.${index}`, level + 1, id))
  }
  visit(root, "0", 1, null)
  return map
}

/** Mind map as an accessible tree (arrow keys, Enter to fold), progressive appearance, list alternative. */
export function MindMap({ data }: { data: MindmapDisplay }) {
  const nodes = flattenTree(data.root)
  const [open, setOpen] = useState<Set<string>>(() => new Set(["0"]))
  const [active, setActive] = useState("0")
  const [asList, setAsList] = useState(false)
  const refs = useRef<Record<string, HTMLDivElement | null>>({})
  const visible: string[] = []
  const walk = (id: string) => { visible.push(id); if (open.has(id)) nodes.get(id)!.children.forEach(walk) }
  walk("0")
  const toggle = (id: string) => setOpen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const focus = (id: string) => { setActive(id); window.requestAnimationFrame(() => refs.current[id]?.focus()) }
  function onKey(event: KeyboardEvent<HTMLDivElement>, id: string) {
    const node = nodes.get(id)!
    const index = visible.indexOf(id)
    const keys: Record<string, () => void> = {
      ArrowDown: () => index < visible.length - 1 && focus(visible[index + 1]),
      ArrowUp: () => index > 0 && focus(visible[index - 1]),
      ArrowRight: () => node.children.length && (open.has(id) ? focus(node.children[0]) : toggle(id)),
      ArrowLeft: () => (open.has(id) && node.children.length ? toggle(id) : node.parent && focus(node.parent)),
      Home: () => focus(visible[0]),
      End: () => focus(visible[visible.length - 1]),
      Enter: () => node.children.length && toggle(id),
      " ": () => node.children.length && toggle(id),
    }
    if (keys[event.key]) { event.preventDefault(); keys[event.key]() }
  }
  const expandAll = () => setOpen(new Set([...nodes.values()].filter((node) => node.children.length).map((node) => node.id)))
  const renderNode = (id: string, order: number): React.ReactNode => {
    const node = nodes.get(id)!
    const expanded = open.has(id)
    return <Box as="li" key={id} role="none" listStyleType="none" css={{ animation: `fade-in 300ms ease-out ${Math.min(order, 12) * 60}ms both` }}>
      <Flex ref={(element: HTMLDivElement | null) => { refs.current[id] = element }} role="treeitem" aria-level={node.level}
        aria-expanded={node.children.length ? expanded : undefined} aria-selected={active === id} tabIndex={active === id ? 0 : -1}
        onKeyDown={(event) => onKey(event, id)} onClick={() => { setActive(id); if (node.children.length) toggle(id) }} onFocus={() => setActive(id)}
        gap="2" align="center" px="3" py="1.5" my="1" rounded="full" cursor={node.children.length ? "pointer" : "default"} display="inline-flex"
        bg={node.level === 1 ? "brand.solid" : node.level === 2 ? "brand.subtle" : "app.surface"} color={node.level === 1 ? "brand.contrast" : "app.ink"}
        borderWidth="1px" borderColor={node.level === 1 ? "brand.solid" : "app.border"} fontWeight={node.level <= 2 ? "semibold" : "normal"}>
        {node.children.length > 0 && <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 150ms" }}>
          <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="3" /></svg>}
        {node.label}
        {node.children.length > 0 && !expanded && <Text as="span" fontSize="xs" color={node.level === 1 ? "brand.contrast" : "app.muted"}>({node.children.length})</Text>}
      </Flex>
      {expanded && node.children.length > 0 && <Box as="ul" role="group" m="0" pl={{ base: "5", md: "8" }} borderLeftWidth="2px" borderColor="app.border" ml="4">
        {node.children.map((child, position) => renderNode(child, order + position + 1))}</Box>}
    </Box>
  }
  const listView = (node: MindNode): React.ReactNode => <li key={node.label}>{node.label}{node.children.length > 0 && <ul>{node.children.map(listView)}</ul>}</li>
  return <Box as="figure" m="0" p="4" borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface">
    <Stack gap="3">
      <Text as="figcaption" fontWeight="semibold" id="mindmap-title">{data.title}</Text>
      {asList ? <Box as="ul" pl="5" m="0" css={{ "& ul": { paddingLeft: "1.25rem" } }}>{listView(data.root)}</Box>
        : <Box as="ul" role="tree" aria-labelledby="mindmap-title" m="0" p="0">{renderNode("0", 0)}</Box>}
      {!asList && <Text fontSize="xs" color="app.muted">Flèches du clavier pour naviguer, Entrée pour déplier ou replier une branche.</Text>}
      <Flex gap="2" wrap="wrap">
        {!asList && <Button size="sm" variant="outline" onClick={expandAll}>Tout déplier</Button>}
        <Button size="sm" variant="ghost" colorPalette="brand" aria-expanded={asList} onClick={() => setAsList(!asList)}>{asList ? "Afficher la carte" : "Afficher en liste"}</Button>
      </Flex>
    </Stack>
  </Box>
}

/** Pipeline: a token goes from step to step; rejecting steps lower the accepted count. */
export function FlowDiagram({ data }: { data: FlowDisplay }) {
  const total = data.steps.length + 1  // last position = arrived at the destination
  const { step, playing, play, next, restart } = useStepper(total, 1400)
  const passed = data.steps.slice(0, Math.min(step, data.steps.length))
  const rejected = passed.reduce((sum, item) => sum + item.rejects, 0)
  const position = Math.min(step, data.steps.length - 1)
  const format = (value: number) => value.toLocaleString("fr-FR")
  const done = step >= data.steps.length
  return <Box as="figure" m="0" p="4" borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface">
    <Stack gap="4">
      <Text as="figcaption" fontWeight="semibold">{data.title}</Text>
      <Box position="relative" pt="5">
        <Box position="absolute" top="0" h="4" w="4" rounded="full" bg="saffron.solid" boxShadow="0 0 0 4px var(--chakra-colors-saffron-subtle)"
          aria-hidden="true" transition="left 600ms ease-in-out" style={{ left: `calc(${((position + 0.5) / data.steps.length) * 100}% - 8px)` }} />
        <Flex as="ol" gap="0" m="0" p="0" listStyleType="none" aria-label="Étapes du pipeline" direction={{ base: "column", md: "row" }}>
          {data.steps.map((item, index) => <Flex as="li" key={item.id} flex="1" align="stretch" direction={{ base: "column", md: "row" }} minW="0">
            <Stack gap="1" flex="1" p="2.5" rounded="lg" borderWidth="2px" textAlign="center" minW="0"
              borderColor={index === position && !done ? "saffron.solid" : index < step ? "brand.solid" : "app.border"}
              bg={index < step ? "brand.subtle" : "app.surface"} aria-current={index === position && !done ? "step" : undefined}>
              <Text fontWeight="semibold" fontSize="sm">{item.label}</Text>
              {item.rejects > 0 && <Text fontSize="xs" color={index < step ? "red.700" : "app.muted"} fontWeight={index < step ? "bold" : undefined}>− {format(item.rejects)} rejetée{item.rejects > 1 ? "s" : ""}</Text>}
              {item.note && <Text fontSize="xs" color="app.muted">{item.note}</Text>}
            </Stack>
            {index < data.steps.length - 1 && <Flex align="center" justify="center" px="1" py={{ base: "1", md: "0" }} color="app.muted" aria-hidden="true">
              <Box as="span" display={{ base: "none", md: "inline" }}>→</Box><Box as="span" display={{ base: "inline", md: "none" }}>↓</Box></Flex>}
          </Flex>)}
        </Flex>
      </Box>
      <Flex gap="3" wrap="wrap" aria-live="polite">
        <Box px="3" py="2" rounded="md" bg="brand.subtle"><Text fontSize="sm" color="app.muted">Acceptées</Text>
          <Text fontSize="xl" fontWeight="bold" css={{ fontVariantNumeric: "tabular-nums" }}>{format(data.input - rejected)} {data.unit}</Text></Box>
        <Box px="3" py="2" rounded="md" bg="app.sunken"><Text fontSize="sm" color="app.muted">Rejetées</Text>
          <Text fontSize="xl" fontWeight="bold" css={{ fontVariantNumeric: "tabular-nums" }}>{format(rejected)} {data.unit}</Text></Box>
        <Text alignSelf="center" fontSize="sm">{done ? "Arrivé à destination." : step === 0 ? `${format(data.input)} ${data.unit} en entrée.` : `Étape en cours : ${data.steps[position].label}.`}</Text>
      </Flex>
      <Controls playing={playing} onPlay={play} onNext={next} onRestart={restart} step={step} total={total} label={data.title} />
      <VisuallyHidden>{`${format(data.input)} ${data.unit} en entrée. ${data.steps.map((item) => `${item.label}${item.rejects ? ` : ${format(item.rejects)} rejetées` : ""}${item.note ? ` (${item.note})` : ""}`).join(", puis ")}. À la fin : ${format(data.input - data.steps.reduce((sum, item) => sum + item.rejects, 0))} ${data.unit} acceptées.`}</VisuallyHidden>
    </Stack>
  </Box>
}

/** Optional video: an embed limited by the CSP to youtube-nocookie.com and player.vimeo.com, or a course file with captions. */
export function VideoView({ data }: { data: VideoDisplay }) {
  return <Box as="figure" m="0" p="4" borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface">
    <Stack gap="2">
      <Flex gap="2" align="center" wrap="wrap"><Text as="figcaption" fontWeight="semibold">{data.title}</Text>
        <Badge variant="outline" rounded="full">Facultatif</Badge></Flex>
      <Box position="relative" w="full" css={{ aspectRatio: "16 / 9" }} bg="app.sunken" rounded="md" overflow="hidden">
        {data.url
          ? <iframe src={data.url} title={data.title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; picture-in-picture; encrypted-media"
            style={{ border: 0, width: "100%", height: "100%" }} />
          : <video controls preload="metadata" src={data.src ?? undefined} style={{ width: "100%", height: "100%" }} aria-label={data.title}>
            {data.captions_src && <track kind="captions" srcLang="fr" label="Français" src={data.captions_src} default />}
          </video>}
      </Box>
      <Text fontSize="sm" color="app.muted">Vidéo facultative : elle ne compte pas dans la note.</Text>
    </Stack>
  </Box>
}
