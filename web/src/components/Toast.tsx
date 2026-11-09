import { Check } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Toast = { id: number; text: string; closing?: boolean };

const ToastContext = createContext<(text: string) => void>(() => {});

export const useToast = () => useContext(ToastContext);

/** Short confirmations only; anything the user must act on stays on the page. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((text: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, text }]);
    window.setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, closing: true } : x))), 2200);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="toast" data-state={t.closing ? "closing" : "open"}>
              <Check size={15} aria-hidden />
              {t.text}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
