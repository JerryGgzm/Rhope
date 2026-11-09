import { AlertCircle, AlertTriangle, ArrowDownRight, ArrowUpRight, Check, Info, Loader2, Minus, CircleHelp } from "lucide-react";
import { forwardRef, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useSlidingIndicator } from "../lib/motion";
import {
  RATING_LABEL,
  RUN_STATUS,
  TRADER_ACTION_LABEL,
  ratingTone,
  type Rating,
  type RunStatus,
  type TraderAction,
} from "../lib/labels";
import { t } from "../lib/i18n";

/* ---------- Button ---------- */

type BtnVariant = "solid" | "outline" | "ghost" | "danger";
type BtnSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "outline", size = "md", loading, icon, block, className = "", children, ...rest },
  ref,
) {
  const cls = [
    "btn",
    variant === "solid" && "btn-solid",
    variant === "ghost" && "btn-ghost",
    variant === "danger" && "btn-danger",
    size === "sm" && "btn-sm",
    size === "lg" && "btn-lg",
    block && "btn-block",
    !children && "btn-icon",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      ref={ref}
      type="button"
      className={cls}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      <span className="btn-label row" style={{ gap: 6, flexWrap: "nowrap" }}>
        {icon}
        {children}
      </span>
      {loading && (
        <span className="btn-spinner" aria-hidden>
          <Loader2 size={16} className="spin" />
        </span>
      )}
    </button>
  );
});

/* ---------- Status ---------- */

export function Status({ status }: { status: RunStatus }) {
  const s = RUN_STATUS[status];
  return (
    <span className="status">
      <span className="dot" data-tone={s.tone} aria-hidden />
      {s.label}
    </span>
  );
}

/* ---------- Ratings (monochrome: word + shape, never color alone) ---------- */

function RatingGlyph({ r, size }: { r: Rating | TraderAction; size: number }) {
  const tone = ratingTone(r);
  if (tone === "pos") return <ArrowUpRight size={size} aria-hidden />;
  if (tone === "neg") return <ArrowDownRight size={size} aria-hidden />;
  if (tone === "review") return <CircleHelp size={size} aria-hidden />;
  return <Minus size={size} aria-hidden />;
}

export function RatingInline({ rating }: { rating: Rating | null | undefined }) {
  if (!rating) return <span className="t3">—</span>;
  return (
    <span className="rating-inline" data-review={rating === "REVIEW"}>
      <RatingGlyph r={rating} size={14} />
      {RATING_LABEL[rating]}
      <span className="en">{rating}</span>
    </span>
  );
}

export function ActionInline({ action }: { action: TraderAction }) {
  return (
    <span className="rating-inline">
      <RatingGlyph r={action} size={14} />
      {TRADER_ACTION_LABEL[action]}
      <span className="en">{action}</span>
    </span>
  );
}

export function RatingHero({ rating, source }: { rating: Rating; source: string }) {
  return (
    <div className="rating-hero" data-review={rating === "REVIEW"}>
      <span className="glyph">
        <RatingGlyph r={rating} size={22} />
      </span>
      <div className="stack-sm" style={{ gap: 6 }}>
        <span className="word">
          {RATING_LABEL[rating]}
          <span className="en">{rating}</span>
        </span>
        <span className="small t2">{source}</span>
      </div>
    </div>
  );
}

/* ---------- Notice ---------- */

type NoticeKind = "info" | "warn" | "error" | "ok";
const NOTICE_ICON = { info: Info, warn: AlertTriangle, error: AlertCircle, ok: Check };

export function Notice({
  kind = "info",
  title,
  children,
  actions,
}: {
  kind?: NoticeKind;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const Icon = NOTICE_ICON[kind];
  return (
    <div className="notice" data-kind={kind} role={kind === "error" ? "alert" : "status"}>
      <Icon size={16} className="notice-icon" aria-hidden />
      <div className="notice-body">
        {title && <strong>{title}</strong>}
        {title && children ? " " : null}
        {children && <span className={title ? "t2" : undefined}>{children}</span>}
      </div>
      {actions && <div className="notice-actions">{actions}</div>}
    </div>
  );
}

/* ---------- Empty ---------- */

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

/* ---------- Form ---------- */

export function Field({
  label,
  hint,
  error,
  machineKey,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  machineKey?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        <span>{label}</span>
        {machineKey && <span className="field-key">{machineKey}</span>}
      </label>
      {children}
      {error ? (
        <div className="field-error" role="alert">
          <AlertCircle size={13} style={{ marginTop: 2, flex: "none" }} aria-hidden />
          <span>{error}</span>
        </div>
      ) : hint ? (
        <div className="field-hint">{hint}</div>
      ) : null}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rect = useSlidingIndicator(ref, 'button[aria-pressed="true"]', [value, options.length]);
  return (
    <div className="seg" role="group" aria-label={label} ref={ref}>
      {rect && <span className="seg-thumb" style={{ width: rect.w, transform: `translateX(${rect.x}px)` }} aria-hidden />}
      {options.map((o) => (
        <button type="button" key={String(o.value)} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="stack-sm" style={{ gap: 2 }}>
      <div className="toggle-row">
        <span id={id} style={{ opacity: disabled ? 0.45 : 1 }}>
          {label}
        </span>
        <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
      </div>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function Pill({
  checked,
  disabled,
  onToggle,
  children,
  title,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      className="pill"
      aria-checked={checked}
      aria-disabled={disabled}
      title={title}
      onClick={() => !disabled && onToggle()}
    >
      <span className="pill-check" aria-hidden>
        <Check size={13} strokeWidth={2.5} />
      </span>
      {children}
    </button>
  );
}

/* ---------- Data ---------- */

export function Stat({ label, value, hint }: { label: string; value: ReactNode | null; hint?: string }) {
  const empty = value == null || value === "";
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value" data-empty={empty}>
        {empty ? t("本次未提供", "Not provided") : value}
      </span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rect = useSlidingIndicator(ref, '[aria-selected="true"]', [value, tabs.map((x) => x.label).join()]);
  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.key === value);
    if (e.key === "ArrowRight") onChange(tabs[(i + 1) % tabs.length].key);
    if (e.key === "ArrowLeft") onChange(tabs[(i - 1 + tabs.length) % tabs.length].key);
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} ref={ref} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          className="tab"
          aria-selected={t.key === value}
          tabIndex={t.key === value ? 0 : -1}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
      {rect && (
        <span
          className="tab-indicator"
          style={{ width: rect.w - 20, transform: `translateX(${rect.x + 10}px)` }}
          aria-hidden
        />
      )}
    </div>
  );
}

export function DemoMark({ children = t("演示", "Demo") }: { children?: ReactNode }) {
  return <span className="demo-mark">{children}</span>;
}
