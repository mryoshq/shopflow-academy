import { locale, t } from "../i18n"
import { Box, Stack, Table } from "@chakra-ui/react"
import { RichText } from "../student/RichText"

/** Blocks of a submitted text: paragraphs (light formatting) and Markdown tables « | a | b | ». */
export function splitBlocks(text: string): { kind: "table" | "text"; lines: string[] }[] {
  const blocks: { kind: "table" | "text"; lines: string[] }[] = []
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const kind = line.trim().startsWith("|") ? "table" : "text"
    const last = blocks[blocks.length - 1]
    if (line.trim() === "" && kind === "text") { blocks.push({ kind: "text", lines: [] }); continue }
    if (last && last.kind === kind) last.lines.push(line)
    else blocks.push({ kind, lines: [line] })
  }
  return blocks.filter((block) => block.lines.some((line) => line.trim()))
}

export function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())
}

export const TABLE_TEMPLATE = "\n| Colonne 1 | Colonne 2 | Colonne 3 |\n|---|---|---|\n|  |  |  |\n|  |  |  |\n"

/** ADR-0034: a team's text with its tables, rendered safely (no HTML). */
export function ProjectText({ text }: { text: string }) {
  if (!text.trim()) return null
  return <Stack gap="3">{splitBlocks(text).map((block, index) => {
    if (block.kind === "text") return <RichText key={index} text={block.lines.join("\n")} />
    const rows = block.lines.filter((line) => !/^\s*\|?\s*:?-{2,}/.test(line)).map(tableCells)
    const [head, ...body] = rows
    return <Box key={index} overflowX="auto" tabIndex={0} role="region" aria-label={t("Tableau {{p0}}", { p0: index + 1 })} borderWidth="1px" borderColor="app.border" rounded="lg">
      <Table.Root size="sm"><Table.Header><Table.Row bg="app.sunken">{head.map((cell, i) => <Table.ColumnHeader key={i}>{cell}</Table.ColumnHeader>)}</Table.Row></Table.Header>
        <Table.Body>{body.map((row, r) => <Table.Row key={r}>{row.map((cell, c) => <Table.Cell key={c}>{cell}</Table.Cell>)}</Table.Row>)}</Table.Body></Table.Root>
    </Box>
  })}</Stack>
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  const [value, unit] = bytes < 1024 * 1024 ? [bytes / 1024, "Ko"] : [bytes / (1024 * 1024), "Mo"]
  return `${value.toLocaleString(locale(), { maximumFractionDigits: value < 10 ? 1 : 0 })} ${unit}`
}

export function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" }) : "—"
}
