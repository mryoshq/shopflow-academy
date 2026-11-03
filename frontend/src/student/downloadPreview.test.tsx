import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { Downloads } from "./Downloads"
import { codePreviewable, fetchCodePreview, MAX_CODE_PREVIEW_BYTES, MAX_CODE_PREVIEW_LINES } from "./downloadPreviewData"
const file = { id: "0123456789abcdef.sql", name: "query.sql", title: "Requête", size: 32 }
const signal = () => new AbortController().signal
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
it("fetches the protected attachment and displays inert highlighted numbered code", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("SELECT 1;\n-- <img src=x onerror=alert(1)>", { headers: { "Content-Type": "text/plain" } }))
  vi.stubGlobal("fetch", fetch)
  render(<ChakraProvider value={system}><Downloads data={{ kind: "download", files: [file] }} /></ChakraProvider>)
  fireEvent.click(screen.getByRole("button", { name: "Aperçu de Requête" }))
  const code = await screen.findByLabelText("Contenu de query.sql")
  expect(code.querySelector('[data-token="keyword"]')).toHaveTextContent("SELECT")
  expect(code.querySelector("img")).toBeNull()
  expect(code).toHaveTextContent("<img src=x onerror=alert(1)>")
  expect(code.querySelector('[aria-hidden="true"]')).toHaveTextContent("1")
  expect(fetch).toHaveBeenCalledWith("/api/v1/downloads/0123456789abcdef.sql", expect.objectContaining({ credentials: "same-origin", cache: "no-store", redirect: "error" }))
  fireEvent.click(screen.getByRole("button", { name: "Fermer l’aperçu" }))
})
it("refuses traversal, archives, mismatched extension and oversized metadata before fetching", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch)
  for (const invalid of [{ ...file, id: "../secret.sql" }, { ...file, name: "query.html" }, { ...file, size: MAX_CODE_PREVIEW_BYTES + 1 }, { ...file, id: "0123456789abcdef.zip", name: "archive.zip" }]) {
    expect(codePreviewable(invalid)).toBe(false)
    await expect(fetchCodePreview(invalid, signal())).rejects.toThrow()
  }
  expect(fetch).not.toHaveBeenCalled()
})
it("rejects invalid UTF-8, binary controls, active MIME and excess lines", async () => {
  for (const [body, mime] of [[new Uint8Array([255, 254]), "text/plain"], ["abc\0def", "text/plain"], ["<html>", "text/html"], ["\n".repeat(MAX_CODE_PREVIEW_LINES), "text/plain"]] as const) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { headers: { "Content-Type": mime } })))
    await expect(fetchCodePreview(file, signal())).rejects.toThrow()
  }
})
it("cancels oversized streams without trusting Content-Length or metadata", async () => {
  const cancel = vi.fn()
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_CODE_PREVIEW_BYTES + 1)) }, cancel })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { headers: { "Content-Type": "text/plain", "Content-Length": "2" } })))
  await expect(fetchCodePreview(file, signal())).rejects.toThrow("too-large")
  expect(cancel).toHaveBeenCalled()
})
it("reports access errors with retry and download fallback; closing aborts", async () => {
  let observed: AbortSignal | undefined
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, init) => { observed = init.signal; return new Response("", { status: 404 }) }))
  render(<ChakraProvider value={system}><Downloads data={{ kind: "download", files: [file] }} /></ChakraProvider>)
  fireEvent.click(screen.getByRole("button", { name: "Aperçu de Requête" }))
  expect(await screen.findByText("Aperçu indisponible. Vous pouvez télécharger le fichier.")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument()
  expect(screen.getAllByRole("link").some((link) => link.getAttribute("href") === "/api/v1/downloads/0123456789abcdef.sql")).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "Fermer l’aperçu" })); await waitFor(() => expect(observed?.aborted).toBe(true))
})

it("falls back to numbered plain text for long punctuation source", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(";".repeat(40_000), { headers: { "Content-Type": "text/plain" } })))
  render(<ChakraProvider value={system}><Downloads data={{ kind: "download", files: [file] }} /></ChakraProvider>)
  fireEvent.click(screen.getByRole("button", { name: "Aperçu de Requête" }))
  const code = await screen.findByLabelText("Contenu de query.sql")
  expect(code.querySelectorAll("span").length).toBeLessThan(10)
  expect(code.textContent?.length).toBeGreaterThan(40_000)
})
it("reports clipboard failures and lets the user retry", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("SELECT 1;", { headers: { "Content-Type": "text/plain" } })))
  const copy = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValueOnce(undefined)
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } })
  render(<ChakraProvider value={system}><Downloads data={{ kind: "download", files: [file] }} /></ChakraProvider>)
  fireEvent.click(screen.getByRole("button", { name: "Aperçu de Requête" }))
  fireEvent.click(await screen.findByRole("button", { name: "Copier le texte" }))
  expect(await screen.findByText("Copie impossible. Réessayez ou sélectionnez le texte.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Copier le texte" }))
  expect(await screen.findByRole("button", { name: "Copié" })).toBeInTheDocument()
  expect(copy).toHaveBeenLastCalledWith("SELECT 1;")
})
it("cancels a blocked partial stream on abort", async () => {
  const cancel = vi.fn()
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("SELECT ")) }, cancel })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { headers: { "Content-Type": "text/plain" } })))
  const controller = new AbortController()
  const pending = fetchCodePreview(file, controller.signal)
  await Promise.resolve(); controller.abort()
  await expect(pending).rejects.toThrow()
  expect(cancel).toHaveBeenCalled()
})
it("dispatches unauthorized for a revoked session", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })))
  const unauthorized = vi.fn(); window.addEventListener("academy:unauthorized", unauthorized)
  await expect(fetchCodePreview(file, signal())).rejects.toThrow()
  expect(unauthorized).toHaveBeenCalledOnce()
  window.removeEventListener("academy:unauthorized", unauthorized)
})

it("aborts a partial stalled stream at the 15-second UI timeout, then retries successfully", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const cancel = vi.fn()
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("SELECT ")) }, cancel })
  const fetch = vi.fn().mockResolvedValueOnce(new Response(stream, { headers: { "Content-Type": "text/plain" } }))
    .mockImplementation(async () => new Response("SELECT 2;", { headers: { "Content-Type": "text/plain" } }))
  vi.stubGlobal("fetch", fetch)
  render(<ChakraProvider value={system}><Downloads data={{ kind: "download", files: [file] }} /></ChakraProvider>)
  fireEvent.click(screen.getByRole("button", { name: "Aperçu de Requête" }))
  await act(async () => { await vi.advanceTimersByTimeAsync(15_100) })
  expect(await screen.findByText("Aperçu indisponible. Vous pouvez télécharger le fichier.")).toBeInTheDocument()
  expect(cancel).toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
  expect(await screen.findByLabelText("Contenu de query.sql")).toHaveTextContent("SELECT 2;")
})
