import { Fragment, useState, type ReactNode } from "react"
import { Box, Button, Flex, Grid, Stack, Table, Text, VisuallyHidden } from "@chakra-ui/react"
import type { CodeDisplay, ComparisonDisplay, LineChartDisplay, TableDisplay } from "../studioTypes"

const SQL_WORDS = new Set(("select from where join inner left right full outer on and or not as group by order having limit offset " +
  "with union all distinct case when then else end sum count avg min max over partition rank row_number dense_rank ntile lag lead " +
  "percent_rank insert into values update set delete create table index explain analyze is null in between like asc desc " +
  "conflict do excluded recursive coalesce cast interval date").split(" "))
const PYTHON_WORDS = new Set(("def return import from as for in if elif else while with try except finally raise class " +
  "lambda and or not is none true false print pass break continue yield").split(" "))

type Token = { text: string; kind: "keyword" | "string" | "comment" | "number" | "plain" }

/** Tiny tokenizer for readable colours; the code is shown as text, never interpreted. */
export function tokenize(line: string, language: CodeDisplay["language"]): Token[] {
  if (language === "text") return [{ text: line, kind: "plain" }]
  const words = language === "sql" ? SQL_WORDS : PYTHON_WORDS
  const comment = language === "sql" ? "--" : "#"
  const pattern = /('(?:[^'\\]|\\.)*'?|"(?:[^"\\]|\\.)*"?|--.*$|#.*$|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*|\s+|.)/g
  const tokens: Token[] = []
  for (const match of line.matchAll(pattern)) {
    const text = match[0]
    let kind: Token["kind"] = "plain"
    if (text.startsWith(comment)) kind = "comment"
    else if (text.startsWith("'") || text.startsWith("\"")) kind = "string"
    else if (/^\d/.test(text)) kind = "number"
    else if (words.has(text.toLowerCase())) kind = "keyword"
    else if ((text.startsWith("--") && language === "python") || (text.startsWith("#") && language === "sql")) kind = "plain"
    tokens.push({ text, kind })
  }
  return tokens
}

const TOKEN_COLOR: Record<Token["kind"], string | undefined> = {
  keyword: "code.keyword", string: "code.string", comment: "code.comment", number: "code.number", plain: undefined,
}

export function CodeBlock({ code, language, title, label }: { code: string; language: CodeDisplay["language"]; title?: string; label?: string }) {
  const lines = code.split("\n")
  const name = language === "sql" ? "SQL" : language === "python" ? "Python" : "Texte"
  return <Box as="figure" m="0" borderWidth="1px" borderColor="code.border" rounded="lg" overflow="hidden" bg="code.bg">
    <Flex as="figcaption" justify="space-between" gap="2" px="3" py="1.5" borderBottomWidth="1px" borderColor="code.border" fontSize="sm">
      <Text fontWeight="semibold" color="app.ink">{title || label || "Code"}</Text>
      <Text color="app.muted">{name}</Text>
    </Flex>
    <Box as="pre" m="0" p="3" overflowX="auto" fontSize="sm" lineHeight="1.55" color="code.fg" tabIndex={0}
      aria-label={`${title || "Code"} (${name}, ${lines.length} ligne${lines.length > 1 ? "s" : ""})`}
      css={{ fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, 'SF Mono', Menlo, monospace", tabSize: 4 }}>
      <code>{lines.map((line, index) => <Fragment key={index}>
        {tokenize(line, language).map((token, position) => TOKEN_COLOR[token.kind]
          ? <Text as="span" key={position} color={TOKEN_COLOR[token.kind]} fontWeight={token.kind === "keyword" ? "semibold" : undefined}
            fontStyle={token.kind === "comment" ? "italic" : undefined}>{token.text}</Text>
          : <Fragment key={position}>{token.text}</Fragment>)}
        {index < lines.length - 1 ? "\n" : null}
      </Fragment>)}</code>
    </Box>
  </Box>
}

export function DataTable({ columns, rows, caption }: { columns: string[]; rows: (string | number | boolean | null)[][]; caption: string }) {
  // Focusable named region: a narrow screen can scroll the table with the keyboard (WCAG 2.1.1).
  return <Box overflowX="auto" tabIndex={0} role="region" aria-label={caption} borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface">
    <Table.Root size="sm" variant="line" css={{ "& td, & th": { fontVariantNumeric: "tabular-nums" } }}>
      <Table.Caption captionSide="top" textAlign="left" px="3" pt="2" color="app.muted" fontSize="sm">{caption}</Table.Caption>
      <Table.Header><Table.Row bg="app.sunken">{columns.map((column, index) => <Table.ColumnHeader key={index} scope="col">{column}</Table.ColumnHeader>)}</Table.Row></Table.Header>
      <Table.Body>{rows.map((row, rowIndex) => <Table.Row key={rowIndex}>{row.map((cell, index) =>
        <Table.Cell key={index} color={cell === null ? "app.muted" : undefined}>{cell === null ? "vide" : String(cell)}</Table.Cell>)}</Table.Row>)}
      </Table.Body>
    </Table.Root>
  </Box>
}

function niceMax(value: number): number {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  return [1, 2, 2.5, 5, 10].map((step) => step * power).find((step) => step >= value) ?? value
}

/** Line chart in SVG: 1 or 2 series, gaps for missing points, markers that differ by shape, table alternative. */
export function LineChart({ data }: { data: LineChartDisplay }) {
  const [asTable, setAsTable] = useState(false)
  const width = 640
  const height = 260
  const pad = { left: 48, right: 16, top: 16, bottom: 36 }
  const values = data.series.flatMap((serie) => serie.values).filter((value): value is number => value !== null)
  const min = Math.min(0, ...values)
  const max = niceMax(Math.max(...values, 0))
  const x = (index: number) => pad.left + (index * (width - pad.left - pad.right)) / Math.max(1, data.labels.length - 1)
  const y = (value: number) => pad.top + ((max - value) * (height - pad.top - pad.bottom)) / (max - min || 1)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => min + (max - min) * ratio)
  const colors = ["chart.one", "chart.two"]
  const cssColor = (token: string) => `var(--chakra-colors-${token.replace(".", "-")})`
  const unit = data.unit ? ` ${data.unit}` : ""
  const paths = data.series.map((serie) => {
    let d = ""
    let open = false
    serie.values.forEach((value, index) => {
      if (value === null) { open = false; return }
      d += `${open ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)} `
      open = true
    })
    return d.trim()
  })
  const summary = data.series.map((serie) => `${serie.name} : ${serie.values.map((value, index) => `${data.labels[index]} ${value === null ? "donnée absente" : `${value}${unit}`}`).join(", ")}`).join(". ")
  return <Stack gap="3">
    {asTable ? <DataTable caption={data.title} columns={["Libellé", ...data.series.map((serie) => serie.name + (data.unit ? ` (${data.unit})` : ""))]}
      rows={data.labels.map((label, index) => [label, ...data.series.map((serie) => serie.values[index])])} />
      : <Box as="figure" m="0" p="4" borderWidth="1px" borderColor="app.border" rounded="lg" bg="app.surface">
        <Text as="figcaption" fontWeight="semibold" mb="2">{data.title}</Text>
        {data.series.length > 1 && <Flex gap="4" wrap="wrap" mb="2" fontSize="sm" aria-hidden="true">
          {data.series.map((serie, index) => <Flex key={serie.name} gap="1.5" align="center">
            <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true" focusable="false">
              <line x1="0" y1="5" x2="22" y2="5" stroke={cssColor(colors[index])} strokeWidth="2.5" strokeDasharray={index ? "5 3" : undefined} />
            </svg>{serie.name}</Flex>)}
        </Flex>}
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" aria-hidden="true" focusable="false" style={{ maxHeight: 320, overflow: "visible", display: "block" }}>
          {ticks.map((tick) => <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke={cssColor("chart.grid")} strokeWidth="1" />
            <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" fontSize="12" fill={cssColor("chart.axis")}>{Math.round(tick * 10) / 10}</text>
          </g>)}
          {data.labels.map((label, index) => <text key={index} x={x(index)} y={height - 12} textAnchor="middle" fontSize="12" fill={cssColor("chart.axis")}>{label}</text>)}
          {paths.map((d, index) => <path key={index} d={d} fill="none" stroke={cssColor(colors[index])} strokeWidth="2.5" strokeLinejoin="round"
            strokeDasharray={index ? "7 4" : undefined} />)}
          {data.series.map((serie, index) => serie.values.map((value, point) => value === null ? null : index === 0
            ? <circle key={`${index}-${point}`} cx={x(point)} cy={y(value)} r="4" fill={cssColor(colors[index])} />
            : <rect key={`${index}-${point}`} x={x(point) - 4} y={y(value) - 4} width="8" height="8" fill={cssColor(colors[index])} />))}
        </svg>
        {data.series.some((serie) => serie.values.includes(null)) && <Text fontSize="xs" color="app.muted" mt="1">Une interruption de la courbe signale une donnée absente (ce n’est pas zéro).</Text>}
        <VisuallyHidden>{summary}</VisuallyHidden>
      </Box>}
    <Button alignSelf="start" size="sm" variant="ghost" colorPalette="brand" aria-expanded={asTable} onClick={() => setAsTable(!asTable)}>
      {asTable ? "Afficher le graphique" : "Afficher les données en tableau"}
    </Button>
  </Stack>
}

function ComparisonSide({ item }: { item: CodeDisplay | TableDisplay }) {
  if (item.kind === "code") return <CodeBlock code={item.code} language={item.language} title={item.title} />
  return <DataTable caption={item.title || "Tableau"} columns={item.columns} rows={item.rows} />
}

export function Comparison({ data }: { data: ComparisonDisplay }) {
  return <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))" }} gap="3" role="group" aria-label="Comparaison côte à côte">
    {data.items.map((item, index) => <ComparisonSide key={index} item={item} />)}
  </Grid>
}

/** Lesson text: paragraphs separated by a blank line, "- " lists. Plain text only. */
