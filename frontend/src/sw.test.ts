import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { expect, it } from "vitest"

// The service worker (public/sw.js) is plain JavaScript run by the browser: load its `cacheable` rule here.
const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8")
const start = source.indexOf("function cacheable(url)")
const body = source.slice(start, source.indexOf("\n}\n", start) + 3)
const cacheable = new Function("self", `${body}; return cacheable`)({ location: { origin: "https://shopflow.rapidfox.io" } }) as (url: URL) => boolean
const at = (path: string, origin = "https://shopflow.rapidfox.io") => cacheable(new URL(path, origin))

it("the service worker never caches the API, media or health checks, nor another origin (ADR-0024, ADR-0038)", () => {
  expect(at("/api/v1/auth/me")).toBe(false)
  expect(at("/media/0123456789abcdef.png")).toBe(false)
  expect(at("/health/live")).toBe(false)
  expect(at("/health/ready")).toBe(false)
  expect(at("/assets/index-abc.js", "https://cdn.example.org")).toBe(false)
  expect(at("/")).toBe(true)
  expect(at("/assets/index-abc.js")).toBe(true)
  expect(at("/offline.html")).toBe(true)
})
