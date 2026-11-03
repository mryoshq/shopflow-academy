import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { lazy, Suspense } from "react"
import { system } from "../theme"
import { DownloadPreview } from "./DownloadPreview"
import { PdfLoadBoundary } from "./PdfLoadBoundary"
vi.mock("./PdfPreview", () => { throw new Error("Simulated PDF chunk network failure") })
beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it("contains a rejected PDF module while preserving the original download and close controls", async () => {
  const close = vi.fn()
  render(<ChakraProvider value={system}><DownloadPreview file={{ id: "0123456789abcdef.pdf", name: "guide.pdf", title: "Guide fictif", size: 100 }} onClose={close} /></ChakraProvider>)
  expect(await screen.findByText("Le lecteur PDF n’a pas pu être chargé. Rechargez la page pour réessayer.")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Télécharger" })).toHaveAttribute("href", "/api/v1/downloads/0123456789abcdef.pdf")
  expect(screen.getByRole("button", { name: "Recharger la page" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Fermer" })); expect(close).toHaveBeenCalledOnce()
})
it("offers a full-document recovery instead of reusing the cached rejected import", async () => {
  const Failing = lazy(async () => { throw new Error("chunk failed") })
  const reload = vi.fn()
  render(<ChakraProvider value={system}><PdfLoadBoundary onReload={reload}><Suspense fallback={<span>Loading</span>}><Failing /></Suspense></PdfLoadBoundary></ChakraProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "Recharger la page" }))
  expect(reload).toHaveBeenCalledOnce()
})
