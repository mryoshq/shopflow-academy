import { render, screen } from "@testing-library/react"
import { ChakraProvider } from "@chakra-ui/react"
import { expect, it } from "vitest"
import { system } from "../theme"
import { DataView } from "./activities"
import { fileSize } from "./Downloads"

it("lists each file with its title, type, size and an authenticated download link", () => {
  render(<ChakraProvider value={system}><DataView data={{ kind: "download", title: "Documents", files: [
    { id: "0123456789abcdef.pdf", name: "fiche-sql.pdf", title: "Fiche SQL", size: 1_258_291 },
    { id: "fedcba9876543210.csv", name: "commandes.csv", title: "Commandes", size: 340 }] }} /></ChakraProvider>)
  const link = screen.getByRole("link", { name: "Télécharger Fiche SQL (PDF, 1,2 Mo)" })
  expect(link).toHaveAttribute("href", "/api/v1/downloads/0123456789abcdef.pdf")
  expect(link).toHaveAttribute("download", "fiche-sql.pdf")
  expect(screen.getByText("CSV · 340 o · commandes.csv")).toBeInTheDocument()
  expect(fileSize(20 * 1024 * 1024)).toBe("20 Mo")
})

it("an EXPLAIN plan keeps its indentation", async () => {
  const { ResultView } = await import("./RunPanel")
  render(<ChakraProvider value={system}><ResultView label="la requête" result={{ kind: "sql", columns: ["QUERY PLAN"], truncated: false, elapsed_ms: 3,
    rows: [["Index Scan using events_day on events_2026_10"], ["  Buffers: shared hit=3"]] }} /></ChakraProvider>)
  expect(screen.getByLabelText("Plan d’exécution de la requête").textContent).toBe("Index Scan using events_day on events_2026_10\n  Buffers: shared hit=3")
})
