import { useRef, type KeyboardEvent } from "react"
import { Box, Flex } from "@chakra-ui/react"
import { useColorMode, type ThemeChoice } from "./useColorMode"

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "Système" }, { value: "light", label: "Clair" }, { value: "dark", label: "Sombre" },
]

/** Système / Clair / Sombre: a radio group (arrow keys), remembered in this browser. */
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
      return <Box as="button" key={option.value} ref={(node: HTMLElement | null) => { refs.current[index] = node as HTMLButtonElement | null }} role="radio" aria-checked={active}
        tabIndex={active ? 0 : -1} onClick={() => choose(option.value)} onKeyDown={(event: KeyboardEvent<HTMLElement>) => onKey(event, index)}
        px="2.5" py="1" rounded="full" fontSize="xs" fontWeight={active ? "semibold" : "normal"} cursor="pointer"
        bg={active ? "app.surface" : "transparent"} color={active ? "app.ink" : "app.muted"} boxShadow={active ? "card" : undefined}>
        {option.label}
      </Box>
    })}
  </Flex>
}
