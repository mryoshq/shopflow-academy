import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import { afterEach, expect, it, vi } from "vitest"
import { App } from "./App"

function show() {
  render(<ChakraProvider value={defaultSystem}><App /></ChakraProvider>)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.cookie = "academy_csrf=; Max-Age=0; Path=/"
})

it("shows a login form without private content to an anonymous visitor", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false }))
  show()
  expect(await screen.findByRole("heading", { name: "Connexion" })).toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "Identifiant" })).toBeInTheDocument()
  expect(screen.queryByText(/Bonjour,/)).not.toBeInTheDocument()
})

it("opens the teacher space after login and logs out with the CSRF header", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ status: 401, ok: false })
    .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ id: 1, username: "demo.enseignant", role: "teacher" }) })
    .mockResolvedValueOnce({ status: 204, ok: true })
  vi.stubGlobal("fetch", fetchMock)
  show()
  fireEvent.change(await screen.findByRole("textbox", { name: "Identifiant" }), { target: { value: "demo.enseignant" } })
  fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "local-secret" } })
  fireEvent.click(screen.getByRole("button", { name: "Se connecter" }))
  expect(await screen.findByRole("heading", { name: "Bonjour, demo.enseignant" })).toBeInTheDocument()
  expect(screen.getByText(/studio de cours arrive/)).toBeInTheDocument()
  document.cookie = `academy_csrf=${"A".repeat(43)}; Path=/`
  fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }))
  expect(await screen.findByRole("heading", { name: "Connexion" })).toBeInTheDocument()
  expect(fetchMock.mock.calls[2][1].headers["X-CSRF-Token"]).toBe("A".repeat(43))
})

it("shows a useful network error during session recovery", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
  show()
  expect(await screen.findByRole("alert")).toHaveTextContent("momentanément indisponible")
})
