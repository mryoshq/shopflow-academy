import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { setLanguage } from "../i18n"
import { ActivityTime, activityDateTime, activityRelative } from "./ActivityTime"
afterEach(() => { cleanup(); setLanguage("fr"); vi.unstubAllEnvs() })
// Historical fixtures keep the timezone contract independent of future rule updates in ICU/tzdata.
it("shows the calendar day in Casablanca across midnight, whatever the machine timezone", () => {
  setLanguage("fr")
  expect(activityDateTime("2024-07-01T23:30:00Z")).toBe("2 juil. 2024, 00:30")
  expect(activityDateTime("2024-07-01T22:30:00Z")).toBe("1 juil. 2024, 23:30")
  render(<ActivityTime value="2024-07-01T23:30:00Z" now={Date.parse("2024-07-02T23:30:00Z")} />)
  expect(screen.getByText(/il y a 1 jour · 2 juil. 2024, 00:30/)).toHaveAttribute("datetime", "2024-07-01T23:30:00.000Z")
})
it("handles missing, invalid and future activity safely", () => {
  expect(activityDateTime(null)).toBe("Aucune activité")
  expect(activityRelative("invalid")).toBe("Aucune activité")
  expect(activityRelative("2024-07-02T00:00:00Z", Date.parse("2024-07-01T00:00:00Z"))).not.toMatch(/NaN|demain/)
})
it("formats English without changing the teaching timezone", () => {
  setLanguage("en")
  expect(activityDateTime("2024-07-01T23:30:00Z")).toBe("2 Jul 2024, 00:30")
  expect(activityRelative("2024-07-01T23:30:00Z", Date.parse("2024-07-02T23:30:00Z"))).toBe("1 day ago")
})

it("respects Casablanca’s historical zero offset during Ramadan", () => {
  setLanguage("fr")
  expect(activityDateTime("2024-03-15T23:30:00Z")).toBe("15 mars 2024, 23:30")
})
it("keeps the Casablanca calendar day when the browser timezone differs", () => {
  vi.stubEnv("TZ", "America/Los_Angeles")
  expect(new Intl.DateTimeFormat("fr-FR").resolvedOptions().timeZone).toBe("America/Los_Angeles")
  expect(activityDateTime("2024-07-01T23:30:00Z")).toBe("2 juil. 2024, 00:30")
})
it("updates an already mounted time when the interface language changes", () => {
  render(<ActivityTime value="2024-07-01T23:30:00Z" relative={false} />)
  expect(screen.getByText("2 juil. 2024, 00:30")).toBeInTheDocument()
  act(() => setLanguage("en"))
  expect(screen.getByText("2 Jul 2024, 00:30")).toHaveAttribute("datetime", "2024-07-01T23:30:00.000Z")
})
