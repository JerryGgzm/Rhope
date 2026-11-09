export type AnalystKey = "market" | "social" | "news" | "fundamentals";

export const ANALYSTS: { key: AnalystKey; label: string; desc: string }[] = [
  { key: "market", label: "技术", desc: "价格、成交量与技术指标" },
  { key: "social", label: "情绪", desc: "社交讨论与市场情绪" },
  { key: "news", label: "新闻", desc: "公司与宏观新闻" },
  { key: "fundamentals", label: "基本面", desc: "财报与估值数据" },
];

export const analystLabel = (key: string) => ANALYSTS.find((a) => a.key === key)?.label ?? key;

export type Rating = "Buy" | "Overweight" | "Hold" | "Underweight" | "Sell" | "REVIEW";
export type TraderAction = "Buy" | "Hold" | "Sell";

export const RATING_LABEL: Record<Rating, string> = {
  Buy: "买入",
  Overweight: "增持",
  Hold: "持有",
  Underweight: "减仓",
  Sell: "卖出",
  REVIEW: "需复核",
};

export const TRADER_ACTION_LABEL: Record<TraderAction, string> = {
  Buy: "买入",
  Hold: "持有",
  Sell: "卖出",
};

export type Tone = "pos" | "neg" | "neutral" | "review";

export function ratingTone(r: Rating | TraderAction): Tone {
  if (r === "Buy" || r === "Overweight") return "pos";
  if (r === "Sell" || r === "Underweight") return "neg";
  if (r === "REVIEW") return "review";
  return "neutral";
}

export type RunStatus =
  | "queued"
  | "running"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "interrupted";

export type DotTone = "active" | "ok" | "muted" | "hollow" | "caution" | "danger";

export const RUN_STATUS: Record<RunStatus, { label: string; tone: DotTone }> = {
  queued: { label: "排队中", tone: "hollow" },
  running: { label: "运行中", tone: "active" },
  cancelling: { label: "正在停止", tone: "active" },
  cancelled: { label: "已取消", tone: "muted" },
  completed: { label: "已完成", tone: "ok" },
  completed_with_warnings: { label: "完成 · 有警告", tone: "caution" },
  failed: { label: "失败", tone: "danger" },
  interrupted: { label: "已中断", tone: "caution" },
};

export const ASSET_TYPE_LABEL: Record<string, string> = {
  stock: "股票",
  crypto: "加密资产",
};

export const STAGES = [
  { key: "analysts", label: "分析师" },
  { key: "research", label: "多空研究" },
  { key: "trader", label: "交易方案" },
  { key: "risk", label: "风险讨论" },
  { key: "decision", label: "最终决策" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

export type StepState = "pending" | "running" | "done" | "failed" | "warn" | "skipped";

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds < 1) return "<1秒";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}时${String(m).padStart(2, "0")}分`;
  if (m) return `${m}分${String(r).padStart(2, "0")}秒`;
  return `${r}秒`;
}

export const SECTION_LABEL: Record<string, string> = {
  market_report: "技术分析",
  sentiment_report: "情绪分析",
  news_report: "新闻分析",
  fundamentals_report: "基本面分析",
  bull_history: "多方论证",
  bear_history: "空方论证",
  investment_plan: "研究经理方案",
  trader_investment_plan: "交易员方案",
  aggressive_history: "激进风控",
  conservative_history: "保守风控",
  neutral_history: "中性风控",
  final_trade_decision: "最终决策",
};

export const REPORT_KEY: Record<AnalystKey, string> = {
  market: "market_report",
  social: "sentiment_report",
  news: "news_report",
  fundamentals: "fundamentals_report",
};

export const stageLabel = (key: string | null | undefined) =>
  STAGES.find((s) => s.key === key)?.label ?? key ?? "";

export function isRating(v: unknown): v is Rating {
  return typeof v === "string" && v in RATING_LABEL;
}

/** Seconds between two ISO timestamps, or until now when the end is missing. */
export function secondsBetween(start?: string | null, end?: string | null): number | null {
  if (!start) return null;
  const a = Date.parse(start);
  const b = end ? Date.parse(end) : Date.now();
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, (b - a) / 1000) : null;
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("zh-CN", { hour12: false });
}

export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatNumber(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("zh-CN", { maximumFractionDigits: digits });
}

export function formatPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(digits)}%`;
}
