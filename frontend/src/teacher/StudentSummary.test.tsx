import { cleanup, render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { afterEach, expect, it } from "vitest"
import { system } from "../theme"
import { StudentSummary } from "./StudentSummary"
afterEach(cleanup)
it("renders server-owned retained points with separate bonus, unfinished and never-attempted states", () => {
  render(<ChakraProvider value={system}><StudentSummary data={{ core_points: 9.5, core_possible: 40, bonus_points: 3, bonus_possible: 4,
    completed: 2, total: 5, remaining: 3, lessons_read: 1, lessons_total: 1, attempted_unfinished: 1, not_started_open: 1, not_started_closed: 1, not_started_locked: 0,
    help_pending_count: 1, help_pending: [{ mission: "Mission fictive", created_at: "2024-07-01T12:00:00Z" }], last_activity: null }} /></ChakraProvider>)
  expect(screen.getByText("9,5 / 40")).toBeInTheDocument()
  expect(screen.getByText("3 / 4")).toBeInTheDocument()
  expect(screen.getByText("Tentées, à reprendre")).toBeInTheDocument()
  expect(screen.getByText("Jamais tentées, blocs fermés")).toBeInTheDocument()
  expect(screen.getByText("Demandes d’aide en attente : 1")).toBeInTheDocument()
  expect(screen.getByText(/Mission fictive/)).toBeInTheDocument()
  expect(screen.getByText("Aucune activité")).toBeInTheDocument()
})
