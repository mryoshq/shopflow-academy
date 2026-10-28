import { fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { expect, it } from "vitest"
import { system } from "../theme"
import { DataView } from "./activities"

it("a course picture keeps its alt text and caption, and is enlarged in a dialog on click", () => {
  render(<ChakraProvider value={system}><DataView data={{ kind: "image", src: "/media/0123456789abcdef.svg", alt: "Schéma du pipeline", caption: "Les lignes valides et les rejets." }} /></ChakraProvider>)
  const pictures = screen.getAllByRole("img", { name: "Schéma du pipeline", hidden: true })
  expect(pictures[0]).toHaveAttribute("src", "/media/0123456789abcdef.svg")
  expect(pictures[0]).toHaveAttribute("loading", "lazy")
  expect(screen.getAllByText("Les lignes valides et les rejets.").length).toBeGreaterThan(0)
  const dialog = document.querySelector("dialog")!
  expect(dialog).not.toHaveAttribute("open")
  fireEvent.click(screen.getByRole("button", { name: "Agrandir l’image : Schéma du pipeline" }))
  expect(dialog).toHaveAttribute("open")
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }))
  expect(dialog).not.toHaveAttribute("open")
})
