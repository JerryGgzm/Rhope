import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Drawer({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      returnFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <>
      <div className="drawer-scrim" onClick={onClose} aria-hidden />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} ref={panelRef} tabIndex={-1}>
        <div className="drawer-head">
          {icon}
          <h3>{title}</h3>
          <button className="btn btn-ghost icon-btn" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-head" style={{ borderTop: "1px solid var(--border)", borderBottom: 0 }}>{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
