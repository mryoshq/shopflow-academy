import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, expect, it } from "vitest"
import { system } from "../theme"
import { DataView } from "./activities"
import { LessonView } from "./Lesson"
import { RichText, parseRich, parseTable } from "./RichText"

const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
afterEach(cleanup)

it("parses paragraphs, bullet and numbered lists, and subtitles only when allowed", () => {
  const text = "### Le grain\nUne ligne = une commande.\nSuite.\n\n- orders\n- order_items\n  (articles)\n\n3. Lire\n4. Joindre\nFin."
  expect(parseRich(text, true)).toEqual([
    { type: "heading", text: "Le grain" },
    { type: "paragraph", lines: ["Une ligne = une commande.", "Suite."] },
    { type: "list", ordered: false, start: 1, items: ["orders", "order_items (articles)"] },
    { type: "list", ordered: true, start: 3, items: ["Lire", "Joindre"] },
    { type: "paragraph", lines: ["Fin."] },
  ])
  expect(parseRich("### Pas un titre ici", false)).toEqual([{ type: "paragraph", lines: ["### Pas un titre ici"] }])
  expect(parseRich("**gras** en début de ligne")).toEqual([{ type: "paragraph", lines: ["**gras** en début de ligne"] }])
})

it("renders bold and inline code as elements, and any HTML as plain text", () => {
  const { container } = wrap(<RichText text={"Utilisez **SUM** sur `orders`, pas `<b>x</b>`.\n\n<img src=x onerror=alert(1)> <script>alert(1)</script>\n\n1. un\n2. deux"} />)
  expect(container.querySelector("strong")).toHaveTextContent("SUM")
  expect([...container.querySelectorAll("code")].map((node) => node.textContent)).toEqual(["orders", "<b>x</b>"])
  expect(container.querySelector("img, script, b")).toBeNull()
  expect(container).toHaveTextContent("<img src=x onerror=alert(1)> <script>alert(1)</script>")
  expect(container.querySelector("ol")).not.toBeNull()
  expect(screen.getAllByRole("listitem")).toHaveLength(2)
})

const CONTRACTS = "Les contrats :\n\n| contract_id | client | montant |\n| :--- | :---: | ---: |\n| 2001 | **Atlas** SARL | `1 200 DH` |\n| 2002 | Rif \\| Nord | 950 DH |\n\nFin."

it("renders a Markdown table as an accessible table with its headers, cells keeping bold and code", () => {
  const { container } = wrap(<RichText text={CONTRACTS} headings />)
  const table = screen.getByRole("table")
  expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["contract_id", "client", "montant"])
  expect(screen.getAllByRole("columnheader").every((cell) => cell.getAttribute("scope") === "col")).toBe(true)
  expect(screen.getAllByRole("row")).toHaveLength(3)
  expect(screen.getByRole("cell", { name: "Atlas SARL" }).querySelector("strong")).toHaveTextContent("Atlas")
  expect(screen.getByRole("cell", { name: "1 200 DH" }).querySelector("code")).toHaveTextContent("1 200 DH")
  expect(screen.getByRole("cell", { name: "Rif | Nord" })).toBeInTheDocument()
  expect(screen.getByRole("cell", { name: "950 DH" })).toHaveStyle({ textAlign: "right" })
  // The table scrolls inside its own keyboard-reachable frame: never the page.
  const frame = screen.getByRole("region", { name: /Tableau : contract_id, client, montant/ })
  expect(frame).toContainElement(table)
  expect(frame).toHaveAttribute("tabindex", "0")
  expect(frame).toHaveStyle({ overflowX: "auto", maxWidth: "100%" })
  expect(container).not.toHaveTextContent("| ---")
  expect(container).toHaveTextContent("Les contrats :")
  expect(container).toHaveTextContent("Fin.")
})

it("leaves a malformed table as text, without error", () => {
  const noSeparator = "| contract_id | 2001 |\n| client | Atlas |"
  const wrongCount = "| a | b |\n| --- | --- |\n| 1 | 2 | 3 |"
  const tooWide = `| ${Array.from({ length: 13 }, (_, i) => `c${i}`).join(" | ")} |\n| ${Array(13).fill("---").join(" | ")} |`
  const tooLong = ["| a |", "| --- |", ...Array.from({ length: 101 }, (_, i) => `| ${i} |`)].join("\n")
  for (const text of [noSeparator, wrongCount, tooWide, tooLong]) {
    expect(parseTable(text.split("\n"))).toBeNull()
    expect(parseRich(text).every((block) => block.type === "paragraph")).toBe(true)
  }
  expect(parseTable(["| a |", "| --- |", ...Array.from({ length: 100 }, (_, i) => `| ${i} |`)])?.rows).toHaveLength(100)
  const { container } = wrap(<RichText text={wrongCount} />)
  expect(container.querySelector("table")).toBeNull()
  expect(container).toHaveTextContent("| 1 | 2 | 3 |")
})

it("keeps a table within a 390 px page: the frame scrolls, the page does not", () => {
  const before = window.innerWidth
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 })
  const wide = `| ${Array.from({ length: 12 }, (_, i) => `colonne_longue_${i}`).join(" | ")} |\n| ${Array(12).fill("---").join(" | ")} |\n| ${Array(12).fill("valeur").join(" | ")} |`
  const { container } = wrap(<div style={{ width: 390 }}><RichText text={wide} /></div>)
  const frame = screen.getByRole("region", { name: /Tableau/ })
  expect(frame).toHaveStyle({ overflowX: "auto", maxWidth: "100%" })
  expect(container.firstElementChild).toContainElement(frame)
  expect(screen.getAllByRole("columnheader")).toHaveLength(12)
  Object.defineProperty(window, "innerWidth", { configurable: true, value: before })
})

it("lays out a structured lesson in reading order, the media between the example and « À vous »", () => {
  const { container } = wrap(<LessonView headingAs="h2" definition={{
    objective: "Expliquer pourquoi une jointure peut doubler un total.",
    hook: "70 DH attendus, **100 DH** affichés : où sont passés les 30 DH ?",
    key_terms: [{ term: "Grain", definition: "Ce que représente une ligne." }, { term: "Jointure", definition: "Associer deux tables." }],
    body: "### Pourquoi\nUne ligne par article.",
    example: "C-101 a deux articles : 30 DH comptés deux fois.",
    practice: "Ouvrez la mission suivante et choisissez la correction.",
  }} media={<p>MÉDIA</p>} />)
  const text = container.textContent ?? ""
  const order = ["Objectif : Expliquer", "70 DH attendus", "Vocabulaire", "Grain", "Pourquoi", "Exemple résolu", "MÉDIA", "À vous"].map((part) => text.indexOf(part))
  expect(order.every((position) => position >= 0)).toBe(true)
  expect([...order].sort((a, b) => a - b)).toEqual(order)
  expect(screen.getByRole("heading", { level: 2, name: "Pourquoi" })).toBeInTheDocument()
  expect(screen.getAllByRole("term").map((node) => node.textContent)).toEqual(["Grain", "Jointure"])
  expect(screen.getByRole("region", { name: "Exemple résolu" })).toBeInTheDocument()
  expect(screen.getByRole("region", { name: "À vous" })).toBeInTheDocument()
})

it("an old lesson with only body renders its text and nothing else", () => {
  const { container } = wrap(<LessonView definition={{ body: "Le grain d'une table.\n\n- orders\n- order_items" }} media={null} />)
  expect(container).toHaveTextContent("Le grain d'une table.")
  expect(screen.getAllByRole("listitem")).toHaveLength(2)
  expect(container).not.toHaveTextContent(/Objectif|Vocabulaire|Exemple résolu|À vous/)
})

it("a media description is read through aria-describedby and never shown on screen", () => {
  wrap(<DataView data={{ kind: "code", language: "sql", title: "La jointure", code: "SELECT 1",
    description: "Une requête qui **joint** orders et order_items." }} />)
  const group = screen.getByRole("group", { name: "Média : La jointure" })
  expect(group).toHaveAccessibleDescription("Une requête qui joint orders et order_items.")
  expect(screen.queryByRole("button", { name: "Description du média" })).toBeNull()
})

it("lesson text renders *italic* next to **bold** without touching 2 * 3", () => {
  const { container } = wrap(<RichText text={"Un *grain* clair, **très net**, _vraiment_, et 2 * 3 = 6."} />)
  expect(container.querySelectorAll("em")).toHaveLength(2)
  expect(container.querySelector("strong")).toHaveTextContent("très net")
  expect(container).toHaveTextContent("Un grain clair, très net, vraiment, et 2 * 3 = 6.")
})
