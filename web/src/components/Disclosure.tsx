import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function Disclosure({
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const inner = useRef<HTMLDivElement>(null);

  // Collapsed content stays in the DOM for the height animation; keep it out of
  // the tab order and the accessibility tree.
  useEffect(() => {
    inner.current?.toggleAttribute("inert", !open);
  }, [open]);

  return (
    <div className="disclosure" data-open={open}>
      <button className="disclosure-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        {meta}
        <ChevronDown size={18} className="chev" aria-hidden />
      </button>
      <div className="disclosure-panel" id={id} role="region">
        <div className="disclosure-inner" ref={inner}>
          <div className="disclosure-content">{children}</div>
        </div>
      </div>
    </div>
  );
}
