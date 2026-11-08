import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Info,
  Minus,
  TrendingDown,
  TrendingUp,
  HelpCircle,
} from "lucide-react";
import { useId, type ReactNode } from "react";
import {
  RATING_LABEL,
  RUN_STATUS,
  TRADER_ACTION_LABEL,
  ratingTone,
  type Rating,
  type RunStatus,
  type TraderAction,
} from "../lib/labels";

export function StatusBadge({ status }: { status: RunStatus }) {
  const s = RUN_STATUS[status];
  return (
    <span className={`badge ${s.badge}`}>
      <span className={`status-dot${s.live ? " live" : ""}`} aria-hidden />
      {s.label}
    </span>
  );
}

const TONE_ICON = {
  pos: TrendingUp,
  neg: TrendingDown,
  neutral: Minus,
  review: HelpCircle,
};

export function RatingBlock({ rating, source }: { rating: Rating; source: string }) {
  const tone = ratingTone(rating);
  const Icon = TONE_ICON[tone];
  return (
    <div className="rating" data-tone={tone}>
      <span className="rating-icon" aria-hidden>
        <Icon size={18} />
      </span>
      <span className="rating-text">
        <strong>
          {RATING_LABEL[rating]} <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>· {rating}</span>
        </strong>
        <span>{source}</span>
      </span>
    </div>
  );
}

export function RatingBadge({ rating }: { rating: Rating | null | undefined }) {
  if (!rating) return <span className="faint">—</span>;
  const tone = ratingTone(rating);
  const cls = { pos: "badge-pos", neg: "badge-neg", neutral: "badge-blue", review: "badge-warn" }[tone];
  const Icon = TONE_ICON[tone];
  return (
    <span className={`badge ${cls}`}>
      <Icon size={12} aria-hidden />
      {RATING_LABEL[rating]} · {rating}
    </span>
  );
}

export function ActionBadge({ action }: { action: TraderAction }) {
  const tone = ratingTone(action);
  const cls = { pos: "badge-pos", neg: "badge-neg", neutral: "badge-blue", review: "badge-warn" }[tone];
  return (
    <span className={`badge ${cls}`}>
      {TRADER_ACTION_LABEL[action]} · {action}
    </span>
  );
}

type BannerKind = "info" | "warn" | "error" | "ok";
const BANNER_ICON = { info: Info, warn: AlertTriangle, error: AlertCircle, ok: CheckCircle2 };

export function Banner({
  kind,
  title,
  children,
  actions,
}: {
  kind: BannerKind;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const Icon = BANNER_ICON[kind];
  return (
    <div className={`banner banner-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon size={17} aria-hidden />
      <div className="banner-body">
        {title && <strong>{title}</strong>}
        {title && children ? " " : null}
        {children}
      </div>
      {actions && <div className="banner-actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>
        {icon}
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

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
        {machineKey && <span className="key">{machineKey}</span>}
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
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
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
    <div className="stack-sm" style={{ gap: 4 }}>
      <div className="toggle-row">
        <span id={id}>{label}</span>
        <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
      </div>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function ChoiceChip({
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
      className="chip"
      aria-checked={checked}
      aria-disabled={disabled}
      title={title}
      onClick={() => !disabled && onToggle()}
    >
      <span className="check" aria-hidden>
        {checked && <Check size={11} strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}

export function Metric({ label, value, hint }: { label: string; value: ReactNode | null; hint?: string }) {
  const empty = value == null || value === "";
  return (
    <div className="metric">
      <span className="label">{label}</span>
      <span className={`value${empty ? " is-empty" : ""}`}>{empty ? "本次未提供" : value}</span>
      {hint && <span className="aux">{hint}</span>}
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
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          className="tab"
          aria-selected={t.key === value}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
