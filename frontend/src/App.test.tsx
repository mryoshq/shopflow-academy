import { render, screen } from "@testing-library/react"
import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import { expect, it, vi } from "vitest"
import { App } from "./App"

it("shows the empty platform state when the API is available", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
  render(<ChakraProvider value={defaultSystem}><App /></ChakraProvider>)
  expect(screen.getByRole("heading", { name: /Apprendre en agissant/i })).toBeInTheDocument()
  expect(await screen.findByText("API disponible. Aucun cours publié.")).toBeInTheDocument()
  vi.unstubAllGlobals()
})

it("shows a readable network error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
  render(<ChakraProvider value={defaultSystem}><App /></ChakraProvider>)
  expect(await screen.findByText(/API momentanément indisponible/)).toBeInTheDocument()
  vi.unstubAllGlobals()
})
