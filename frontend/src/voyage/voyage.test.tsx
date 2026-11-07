import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { parseRoute } from "../useHashRoute"
import { DataView } from "../student/activities"
import { DEFAULT_VOYAGE, applyVoyageData, mergeVoyageData, sceneFrom } from "./data"
import { BASE, BATCH } from "./model"
import VoyagePage from "./VoyagePage"

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); applyVoyageData(DEFAULT_VOYAGE) })

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

it("the page applies the course values, opens the scene of the address and reports the scene reached", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ data: { base: { orders: 12, unknown: 1 }, batch: { ttl: "x" } } }) }))
  const onScene = vi.fn()
  render(<ChakraProvider value={system}><VoyagePage scene={3} onScene={onScene} /></ChakraProvider>)
  const scenes = await screen.findByRole("navigation", { name: "Scènes du parcours" })
  await waitFor(() => expect(within(scenes).getByRole("button", { name: "03 Attendre et vérifier" })).toHaveAttribute("aria-current", "step"))
  expect(onScene).not.toHaveBeenCalled()
  // Course value applied (orders before the batch), wrong types ignored (TTL stays 60 s).
  expect(BASE.orders).toBe(12)
  expect(BATCH.ttl).toBe(60)
  fireEvent.click(within(scenes).getByRole("button", { name: "05 Suivre les livraisons" }))
  expect(onScene).toHaveBeenLastCalledWith(5)
  expect(screen.getByRole("heading", { level: 1, name: "Le voyage d’une donnée." })).toBeInTheDocument()
})

it("without course values the experience runs on the owner's defaults", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ data: null }) }))
  // jsdom has no layout: give the experience a desktop size so the pipeline draws its cards.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 1280, bottom: 720, width: 1280, height: 720, toJSON: () => ({}) })
  render(<ChakraProvider value={system}><VoyagePage /></ChakraProvider>)
  expect(await screen.findByRole("navigation", { name: "Scènes du parcours" })).toBeInTheDocument()
  expect(BASE.orders).toBe(10)
  // The PostgreSQL card of the pipeline shows the orders before the batch.
  expect(screen.getByRole("group", { name: "PostgreSQL" })).toHaveTextContent(/(?<!\d)10 cmd/)
})

it("a lesson links to the experience at its scene", () => {
  render(<ChakraProvider value={system}><DataView data={{ kind: "experience", experience: "voyage", scene: 2 }} /></ChakraProvider>)
  expect(screen.getByText("Expérience interactive, à partir de la scène 2.")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Ouvrir l’expérience" })).toHaveAttribute("href", "#/voyage/2")
})
