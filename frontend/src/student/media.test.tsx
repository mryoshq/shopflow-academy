import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { AnimationPlayer, FlowDiagram, MindMap, VideoView } from "./media"
import type { AnimationDisplay, FlowDisplay, MindmapDisplay } from "../studioTypes"

const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
afterEach(() => { cleanup(); vi.useRealTimers() })

const table = (title: string, rows: (string | number)[][], highlight = { rows: [] as number[], cells: [] as [number, number][] }) => ({ title, columns: ["order_id", "frais"], rows, highlight })
const animation: AnimationDisplay = { kind: "animation", title: "La jointure", steps: [
  { caption: "Deux commandes.", scene: { tables: [table("orders", [["C-101", 30], ["C-102", 40]])], arrows: [], counter: { label: "Total attendu", value: "70 DH" }, badge: null } },
  { caption: "Après la jointure.", scene: { tables: [table("items", [["C-101", 30]], { rows: [0], cells: [[0, 1]] }), table("orders", [["C-101", 30]])],
    arrows: [{ source: [0, 0], target: [1, 0], label: "" }], counter: { label: "SUM", value: "100 DH" }, badge: { kind: "erreur", text: "Compté deux fois" } } },
] }

it("animation: step by step, restart, live caption and a full text description", () => {
  wrap(<AnimationPlayer data={animation} />)
  expect(screen.getByText("Deux commandes.")).toBeInTheDocument()
  expect(screen.getByText("70 DH")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Étape précédente" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "Étape suivante" }))
  expect(screen.getByText("Après la jointure.")).toBeInTheDocument()
  expect(screen.getByText("100 DH")).toBeInTheDocument()
  expect(screen.getByText(/Compté deux fois/)).toBeInTheDocument()
  expect(screen.getByText("Étape 2 sur 2")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Recommencer" }))
  expect(screen.getByText("Deux commandes.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Description textuelle de toutes les étapes" }))
  expect(screen.getByText(/Flèches : ligne 1 de « items » vers ligne 1 de « orders »/)).toBeInTheDocument()
  expect(screen.getByText(/Erreur : Compté deux fois/)).toBeInTheDocument()
})

it("animation: play advances on its own and stops at the end", () => {
  vi.useFakeTimers()
  wrap(<AnimationPlayer data={animation} />)
  fireEvent.click(screen.getByRole("button", { name: "Lecture" }))
  expect(screen.getByRole("button", { name: "Pause" })).toHaveAttribute("aria-pressed", "true")
  act(() => { vi.advanceTimersByTime(3300) })
  expect(screen.getByText("Après la jointure.")).toBeInTheDocument()
  act(() => { vi.advanceTimersByTime(3300) })
  expect(screen.getByRole("button", { name: "Rejouer" })).toBeInTheDocument()
})

const mindmap: MindmapDisplay = { kind: "mindmap", title: "Qualité", root: { label: "Qualité des données", children: [
  { label: "Types", children: [{ label: "Montants", children: [] }] }, { label: "Doublons", children: [] }] } }

it("mind map: tree navigation with the keyboard, folding, and a list alternative", () => {
  wrap(<MindMap data={mindmap} />)
  const tree = screen.getByRole("tree", { name: "Qualité" })
  const root = within(tree).getByRole("treeitem", { name: /Qualité des données/ })
  expect(root).toHaveAttribute("aria-expanded", "true")
  expect(within(tree).queryByRole("treeitem", { name: /Montants/ })).not.toBeInTheDocument()
  root.focus()
  fireEvent.keyDown(root, { key: "ArrowDown" })
  const types = within(tree).getByRole("treeitem", { name: /Types/ })
  fireEvent.keyDown(types, { key: "ArrowRight" })
  expect(types).toHaveAttribute("aria-expanded", "true")
  expect(within(tree).getByRole("treeitem", { name: "Montants" })).toHaveAttribute("aria-level", "3")
  fireEvent.keyDown(types, { key: "Enter" })
  expect(types).toHaveAttribute("aria-expanded", "false")
  fireEvent.click(screen.getByRole("button", { name: "Afficher en liste" }))
  expect(screen.queryByRole("tree")).not.toBeInTheDocument()
  expect(screen.getByText("Montants")).toBeInTheDocument()
})

const flow: FlowDisplay = { kind: "flow", title: "Import", input: 1000, unit: "lignes", steps: [
  { id: "lire", label: "Lire", rejects: 0, note: "" }, { id: "valider", label: "Valider", rejects: 12, note: "Montants en lettres" }, { id: "charger", label: "Charger", rejects: 0, note: "" }] }

it("flow: the token goes through the steps and counts accepted and rejected rows", () => {
  wrap(<FlowDiagram data={flow} />)
  expect(screen.getByText("1 000 lignes en entrée.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Étape suivante" }))
  fireEvent.click(screen.getByRole("button", { name: "Étape suivante" }))
  expect(screen.getByText("988 lignes")).toBeInTheDocument()
  expect(screen.getByText("12 lignes")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Étape suivante" }))
  expect(screen.getByText("Arrivé à destination.")).toBeInTheDocument()
  expect(screen.getByText(/À la fin : 988 lignes acceptées/)).toBeInTheDocument()
})

it("video: sandboxed embed from an allowed host, or a course file with French captions", () => {
  wrap(<VideoView data={{ kind: "video", title: "Le pipeline", url: "https://www.youtube-nocookie.com/embed/abcdefgh", src: null, captions_src: null }} />)
  const frame = screen.getByTitle("Le pipeline")
  expect(frame.tagName).toBe("IFRAME")
  expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation")
  expect(screen.getByText(/ne compte pas dans la note/)).toBeInTheDocument()
  cleanup()
  const { container } = wrap(<VideoView data={{ kind: "video", title: "Fichier", url: null, src: "/media/0123456789abcdef.mp4", captions_src: "/media/0123456789abcdef.vtt" }} />)
  expect(container.querySelector("video")).toHaveAttribute("src", "/media/0123456789abcdef.mp4")
  expect(container.querySelector("track")).toHaveAttribute("srclang", "fr")
})
