import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { system } from "../theme"
import { isExperience, parseRoute } from "../useHashRoute"
import { parseRoute as teacherRoute } from "../teacher/routes"
import { DataView } from "../student/activities"
import { stepFrom } from "./index"
import CampusEquipPage from "./CampusEquipPage"

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.documentElement.classList.remove("reduce-motion") })

it("reads #/campusequip and #/campusequip/<step> (1 to 7), for students and teachers; both experiences are full width", () => {
  expect(stepFrom("#/campusequip")).toBe(1)
  expect(stepFrom("#/campusequip/7")).toBe(7)
  expect(stepFrom("#/campusequip/8")).toBeNull()
  expect(parseRoute("#/campusequip/3")).toEqual({ name: "campusequip", step: 3 })
  expect(teacherRoute("#/campusequip/5")).toEqual({ view: "campusequip", sub: "5", params: {} })
  expect(isExperience("#/campusequip/2") && isExperience("#/voyage") && !isExperience("#/projet")).toBe(true)
})

it("opens the step of the address, reports the step reached, and serves its files from /experiences/campusequip/", async () => {
  const onStep = vi.fn()
  render(<ChakraProvider value={system}><CampusEquipPage step={3} onStep={onStep} /></ChakraProvider>)
  const steps = await screen.findByRole("navigation", { name: "Étapes du voyage" })
  await waitFor(() => expect(within(steps).getAllByRole("button").find((b) => b.getAttribute("aria-current"))).toHaveTextContent("La qualité"))
  expect(onStep).not.toHaveBeenCalled()
  fireEvent.click(within(steps).getByRole("button", { name: /Les indicateurs/ }))
  await waitFor(() => expect(onStep).toHaveBeenLastCalledWith(5))
  expect(document.querySelector(".campusequip-root .app")).not.toBeNull()
  // Every file link goes through the experience's static folder (never a relative address under the hash router).
  const source = readFileSync(resolve(process.cwd(), "src/campusequip/CampusEquipApp.tsx"), "utf8")
  expect(source).not.toMatch(/href=["`{]+(data|documents)\//)
  expect(source.match(/FILES\+?["`]?\$?\{?/g)?.length).toBeGreaterThanOrEqual(3)
})

it("« Réduire les animations » starts the experience without animation", async () => {
  document.documentElement.classList.add("reduce-motion")
  render(<ChakraProvider value={system}><CampusEquipPage /></ChakraProvider>)
  await screen.findByRole("navigation", { name: "Étapes du voyage" })
  expect(document.querySelector(".campusequip-root .app.reduced")).not.toBeNull()
})

it("a lesson card opens CampusEquip at its step", () => {
  render(<ChakraProvider value={system}><DataView data={{ kind: "experience", experience: "campusequip", scene: 4 }} /></ChakraProvider>)
  expect(screen.getByRole("link", { name: "Ouvrir l’expérience" })).toHaveAttribute("href", "#/campusequip/4")
  expect(screen.getByText(/à partir de l’étape 4/)).toBeInTheDocument()
  expect(screen.getByText("Le voyage d’une location")).toBeInTheDocument()
})
