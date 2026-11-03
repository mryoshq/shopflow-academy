import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { PdfPreview } from "./PdfPreview"
import { pdfPreviewable, MAX_PDF_PREVIEW_BYTES } from "./downloadPreviewData"
const pdf = vi.hoisted(() => ({ getDocument: vi.fn(), destroy: vi.fn(), cancel: vi.fn(), getPage: vi.fn(), render: vi.fn() }))
vi.mock("pdfjs-dist", () => ({ AnnotationMode: { DISABLE: 0 }, GlobalWorkerOptions: {}, getDocument: pdf.getDocument }))
const file = { id: "0123456789abcdef.pdf", name: "guide.pdf", title: "Guide", size: 100 }
const wrap = () => render(<ChakraProvider value={system}><PdfPreview file={file} /></ChakraProvider>)
beforeEach(() => {
  pdf.destroy.mockResolvedValue(undefined); pdf.cancel.mockReset()
  pdf.render.mockReturnValue({ promise: Promise.resolve(), cancel: pdf.cancel })
  pdf.getPage.mockImplementation(async (n) => ({ getViewport: ({ scale }: { scale: number }) => ({ width: 300 * scale, height: 200 * scale }), render: pdf.render, getTextContent: async () => ({ items: [{ str: `Page ${n} accessible`, hasEOL: true }] }) }))
  pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage: pdf.getPage, loadingTask: { destroy: pdf.destroy } }), destroy: pdf.destroy })
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("%PDF-1.7\nfictif", { headers: { "Content-Type": "application/pdf" } })))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })
it("renders pages and extracted text, disables annotations and destroys the worker on close", async () => {
  const view = wrap()
  expect(await screen.findByText("Page 1 accessible")).toBeInTheDocument()
  expect(pdf.getDocument).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Uint8Array), enableXfa: false, useWasm: false, useWorkerFetch: false, disableFontFace: true }))
  expect(pdf.render).toHaveBeenCalledWith(expect.objectContaining({ annotationMode: 0 }))
  fireEvent.click(screen.getByRole("button", { name: "Page suivante" }))
  expect(await screen.findByText("Page 2 accessible")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Page suivante" })).toBeDisabled()
  fireEvent.change(screen.getByRole("combobox", { name: "Zoom du PDF" }), { target: { value: "1.5" } })
  await waitFor(() => expect(view.container.querySelector("canvas")).toHaveAttribute("width", "450"))
  view.unmount(); expect(pdf.destroy).toHaveBeenCalled()
})
it("refuses oversized metadata and excessive pages with a fallback", async () => {
  expect(pdfPreviewable({ ...file, size: MAX_PDF_PREVIEW_BYTES + 1 })).toBe(false)
  pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 201 }), destroy: pdf.destroy })
  wrap(); expect(await screen.findByText("Aperçu indisponible. Vous pouvez télécharger le fichier.")).toBeInTheDocument()
  expect(pdf.destroy).toHaveBeenCalled()
})
it("rejects a false PDF before parsing and retries after an access failure", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response("", { status: 404 })).mockResolvedValueOnce(new Response("HTML", { headers: { "Content-Type": "application/pdf" } }))
  vi.stubGlobal("fetch", fetch); wrap()
  expect(await screen.findByText("Aperçu indisponible. Vous pouvez télécharger le fichier.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  expect(await screen.findByText("Aperçu indisponible. Vous pouvez télécharger le fichier.")).toBeInTheDocument()
  expect(pdf.getDocument).not.toHaveBeenCalled()
})

it("destroys a stalled loading worker after 20 seconds", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  pdf.getDocument.mockReturnValue({ promise: new Promise(() => {}), destroy: pdf.destroy })
  wrap()
  await act(async () => { await vi.advanceTimersByTimeAsync(20_100) })
  expect(screen.getByText("Aperçu indisponible. Vous pouvez télécharger le fichier.")).toBeInTheDocument()
  expect(pdf.destroy).toHaveBeenCalled()
})
it("bounds a stalled page request and destroys it on timeout", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  pdf.getPage.mockImplementation(() => new Promise(() => {}))
  wrap()
  await waitFor(() => expect(pdf.getPage).toHaveBeenCalled())
  await act(async () => { await vi.advanceTimersByTimeAsync(15_100) })
  expect(screen.getByText("Aperçu indisponible. Vous pouvez télécharger le fichier.")).toBeInTheDocument()
  expect(pdf.destroy).toHaveBeenCalled()
})
it("destroys the loading task when closing during a suspended page request", async () => {
  pdf.getPage.mockImplementation(() => new Promise(() => {}))
  const view = wrap()
  await waitFor(() => expect(pdf.getPage).toHaveBeenCalled())
  view.unmount()
  expect(pdf.destroy).toHaveBeenCalledOnce()
})
it("refuses an oversized page before allocating its canvas and retries a rendering failure", async () => {
  pdf.getPage.mockResolvedValueOnce({ getViewport: () => ({ width: 5000, height: 5000 }), render: pdf.render })
  const view = wrap()
  expect(await screen.findByText("Aperçu indisponible. Vous pouvez télécharger le fichier.")).toBeInTheDocument()
  expect(pdf.render).not.toHaveBeenCalled()
  expect(view.container.querySelector("canvas")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
  expect(await screen.findByText("Page 1 accessible")).toBeInTheDocument()
})
