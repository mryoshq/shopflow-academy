import { afterEach, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { setLanguage } from "../i18n"
import { ActivityTime, activityDateTime, activityRelative } from "./ActivityTime"
afterEach(() => { cleanup(); setLanguage("fr") })
it("shows the calendar day in Casablanca across midnight, whatever the machine timezone", () => {
  setLanguage("fr")
  expect(activityDateTime("2026-11-01T23:30:00Z")).toBe("2 nov. 2026, 00:30")
  expect(activityDateTime("2026-11-01T22:30:00Z")).toBe("1 nov. 2026, 23:30")
  render(<ActivityTime value="2026-11-01T23:30:00Z" now={Date.parse("2026-11-02T23:30:00Z")} />)
  expect(screen.getByText(/il y a 1 jour · 2 nov. 2026, 00:30/)).toHaveAttribute("datetime", "2026-11-01T23:30:00.000Z")
})
it("handles missing, invalid and future activity safely", () => {
  expect(activityDateTime(null)).toBe("Aucune activité")
  expect(activityRelative("invalid")).toBe("Aucune activité")
  expect(activityRelative("2026-11-02T00:00:00Z", Date.parse("2026-11-01T00:00:00Z"))).not.toMatch(/NaN|demain/)
})
it("formats English without changing the teaching timezone", () => {
  setLanguage("en")
  expect(activityDateTime("2026-11-01T23:30:00Z")).toBe("2 Nov 2026, 00:30")
  expect(activityRelative("2026-11-01T23:30:00Z", Date.parse("2026-11-02T23:30:00Z"))).toBe("1 day ago")
})
