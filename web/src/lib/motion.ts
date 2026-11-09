import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Keep an element mounted long enough to play its exit animation.
 * Returns whether to render and the data-state to put on the element.
 */
export function usePresence(open: boolean, exitMs = 180) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    if (reducedMotion()) {
      setMounted(false);
      return;
    }
    setClosing(true);
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, exitMs);
    return () => window.clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return { mounted, state: closing ? "closing" : "open" } as const;
}

/**
 * Position an indicator element under the active child of a container.
 * The active child is found with `activeSelector`; re-measures on resize.
 */
export function useSlidingIndicator<T extends HTMLElement>(
  containerRef: RefObject<T>,
  activeSelector: string,
  deps: unknown[],
) {
  const [rect, setRect] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const active = el.querySelector<HTMLElement>(activeSelector);
      if (!active) {
        setRect(null);
        return;
      }
      setRect({ x: active.offsetLeft, w: active.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return rect;
}

export function useOutsideClick(refs: RefObject<HTMLElement>[], onOutside: () => void, active: boolean) {
  const cb = useRef(onOutside);
  cb.current = onOutside;
  useEffect(() => {
    if (!active) return;
    const handler = (e: PointerEvent) => {
      if (refs.some((r) => r.current?.contains(e.target as Node))) return;
      cb.current();
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}
