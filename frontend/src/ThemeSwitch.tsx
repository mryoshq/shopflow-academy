import { useRef, type KeyboardEvent, type ReactNode } from "react"
import { Box, Flex } from "@chakra-ui/react"
import { useColorMode, type ThemeChoice } from "./useColorMode"

const OPTIONS: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  { value: "system", label: "Système", icon: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></> },
  { value: "light", label: "Clair", icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> },
  { value: "dark", label: "Sombre", icon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /> },
]

/** Système / Clair / Sombre: a radio group (arrow keys), remembered in this browser; icons only on phones (ADR-0029). */
export function ThemeSwitch() {
  const { choice, choose } = useColorMode()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  function onKey(event: KeyboardEvent<HTMLElement>, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (index + step + OPTIONS.length) % OPTIONS.length
    choose(OPTIONS[next].value)
    refs.current[next]?.focus()
  }
  return <Flex role="radiogroup" aria-label="Thème" p="0.5" gap="0.5" rounded="full" bg="app.sunken" borderWidth="1px" borderColor="app.border">
    {OPTIONS.map((option, index) => {
      const active = choice === option.value
      return <Box as="button" key={option.value} ref={(node: HTMLElement | null) => { refs.current[index] = node as HTMLButtonElement | null }} role="radio" aria-checked={active} aria-label={option.label}
        tabIndex={active ? 0 : -1} onClick={() => choose(option.value)} onKeyDown={(event: KeyboardEvent<HTMLElement>) => onKey(event, index)}
        px="2.5" py="1" rounded="full" fontSize="xs" fontWeight={active ? "semibold" : "normal"} cursor="pointer"
        bg={active ? "app.surface" : "transparent"} color={active ? "app.ink" : "app.muted"} boxShadow={active ? "card" : undefined}>
        <Box as="span" display={{ base: "inline-flex", sm: "none" }} justifyContent="center" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">{option.icon}</svg>
        </Box>
        <Box as="span" display={{ base: "none", sm: "inline" }}>{option.label}</Box>
      </Box>
    })}
  </Flex>
}
