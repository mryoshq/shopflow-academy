import { fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { parseRoute } from "../useHashRoute"
import { DataView } from "../student/activities"
import { mergeVoyageData, sceneFrom } from "./data"
import VoyagePage from "./VoyagePage"

afterEach(() => vi.unstubAllGlobals())

it("merges the course values over the defaults: objects by key, arrays replaced", () => {
  const defaults = { csv: { lines: ["a"], separator: ";" }, rejects: [{ line: 1 }], title: "Défaut" }
  expect(mergeVoyageData(defaults, { csv: { lines: ["b", "c"] }, rejects: [], extra: 1 }))
    .toEqual({ csv: { lines: ["b", "c"], separator: ";" }, rejects: [], title: "Défaut", extra: 1 })
  expect(mergeVoyageData(defaults, null)).toBe(defaults)
  expect(mergeVoyageData(defaults, [1])).toBe(defaults)
})

it("reads #/voyage and #/voyage/<scene> (1 to 7)", () => {
  expect(sceneFrom("#/voyage")).toBe(1)
  expect(sceneFrom("#/voyage/7")).toBe(7)
  expect(sceneFrom("#/voyage/8")).toBeNull()
  expect(parseRoute("#/voyage/3")).toEqual({ name: "voyage", scene: 3 })
  expect(parseRoute("#/mission/12")).toEqual({ name: "mission", id: 12 })
})

it("the page loads the course values and moves between the 7 scenes with buttons and arrows", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ data: { csv: { lines: ["x"] } } }) }))
  const onScene = vi.fn()
  render(<ChakraProvider value={system}><VoyagePage scene={3} onScene={onScene} /></ChakraProvider>)
  expect(screen.getByRole("button", { name: "Scène 3 sur 7" })).toHaveAttribute("aria-current", "step")
  expect(await screen.findByText(/fournies par le cours/)).toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole("region", { name: "Le voyage d’une donnée" }), { key: "ArrowRight" })
  expect(onScene).toHaveBeenLastCalledWith(4)
  fireEvent.click(screen.getByRole("button", { name: "Scène 7 sur 7" }))
  expect(screen.getByRole("button", { name: "Scène suivante →" })).toBeDisabled()
})

it("a lesson announces the experience; the link appears once the application is integrated", () => {
  render(<ChakraProvider value={system}><DataView data={{ kind: "experience", experience: "voyage", scene: 2 }} /></ChakraProvider>)
  expect(screen.getByText("Expérience interactive, à partir de la scène 2.")).toBeInTheDocument()
})
