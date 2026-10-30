import { expect, it } from "vitest"
import { backoff, isGatewayFailure } from "./resilience"

const response = (status: number, type: string) => ({ status, headers: { get: () => type } }) as unknown as Response

it("the delay between attempts grows: 1, 2, 4, 8, 16 s, then every 30 s", () => {
  expect([0, 1, 2, 3, 4, 5, 9].map(backoff)).toEqual([1, 2, 4, 8, 16, 30, 30])
})

it("only a gateway page (HTML 502, 503, 504) is an outage; the application's own errors are not", () => {
  expect(isGatewayFailure(response(502, "text/html"))).toBe(true)
  expect(isGatewayFailure(response(503, "text/html; charset=UTF-8"))).toBe(true)
  expect(isGatewayFailure(response(504, "text/html"))).toBe(true)
  expect(isGatewayFailure(response(503, "application/json"))).toBe(false)  // laboratory unavailable (ADR-0032)
  expect(isGatewayFailure(response(504, "application/json"))).toBe(false)  // SQL run timeout
  expect(isGatewayFailure(response(500, "text/html"))).toBe(false)
  expect(isGatewayFailure(response(401, "application/json"))).toBe(false)
})
