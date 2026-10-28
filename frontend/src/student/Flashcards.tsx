import { useMemo, useState, type KeyboardEvent } from "react"
import { Box, Button, Flex, Stack, Text, VisuallyHidden, chakra } from "@chakra-ui/react"
import type { FlashcardsDisplay } from "../studioTypes"
import { RichText } from "./RichText"

/**
 * Cards to flip, one at a time (ADR-0028). Click, Space or Enter flips (3D turn, instant with reduced
 * motion); arrows go to the previous or next card. « Je savais / À revoir » is optional, kept in this
 * browser only, with no effect on the grade. The back is announced to screen readers after a flip.
 */

/** Small stable key of a deck, to remember the cards to review in this browser. */
export function deckKey(cards: { front: string; back: string }[]): string {
  let hash = 0
  for (const char of JSON.stringify(cards)) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return `shopflow:cards:${(hash >>> 0).toString(36)}`
}

/** What a screen reader says: the text without the light formatting marks. */
export function spoken(text: string): string {
  return text.replace(/[*`]/g, "").replace(/^#+\s*/gm, "").replace(/\s+/g, " ").trim()
}

export function shuffled(length: number, random: () => number = Math.random): number[] {
  const order = Array.from({ length }, (_, index) => index)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

function loadReview(key: string): number[] {
  try { return JSON.parse(window.localStorage.getItem(key) ?? "[]") as number[] } catch { return [] }
}

export function Flashcards({ data }: { data: FlashcardsDisplay }) {
  const key = useMemo(() => deckKey(data.cards), [data.cards])
  const [order, setOrder] = useState<number[]>(() => data.cards.map((_, index) => index))
  const [position, setPosition] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [toReview, setToReview] = useState<number[]>(() => loadReview(key).filter((index) => index < data.cards.length))
  const [finished, setFinished] = useState(false)
  const card = data.cards[order[position]]

  function save(next: number[]) {
    setToReview(next)
    try { window.localStorage.setItem(key, JSON.stringify(next)) } catch { /* not remembered */ }
  }
  function go(step: number) {
    setFlipped(false)
    setFinished(false)
    setPosition((current) => (current + step + order.length) % order.length)
  }
  function judge(known: boolean) {
    const index = order[position]
    save(known ? toReview.filter((item) => item !== index) : Array.from(new Set([...toReview, index])))
    if (position === order.length - 1) { setFinished(true); setFlipped(false) } else go(1)
  }
  function start(next: number[]) {
    setOrder(next)
    setPosition(0)
    setFlipped(false)
    setFinished(false)
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === "ArrowRight") { event.preventDefault(); go(1) }
    if (event.key === "ArrowLeft") { event.preventDefault(); go(-1) }
  }

  return <Stack as="section" gap="3" aria-label={data.title ? `Cartes : ${data.title}` : "Cartes à retourner"} onKeyDown={onKey} maxW="36rem" w="full">
    <Flex justify="space-between" align="center" gap="2" wrap="wrap">
      <Text fontWeight="semibold">{data.title || "Cartes à retourner"}</Text>
      <Text fontSize="sm" color="app.muted" css={{ fontVariantNumeric: "tabular-nums" }} aria-live="polite">{position + 1} / {order.length}</Text>
    </Flex>
    {/* The card: a button, so Space and Enter flip it like a click. */}
    <Box css={{ perspective: "1200px" }}>
      <chakra.button type="button" onClick={() => setFlipped((value) => !value)} aria-pressed={flipped}
        aria-label={flipped ? `Verso de la carte ${position + 1}. Retourner la carte` : `Carte ${position + 1} : ${spoken(card.front)}. Retourner pour voir le verso`}
        position="relative" display="block" w="full" minH={{ base: "12rem", md: "14rem" }} textAlign="center" cursor="pointer" rounded="card"
        css={{ transformStyle: "preserve-3d", transition: "transform 0.5s ease", transform: flipped ? "rotateY(180deg)" : "none" }}>
        <Face side="front" hidden={flipped}><RichText text={card.front} fontSize={{ base: "lg", md: "xl" }} fontWeight="semibold" /></Face>
        <Face side="back" hidden={!flipped}><RichText text={card.back} fontSize={{ base: "md", md: "lg" }} /></Face>
      </chakra.button>
    </Box>
    <VisuallyHidden aria-live="polite">{flipped ? `Verso : ${spoken(card.back)}` : ""}</VisuallyHidden>
    <Flex gap="2" wrap="wrap" justify="space-between">
      <Flex gap="2">
        <Button size="sm" variant="outline" onClick={() => go(-1)} aria-label="Carte précédente">← Précédente</Button>
        <Button size="sm" variant="outline" onClick={() => go(1)} aria-label="Carte suivante">Suivante →</Button>
      </Flex>
      <Button size="sm" variant="ghost" colorPalette="brand" onClick={() => start(shuffled(order.length).map((index) => order[index]))}>Mélanger</Button>
    </Flex>
    {flipped && <Flex gap="2" wrap="wrap" aria-label="Votre auto-évaluation (facultative, sans effet sur la note)" role="group">
      <Button size="sm" colorPalette="green" variant="subtle" onClick={() => judge(true)}>Je savais</Button>
      <Button size="sm" colorPalette="saffron" variant="subtle" onClick={() => judge(false)}>À revoir</Button>
    </Flex>}
    {(finished || toReview.length > 0) && <Flex gap="2" align="center" wrap="wrap" p="3" rounded="lg" bg="app.sunken" fontSize="sm" role="status">
      <Text flex="1" minW="40">{toReview.length
        ? `${toReview.length} carte${toReview.length > 1 ? "s" : ""} à revoir (notée${toReview.length > 1 ? "s" : ""} dans ce navigateur, sans effet sur la note).`
        : "Toutes les cartes sont sues. Bravo !"}</Text>
      {toReview.length > 0 && <Button size="xs" colorPalette="saffron" onClick={() => start([...toReview])}>Reprendre les cartes à revoir</Button>}
      {order.length !== data.cards.length && <Button size="xs" variant="ghost" onClick={() => start(data.cards.map((_, index) => index))}>Toutes les cartes</Button>}
    </Flex>}
    <Text fontSize="xs" color="app.muted">Cliquez sur la carte, ou appuyez sur Espace ou Entrée, pour la retourner ; flèches gauche et droite pour changer de carte.</Text>
  </Stack>
}

function Face({ side, hidden, children }: { side: "front" | "back"; hidden: boolean; children: React.ReactNode }) {
  return <Flex aria-hidden={hidden} position="absolute" inset="0" align="center" justify="center" p={{ base: "4", md: "6" }} rounded="card" borderWidth="1px"
    borderColor={side === "front" ? "app.border" : "brand.solid"} bg={side === "front" ? "app.surface" : "brand.subtle"} boxShadow="card"
    css={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: side === "back" ? "rotateY(180deg)" : "none" }}>
    <Stack gap="1" align="center">
      <Text fontSize="xs" fontWeight="bold" color={side === "front" ? "app.muted" : "brand.fg"} textTransform="uppercase" letterSpacing="0.08em">{side === "front" ? "Recto" : "Verso"}</Text>
      {children}
    </Stack>
  </Flex>
}
