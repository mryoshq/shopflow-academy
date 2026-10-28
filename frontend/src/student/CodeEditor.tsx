import { useRef, type KeyboardEvent } from "react"
import { Box, chakra } from "@chakra-ui/react"
import type { CodeDisplay } from "../studioTypes"
import { Highlighted, MONO } from "./displays"

/**
 * Text area with live Catppuccin colours (ADR-0029): the coloured copy sits under a textarea whose text is
 * transparent, so typing, selection, undo and screen readers stay those of a native textarea.
 */
export function CodeEditor({ id, value, onChange, language, rows, disabled, maxLength, onKeyDown }: {
  id: string; value: string; onChange: (value: string) => void; language: CodeDisplay["language"]; rows: number
  disabled?: boolean; maxLength?: number; onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const under = useRef<HTMLPreElement>(null)
  const shared = { m: "0", p: "3", fontSize: "14px", lineHeight: "1.55", whiteSpace: "pre-wrap", overflowWrap: "anywhere", tabSize: 4 } as const
  return <Box position="relative" bg="code.bg" borderWidth="1px" borderColor="code.border" rounded="lg" opacity={disabled ? 0.6 : 1}
    _focusWithin={{ outline: "2px solid", outlineColor: "brand.solid", outlineOffset: "2px" }}>
    <chakra.pre ref={under} aria-hidden="true" {...shared} color="code.fg" position="absolute" inset="0" overflow="hidden" pointerEvents="none"
      css={{ fontFamily: MONO }}><Highlighted code={value + "\n"} language={language} /></chakra.pre>
    <chakra.textarea id={id} value={value} rows={rows} disabled={disabled} maxLength={maxLength} spellCheck={false} autoCapitalize="off" autoCorrect="off"
      onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown}
      onScroll={(event) => { if (under.current) under.current.scrollTop = event.currentTarget.scrollTop }}
      {...shared} display="block" position="relative" w="full" bg="transparent" color="transparent" border="0" outline="none" resize="vertical"
      css={{ fontFamily: MONO, caretColor: "var(--chakra-colors-code-fg)", "&::selection": { color: "transparent", background: "rgba(136, 57, 239, 0.25)" } }} />
  </Box>
}
