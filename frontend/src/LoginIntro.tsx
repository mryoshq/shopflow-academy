import { useLayoutEffect, useRef, useState, type RefObject } from "react"
import { Box } from "@chakra-ui/react"
import { Logo } from "./Logo"

/** Once per browser session (sessionStorage), never with reduced motion. */
const KEY = "rapidfox:intro-shown"
export const INTRO_MS = 700
const EASING = "cubic-bezier(0.2, 0, 0, 1)"

function reducedMotion(): boolean {
  try {
    if (document.documentElement.classList.contains("reduce-motion")) return true
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch { return false }
}

let decided: boolean | null = null
/** Set once the opening has run (or been interrupted): a later login page of the same load stays still. */
let consumed = false

/** True when the opening should play on this page load; marks it as shown for the rest of the session. */
export function claimIntro(): boolean {
  if (consumed) return false
  if (decided !== null) return decided
  decided = false
  if (reducedMotion() || typeof Element === "undefined" || typeof Element.prototype.animate !== "function") return decided
  try {
    if (window.sessionStorage.getItem(KEY)) return decided
    window.sessionStorage.setItem(KEY, "1")
    decided = true
  } catch { /* storage blocked: no opening */ }
  return decided
}

/** For tests only. */
export function resetIntro() { decided = null; consumed = false }

/**
 * Opening of the login page: the Rapidfox logo appears large in the centre, then shrinks and slides to its
 * place in the login card (about 700 ms, transform and opacity only). Decorative and inert: the form is
 * usable from the first instant and keyboard focus is never blocked (no overlay catches pointer or focus).
 */
export function LoginIntro({ target, size }: { target: RefObject<HTMLElement | null>; size: number }) {
  const [play] = useState(claimIntro)
  const [done, setDone] = useState(!play)
  const ghost = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = ghost.current
    const place = target.current
    if (!play || !element || !place) { setDone(true); return }
    const box = place.getBoundingClientRect()
    // The ghost sits exactly on the card logo; the start frame moves it to the centre, three times larger.
    Object.assign(element.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` })
    const scale = Math.min(3, (Math.min(window.innerWidth, window.innerHeight) * 0.4) / Math.max(1, box.width))
    const dx = window.innerWidth / 2 - (box.left + box.width / 2)
    const dy = window.innerHeight / 2 - (box.top + box.height / 2)
    const start = `translate(${dx}px, ${dy}px) scale(${scale})`
    place.style.opacity = "0"
    // 0-30 %: the large logo fades in at the centre; 30-100 %: it shrinks and slides to the card (the curve).
    const animation = element.animate([
      { transform: start, opacity: 0, easing: "linear" },
      { transform: start, opacity: 1, offset: 0.3, easing: EASING },
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
    ], { duration: INTRO_MS, easing: "linear", fill: "forwards" })
    const finish = () => { consumed = true; place.style.opacity = ""; setDone(true) }
    animation.onfinish = finish
    return () => {
      consumed = true
      animation.onfinish = null
      animation.cancel()
      place.style.opacity = ""
    }
  }, [play, target])

  if (done) return null
  return <Box ref={ghost} className="login-intro" position="fixed" zIndex="overlay" pointerEvents="none" aria-hidden="true"
    css={{ transformOrigin: "center", willChange: "transform, opacity" }}>
    <Logo size={size} />
  </Box>
}
