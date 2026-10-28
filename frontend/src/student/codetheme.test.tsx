import { readFileSync } from "node:fs"
import { fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { expect, it } from "vitest"
import { system } from "../theme"
import { CodeEditor } from "./CodeEditor"
import { tokenize } from "./displays"

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

it("Catppuccin Latte and Mocha code colours are AA (4.5:1) on their background", () => {
  const source = readFileSync("src/theme.ts", "utf8")
  const block = source.slice(source.indexOf("code: {"), source.indexOf("chart: {"))
  const colours = Object.fromEntries([...block.matchAll(/(\w+): \{ value: \{ base: "(#[0-9A-F]{6})", _dark: "(#[0-9A-F]{6})" \} \}/g)]
    .map(([, name, light, dark]) => [name, { light, dark }]))
  expect(colours.bg).toEqual({ light: "#EFF1F5", dark: "#1E1E2E" }) // Latte base, Mocha base
  for (const name of ["fg", "keyword", "string", "comment", "number", "function"]) {
    expect(contrast(colours[name].light, colours.bg.light), `${name} clair`).toBeGreaterThanOrEqual(4.5)
    expect(contrast(colours[name].dark, colours.bg.dark), `${name} sombre`).toBeGreaterThanOrEqual(4.5)
  }
})

it("tokenizes SQL and Python keywords, functions, strings, numbers and comments", () => {
  const sql = tokenize("SELECT city, SUM(total) FROM orders WHERE total > 100 AND status = 'payée' -- DH", "sql")
  const kinds = (tokens: ReturnType<typeof tokenize>, kind: string) => tokens.filter((t) => t.kind === kind).map((t) => t.text)
  expect(kinds(sql, "keyword")).toEqual(["SELECT", "FROM", "WHERE", "AND"])
  expect(kinds(sql, "function")).toEqual(["SUM"])
  expect(kinds(sql, "string")).toEqual(["'payée'"])
  expect(kinds(sql, "number")).toEqual(["100"])
  expect(kinds(sql, "comment")).toEqual(["-- DH"])
  const python = tokenize("def clean(df):  # nettoie", "python")
  expect(kinds(python, "keyword")).toEqual(["def"])
  expect(kinds(python, "function")).toEqual(["clean"])
  expect(kinds(python, "comment")).toEqual(["# nettoie"])
  expect(tokenize("SELECT 1", "text")).toEqual([{ text: "SELECT 1", kind: "plain" }])
})

it("the SQL editor stays a native, labelled textarea with a coloured copy hidden from screen readers", () => {
  let value = "SELECT 1"
  render(<ChakraProvider value={system}><label htmlFor="sql-1">Votre requête</label>
    <CodeEditor id="sql-1" value={value} onChange={(next) => { value = next }} language="sql" rows={6} /></ChakraProvider>)
  const box = screen.getByRole("textbox", { name: "Votre requête" })
  fireEvent.change(box, { target: { value: "SELECT 2" } })
  expect(value).toBe("SELECT 2")
  const copy = document.querySelector("pre[aria-hidden='true']")
  expect(copy?.querySelector("[data-token='keyword']")?.textContent).toBe("SELECT")
})
