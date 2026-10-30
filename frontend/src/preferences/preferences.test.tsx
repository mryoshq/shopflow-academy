import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { AccountMenu } from "./AccountMenu"
import { displayName, initials } from "./account"
import { nextZoom } from "./display"
import { PreferencesProvider } from "./PreferencesProvider"

function setup(onLogout = vi.fn()) {
  render(<ChakraProvider value={system}><PreferencesProvider account={{ username: "youness.achaq@ynov.com", role: "teacher" }}>
    <AccountMenu account={{ username: "youness.achaq@ynov.com", role: "teacher" }} onLogout={onLogout} variant="sidebar" />
  </PreferencesProvider></ChakraProvider>)
  return onLogout
}

afterEach(cleanup)

/** A real pointer highlights the item before the click (Ark UI selects the highlighted item). */
async function pick(name: RegExp | string) {
  const item = await screen.findByRole("menuitem", { name })
  fireEvent.pointerMove(item, { pointerType: "mouse" })
  fireEvent.pointerDown(item, { pointerType: "mouse", button: 0 })
  fireEvent.click(item)
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.style.fontSize = ""
  document.documentElement.className = ""
})

it("derives the name and initials from the login", () => {
  expect(displayName("youness.achaq@ynov.com")).toBe("Youness Achaq")
  expect(initials("youness.achaq@ynov.com")).toBe("YA")
  expect(nextZoom(1, 1)).toBe(1.1)
  expect(nextZoom(1.5, 1)).toBe(1.5)
  expect(nextZoom(0.8, -1)).toBe(0.8)
})

it("Ctrl + plus, minus and 0 change the text size of the whole interface and remember it", () => {
  setup()
  fireEvent.keyDown(window, { key: "=", ctrlKey: true })
  expect(document.documentElement.style.fontSize).toBe("110%")
  expect(localStorage.getItem("shopflow:zoom")).toBe("1.1")
  expect(screen.getByRole("status")).toHaveTextContent("Taille du texte : 110 %")
  fireEvent.keyDown(window, { key: "-", ctrlKey: true })
  fireEvent.keyDown(window, { key: "-", metaKey: true })
  expect(document.documentElement.style.fontSize).toBe("90%")
  fireEvent.keyDown(window, { key: "0", ctrlKey: true })
  expect(document.documentElement.style.fontSize).toBe("")
  // Without Ctrl/⌘ nothing happens (typing in a field).
  fireEvent.keyDown(window, { key: "=" })
  expect(document.documentElement.style.fontSize).toBe("")
})

it("the account menu opens the settings (theme cards, text size, motion) and signs out", async () => {
  const onLogout = setup()
  fireEvent.click(screen.getByRole("button", { name: "Compte et paramètres : Youness Achaq" }))
  for (const name of ["Paramètres", "Raccourcis clavier", "Se déconnecter"]) expect(await screen.findByRole("menuitem", { name: new RegExp(name) })).toBeInTheDocument()
  await pick(/Paramètres/)
  expect(await screen.findByRole("dialog", { name: "Paramètres" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("tab", { name: "Apparence" }))
  // Theme cards are real radio inputs (checked in a browser by the e2e test); here: they are present and labelled.
  await screen.findAllByRole("radio")
  for (const name of [/Clair/, /Sombre/, /Système/]) expect(screen.getByRole("radio", { name })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Agrandir la taille du texte" }))
  expect(document.documentElement.style.fontSize).toBe("110%")
  expect(screen.getByRole("checkbox", { name: "Réduire les animations" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Fermer les paramètres" }))
  fireEvent.click(await screen.findByRole("button", { name: /Compte et paramètres/ }))
  await pick("Se déconnecter")
  expect(onLogout).toHaveBeenCalled()
})

it("Ctrl + comma opens the settings", async () => {
  setup()
  fireEvent.keyDown(window, { key: ",", ctrlKey: true })
  expect(await screen.findByRole("dialog", { name: "Paramètres" })).toBeInTheDocument()
})

it("the tab icon follows the theme chosen in the application, not the system (ADR-0036)", async () => {
  document.head.innerHTML = '<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml"><link rel="icon" href="/icons/icon-32.png">'
  const { applyTheme } = await import("../useColorMode")
  applyTheme("light")
  expect(document.querySelectorAll("link[rel~='icon']")).toHaveLength(1)
  expect(document.getElementById("theme-icon")).toHaveAttribute("href", "/icons/favicon-light.png")
  applyTheme("dark")
  expect(document.getElementById("theme-icon")).toHaveAttribute("href", "/icons/favicon-dark.png")
  expect(document.querySelectorAll("link[rel~='icon']")).toHaveLength(1)
})
