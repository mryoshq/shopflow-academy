import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it } from "vitest"
import { system } from "../theme"
import { Flashcards, deckKey, shuffled, spoken } from "./Flashcards"
import type { FlashcardsDisplay } from "../studioTypes"

const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
const deck: FlashcardsDisplay = { kind: "flashcards", title: "Vocabulaire SQL", cards: [
  { front: "Grain", back: "Ce que **représente** une ligne." },
  { front: "`COUNT(DISTINCT x)`", back: "Compte les valeurs différentes." },
  { front: "Jointure", back: "Assemble deux tables sur une clé." },
] }

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

it("one card at a time: flip by click, back announced, arrows and counter, light formatting rendered", () => {
  wrap(<Flashcards data={deck} />)
  const section = screen.getByRole("region", { name: "Cartes : Vocabulaire SQL" })
  expect(within(section).getByText("1 / 3")).toBeInTheDocument()
  const card = screen.getByRole("button", { name: "Carte 1 : Grain. Retourner pour voir le verso" })
  expect(card).toHaveAttribute("aria-pressed", "false")
  fireEvent.click(card)
  expect(card).toHaveAttribute("aria-pressed", "true")
  expect(screen.getByText("Verso : Ce que représente une ligne.")).toBeInTheDocument()  // live region, without marks
  expect(screen.getByText("représente").tagName).toBe("STRONG")
  fireEvent.keyDown(section, { key: "ArrowRight" })
  expect(within(section).getByText("2 / 3")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Carte 2 : COUNT(DISTINCT x). Retourner pour voir le verso" })).toHaveAttribute("aria-pressed", "false")
  fireEvent.keyDown(section, { key: "ArrowLeft" })
  fireEvent.keyDown(section, { key: "ArrowLeft" })
  expect(within(section).getByText("3 / 3")).toBeInTheDocument()  // wraps around
})

it("« À revoir » is kept in this browser and offers to take the cards again; no request is sent", () => {
  wrap(<Flashcards data={deck} />)
  for (const verdict of ["À revoir", "Je savais", "À revoir"]) {
    fireEvent.click(screen.getByRole("button", { name: /Retourner/ }))
    fireEvent.click(screen.getByRole("button", { name: verdict }))
  }
  expect(screen.getByText(/2 cartes à revoir/)).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(deckKey(deck.cards))!)).toEqual([0, 2])
  fireEvent.click(screen.getByRole("button", { name: "Reprendre les cartes à revoir" }))
  expect(screen.getByText("1 / 2")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Carte 1 : Grain. Retourner pour voir le verso" })).toBeInTheDocument()
  // A card marked « Je savais » leaves the list.
  fireEvent.click(screen.getByRole("button", { name: /Retourner/ }))
  fireEvent.click(screen.getByRole("button", { name: "Je savais" }))
  expect(JSON.parse(localStorage.getItem(deckKey(deck.cards))!)).toEqual([2])
})

it("shuffle keeps every card once; helpers", () => {
  wrap(<Flashcards data={deck} />)
  fireEvent.click(screen.getByRole("button", { name: "Mélanger" }))
  expect(screen.getByText("1 / 3")).toBeInTheDocument()
  let seed = 0.7
  const order = shuffled(10, () => (seed = (seed * 9301 + 0.49297) % 1))
  expect([...order].sort((a, b) => a - b)).toEqual([...Array(10).keys()])
  expect(deckKey(deck.cards)).toBe(deckKey(JSON.parse(JSON.stringify(deck.cards))))
  expect(spoken("**Gras** et `code`")).toBe("Gras et code")
})
