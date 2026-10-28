import { Fragment, type ReactNode } from "react"
import { Box, Heading, Stack, Text } from "@chakra-ui/react"

/**
 * Light formatting for course texts (ADR-0022): **bold**, `inline code`, "- " lists,
 * "1. " numbered lists and, when allowed, "### " subtitles. Everything is rendered as
 * React text nodes: no HTML is ever interpreted (no dangerouslySetInnerHTML).
 */
export type RichBlock =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; text: string }
  | { type: "list"; ordered: boolean; start: number; items: string[] }

const BULLET = /^\s*[-*]\s+(.*)$/
const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.*)$/
const HEADING = /^\s*###\s+(.+?)\s*#*\s*$/

export function parseRich(text: string, headings = false): RichBlock[] {
  const blocks: RichBlock[] = []
  let paragraph: string[] = []
  let list: Extract<RichBlock, { type: "list" }> | null = null
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", lines: paragraph })
    if (list) blocks.push(list)
    paragraph = []
    list = null
  }
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd()
    if (!line.trim()) { flush(); continue }
    const heading = headings ? HEADING.exec(line) : null
    if (heading) { flush(); blocks.push({ type: "heading", text: heading[1] }); continue }
    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    if (bullet || numbered) {
      const ordered = Boolean(numbered)
      if (paragraph.length) { blocks.push({ type: "paragraph", lines: paragraph }); paragraph = [] }
      if (!list || list.ordered !== ordered) {
        if (list) blocks.push(list)
        list = { type: "list", ordered, start: numbered ? Number(numbered[1]) : 1, items: [] }
      }
      list.items.push(bullet ? bullet[1] : numbered![2])
      continue
    }
    if (list) {
      // An indented line continues the previous list item; otherwise a new paragraph starts.
      if (/^\s{2,}/.test(raw)) { list.items[list.items.length - 1] += ` ${line.trim()}`; continue }
      blocks.push(list)
      list = null
    }
    paragraph.push(line.trim())
  }
  flush()
  return blocks
}

/** `code` first (its content stays literal), then **bold** in the remaining text. */
export function Inline({ text }: { text: string }) {
  const parts: ReactNode[] = []
  const code = /`([^`\n]+)`/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = code.exec(text))) {
    if (match.index > last) parts.push(<Bold key={key++} text={text.slice(last, match.index)} />)
    parts.push(<Box as="code" key={key++} px="1" py="0.5" rounded="sm" bg="code.bg" color="code.fg" fontSize="0.9em"
      borderWidth="1px" borderColor="code.border" css={{ fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, 'SF Mono', Menlo, monospace", overflowWrap: "anywhere" }}>{match[1]}</Box>)
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(<Bold key={key++} text={text.slice(last)} />)
  return <>{parts}</>
}

function Bold({ text }: { text: string }) {
  const pieces = text.split(/\*\*(.+?)\*\*/g)
  return <>{pieces.map((piece, index) => index % 2 ? <Text as="strong" key={index} fontWeight="semibold">{piece}</Text> : <Fragment key={index}>{piece}</Fragment>)}</>
}

type Props = {
  text: string
  /** "### " lines become subtitles (lesson body only). */
  headings?: boolean
  headingAs?: "h2" | "h3" | "h4" | "h5"
  fontSize?: string | Record<string, string>
  fontWeight?: string
  gap?: string
}

export function RichText({ text, headings = false, headingAs = "h2", fontSize, fontWeight, gap = "3" }: Props) {
  const blocks = parseRich(text, headings)
  if (!blocks.length) return null
  return <Stack gap={gap} fontSize={fontSize} fontWeight={fontWeight} maxW="72ch">
    {blocks.map((block, index) => {
      if (block.type === "heading") return <Heading key={index} as={headingAs} size="md" mt={index ? "2" : "0"}>{block.text}</Heading>
      if (block.type === "list") {
        return <Box as={block.ordered ? "ol" : "ul"} key={index} m="0" pl="6" {...(block.ordered && block.start !== 1 ? { start: block.start } : {})}
          css={{ listStyleType: block.ordered ? "decimal" : "disc", "& > li + li": { marginTop: "0.35rem" } }}>
          {block.items.map((item, position) => <li key={position}><Inline text={item} /></li>)}
        </Box>
      }
      return <Text key={index}>{block.lines.map((line, position) => <Fragment key={position}>{position > 0 && <br />}<Inline text={line} /></Fragment>)}</Text>
    })}
  </Stack>
}
