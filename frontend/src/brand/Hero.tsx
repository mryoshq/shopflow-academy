import { useEffect, useState, type ReactNode } from "react"
import { Box, Flex, Text } from "@chakra-ui/react"
import { locale, t } from "../i18n"
import { useReducedMotion } from "../preferences/display"

/** ADR-0048: overline in capitals, in the accent (« brand.fg », or « hero.accent » on the dark panel). */
export function Overline({ children, color = "brand.fg", ...rest }: { children: ReactNode; color?: string } & Record<string, unknown>) {
  return <Text textStyle="overline" color={color} {...rest}>{children}</Text>
}

/** ADR-0048: the dark header panel with its dot grid (same in both themes, a step darker in dark mode). */
export function HeroPanel({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) {
  return <Box bgColor="hero.bg" color="hero.ink" rounded="card" borderWidth="1px" borderColor="hero.border" position="relative" overflow="hidden"
    px={{ base: "6", md: "10" }} py={{ base: "7", md: "10" }} data-theme-panel="hero"
    css={{ backgroundImage: "radial-gradient(circle, var(--chakra-colors-hero-dot) 1.1px, transparent 1.6px)", backgroundSize: "18px 18px", backgroundPosition: "9px 9px" }}
    {...rest}>{children}</Box>
}

function systemReduced(): boolean {
  try { return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false } catch { return false }
}

export function useMotionReduced(): boolean {
  const { reduce } = useReducedMotion()
  return reduce || systemReduced()
}

/** ADR-0048: green dot « mis à jour à 10:42 » (it pulses twice after each refresh, never with « Réduire les animations »). */
export function UpdatedAt({ at, color = "hero.muted" }: { at: Date; color?: string }) {
  const reduced = useMotionReduced()
  return <Flex align="center" gap="2" fontSize="sm" color={color} data-testid="updated-at">
    <Box w="2" h="2" rounded="full" bg="#22C55E" flexShrink={0} aria-hidden="true"
      key={at.getTime()} css={reduced ? undefined : { animation: "livePulse 1.6s ease-out 2" }} />
    <Text as="span">{t("Mis à jour à {{time}}", { time: at.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) })}</Text>
  </Flex>
}

/**
 * ADR-0048: one accent word typed then erased, then the next. Screen readers get the first word only (the changing word
 * is hidden from them); with « Réduire les animations » the first word stays, still.
 */
export function Typewriter({ words, color = "brand.fg" }: { words: string[]; color?: string }) {
  const reduced = useMotionReduced()
  const [index, setIndex] = useState(0)
  const [length, setLength] = useState(words[0]?.length ?? 0)
  const [erasing, setErasing] = useState(false)
  useEffect(() => {
    if (reduced || words.length < 2) return
    const word = words[index]
    const delay = erasing ? 45 : length === word.length ? 2200 : 85
    const timer = window.setTimeout(() => {
      if (!erasing && length === word.length) setErasing(true)
      else if (erasing && length === 0) { setErasing(false); setIndex((index + 1) % words.length) }
      else setLength(length + (erasing ? -1 : 1))
    }, delay)
    return () => window.clearTimeout(timer)
  }, [reduced, words, index, length, erasing])
  const shown = reduced ? words[0] : words[index].slice(0, length)
  return <Box as="span" color={color} whiteSpace="nowrap">
    <Box as="span" srOnly>{words[0]}</Box>
    <Box as="span" aria-hidden="true" data-testid="typewriter">{shown}<Box as="span" display={reduced ? "none" : "inline-block"} w="0.08em" h="0.9em" ml="0.04em"
      bg="currentColor" verticalAlign="-0.08em" opacity={0.7} /></Box>
  </Box>
}
