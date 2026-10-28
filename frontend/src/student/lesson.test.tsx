import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, expect, it } from "vitest"
import { system } from "../theme"
import { DataView } from "./activities"
import { LessonView } from "./Lesson"
import { RichText, parseRich } from "./RichText"

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

it("a media description is read through aria-describedby and shown only on request", () => {
  wrap(<DataView data={{ kind: "code", language: "sql", title: "La jointure", code: "SELECT 1",
    description: "Une requête qui **joint** orders et order_items." }} />)
  const group = screen.getByRole("group", { name: "Média : La jointure" })
  const description = document.getElementById(group.getAttribute("aria-describedby") ?? "")!
  expect(description).toHaveTextContent("Une requête qui joint orders et order_items.")
  expect(description).not.toBeVisible()
  expect(group).toHaveAccessibleDescription("Une requête qui joint orders et order_items.")
  const toggle = screen.getByRole("button", { name: "Description du média" })
  expect(toggle).toHaveAttribute("aria-expanded", "false")
  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute("aria-expanded", "true")
  expect(description).toBeVisible()
  cleanup()
  wrap(<DataView data={{ kind: "code", language: "sql", title: "Sans description", code: "SELECT 1" }} />)
  expect(screen.queryByRole("button", { name: "Description du média" })).toBeNull()
})
