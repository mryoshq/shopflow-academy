import "@testing-library/jest-dom/vitest"

// Floating menus and dialogs (Ark UI) measure their content; jsdom has no ResizeObserver.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
}

// jsdom has no PointerEvent: menus (Ark UI) read pointerType to highlight the item under the pointer.
if (!("PointerEvent" in globalThis)) {
  class PointerEventPolyfill extends MouseEvent {
    pointerType: string
    pointerId: number
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerType = init.pointerType ?? "mouse"
      this.pointerId = init.pointerId ?? 1
    }
  }
  globalThis.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent
}

// ADR-0038: the outage state is shared by the whole page; each test starts with the platform reachable.
import { afterEach } from "vitest"
import { resetOutage } from "./resilience"
afterEach(() => resetOutage())
