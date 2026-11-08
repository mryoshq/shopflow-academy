import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

/**
 * Below this height the stage panels scroll inside the experience (never the page). The Academy pages
 * leave about 430 px on a 375 × 667 phone once the « Vue étudiant » banner and the header are drawn.
 */
const MIN_HEIGHT = 360;

/** Width of the experience and the height left below the host's header: the experience fits without page scroll. */
export function useFrameBox(ref: RefObject<HTMLDivElement | null>) {
  const [box, setBox] = useState({ w: 1200, h: 720, full: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const full = document.fullscreenElement === el;
      const top = r.top + window.scrollY;
      const h = full ? window.innerHeight : Math.max(MIN_HEIGHT, Math.floor(window.innerHeight - top));
      setBox((b) => (Math.abs(b.w - r.width) < 1 && b.h === h && b.full === full ? b : { w: r.width, h, full }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    document.addEventListener("fullscreenchange", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("fullscreenchange", measure);
    };
  }, [ref]);
  return box;
}

export function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** The system setting, or the Academy's « Réduire les animations » (html.reduce-motion). */
export function useAcademyReducedMotion() {
  const system = useMedia("(prefers-reduced-motion: reduce)");
  const [setting, setSetting] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("reduce-motion"));
  useEffect(() => {
    const html = document.documentElement;
    const mo = new MutationObserver(() => setSetting(html.classList.contains("reduce-motion")));
    mo.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return system || setting;
}

/** Size of an element (its own width and height, whatever the host). */
export function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Shared easing of the experience. */
export const EASE = [0.2, 0.7, 0.2, 1] as const;
