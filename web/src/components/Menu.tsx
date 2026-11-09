import { useEffect, useRef, useState, type ReactNode } from "react";
import { useOutsideClick, usePresence } from "../lib/motion";

/**
 * A trigger plus a lightweight popover. Esc and outside clicks close it; arrow
 * keys move between `.menu-item`s; focus returns to the trigger on close.
 */
export function Menu({
  trigger,
  children,
  align = "end",
  width,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.RefObject<HTMLButtonElement> }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const { mounted, state } = usePresence(open, 140);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useOutsideClick([wrapRef], () => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    popRef.current?.querySelector<HTMLElement>(".menu-item")?.focus();
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(popRef.current?.querySelectorAll<HTMLElement>(".menu-item") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }} onKeyDown={onKey}>
      {trigger({ open, toggle: () => setOpen((o) => !o), ref: triggerRef })}
      {mounted && (
        <div
          ref={popRef}
          className="popover"
          role="menu"
          data-state={state}
          style={{
            top: "calc(100% + 6px)",
            [align === "end" ? "right" : "left"]: 0,
            width,
            ["--origin" as string]: align === "end" ? "top right" : "top left",
          }}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
