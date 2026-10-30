import { Fragment, type ReactNode } from "react"
import { Box, Heading, Stack, Table, Text } from "@chakra-ui/react"

/**
 * Light formatting for course texts (ADR-0022): **bold**, `inline code`, "- " lists,
 * "1. " numbered lists, simple Markdown tables and, when allowed, "### " subtitles. Everything
 * is rendered as React text nodes: no HTML is ever interpreted (no dangerouslySetInnerHTML).
 */
export type Align = "left" | "center" | "right" | null
export type RichBlock =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; text: string }
  | { type: "list"; ordered: boolean; start: number; items: string[] }
  | { type: "table"; head: string[]; align: Align[]; rows: string[][] }

/** Same limits as a `data.kind: table` media. */
export const TABLE_MAX_COLUMNS = 12
export const TABLE_MAX_ROWS = 100
const SEPARATOR_CELL = /^:?-+:?$/

/** Cells of a « | a | b | » line; « \| » is a literal pipe inside a cell. */
export function tableCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "")
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"))
}

/**
 * A run of lines starting with « | » is a table when: header, separator « | --- | » with as many
 * cells, then rows with as many cells, within the limits. Otherwise null: the lines stay text.
 */
export function parseTable(lines: string[]): Extract<RichBlock, { type: "table" }> | null {
  if (lines.length < 2) return null
  const head = tableCells(lines[0])
  const separator = tableCells(lines[1])
  if (separator.length !== head.length || !separator.every((cell) => SEPARATOR_CELL.test(cell))) return null
  const rows = lines.slice(2).map(tableCells)
  if (head.length > TABLE_MAX_COLUMNS || rows.length > TABLE_MAX_ROWS || rows.some((row) => row.length !== head.length)) return null
  const align = separator.map((cell): Align => cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : cell.startsWith(":") ? "left" : null)
  return { type: "table", head, align, rows }
}

const PIPE_LINE = /^\s*\|/
const SHORT_CELL = 32

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
  const all = text.replace(/\r\n/g, "\n").split("\n")
  for (let index = 0; index < all.length; index++) {
    const raw = all[index]
    const line = raw.trimEnd()
    if (!line.trim()) { flush(); continue }
    if (PIPE_LINE.test(line) && !(list && /^\s{2,}/.test(raw))) {
      let end = index
      while (end + 1 < all.length && PIPE_LINE.test(all[end + 1])) end++
      const table = parseTable(all.slice(index, end + 1))
      if (table) { flush(); blocks.push(table); index = end; continue }
    }
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
      if (block.type === "table") return <RichTable key={index} table={block} />
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

/** A lesson table: distinct header, discreet alternate rows, theme borders, scrolls on its own on a phone. */
function RichTable({ table }: { table: Extract<RichBlock, { type: "table" }> }) {
  const align = (column: number) => table.align[column] ?? undefined
  // Short cells (ids, dates, amounts) stay on one line, so the frame scrolls instead of squeezing them;
  // a long sentence may still wrap, within a readable width.
  const wrap = (cell: string) => cell.length > SHORT_CELL ? { whiteSpace: "normal", minW: "16ch" } : { whiteSpace: "nowrap" }
  return <Box className="rich-table" style={{ overflowX: "auto", maxWidth: "100%" }} borderWidth="1px" borderColor="app.border" rounded="lg" tabIndex={0}
    role="region" aria-label={`Tableau : ${table.head.filter(Boolean).slice(0, 3).join(", ")}`}>
    <Table.Root size="sm" variant="line" css={{
      // Alternate rows at half the header tint: visible, never louder than the header.
      "& tbody tr:nth-of-type(even)": { background: "color-mix(in srgb, var(--chakra-colors-app-sunken) 50%, transparent)" },
      "& td, & th": { borderColor: "var(--chakra-colors-app-border)" },
      "& thead th": { borderBottomWidth: "2px" },
      "& tbody tr:last-of-type td": { borderBottomWidth: "0" },
    }}>
      <Table.Header><Table.Row bg="app.sunken">{table.head.map((cell, column) =>
        <Table.ColumnHeader key={column} scope="col" textAlign={align(column)} fontWeight="semibold" color="app.ink" {...wrap(cell)}><Inline text={cell} /></Table.ColumnHeader>)}
      </Table.Row></Table.Header>
      <Table.Body>{table.rows.map((row, position) => <Table.Row key={position} bg="transparent">{row.map((cell, column) =>
        <Table.Cell key={column} textAlign={align(column)} {...wrap(cell)}><Inline text={cell} /></Table.Cell>)}</Table.Row>)}
      </Table.Body>
    </Table.Root>
  </Box>
}
