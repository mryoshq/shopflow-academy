import { act, cleanup, render, screen } from "@testing-library/react"
import { ChakraProvider, Heading } from "@chakra-ui/react"
import { afterEach, expect, it, vi } from "vitest"
import { system } from "../theme"
import { HeroPanel, Overline, Typewriter, UpdatedAt } from "./Hero"

/** ADR-0048: typewriter word, overline, dark dotted panel, « mis à jour à ». */
const wrap = (node: React.ReactNode) => render(<ChakraProvider value={system}>{node}</ChakraProvider>)
/** Advance time in small steps, letting React render and schedule the next timer in between. */
async function wait(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 5) await act(async () => { vi.advanceTimersByTime(5) })
}
afterEach(() => { cleanup(); vi.useRealTimers(); window.localStorage.clear() })

it("types the accent word, erases it, types the next; screen readers read a stable sentence", async () => {
  vi.useFakeTimers()
  wrap(<Heading as="h1">Apprenez <Typewriter words={["la data", "SQL"]} /> en prenant de vraies décisions.</Heading>)
  expect(screen.getByRole("heading", { level: 1, name: "Apprenez la data en prenant de vraies décisions." })).toBeInTheDocument()
  const typed = screen.getByTestId("typewriter")
  expect(typed).toHaveAttribute("aria-hidden", "true")
  expect(typed).toHaveTextContent("la data")
  await wait(2200 + 45 * 3)
  expect(typed.textContent).toBe("la d")
  await wait(45 * 5 + 85 * 3 + 10)
  expect(typed.textContent).toBe("SQL")
  expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName("Apprenez la data en prenant de vraies décisions.")
})

it("« Réduire les animations » keeps the first word, still, without the caret", async () => {
  vi.useFakeTimers()
  window.localStorage.setItem("shopflow:motion", "reduce")
  wrap(<Typewriter words={["la data", "SQL"]} />)
  await wait(3000)
  expect(screen.getByTestId("typewriter").textContent).toBe("la data")
})

it("overline, dark panel with its dot grid, green « mis à jour à »", () => {
  wrap(<HeroPanel as="section" aria-label="En-tête"><Overline color="hero.accent">Tableau de bord</Overline><UpdatedAt at={new Date(2026, 10, 1, 10, 42)} /></HeroPanel>)
  const panel = screen.getByRole("region", { name: "En-tête" })
  expect(panel).toHaveAttribute("data-theme-panel", "hero")
  expect(screen.getByText("Tableau de bord")).toBeInTheDocument()
  expect(screen.getByTestId("updated-at")).toHaveTextContent("Mis à jour à 10:42")
})
