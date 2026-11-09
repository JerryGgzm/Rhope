import { getLang, locale, t } from "./i18n";

/** A label table read in the current interface language each time it is read. */
function bilingual<K extends string>(entries: Record<K, readonly [string, string]>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(entries) as K[]) {
    const [zh, en] = entries[key];
    Object.defineProperty(out, key, { enumerable: true, get: () => t(zh, en) });
  }
  return out;
}

export type AnalystKey = "market" | "social" | "news" | "fundamentals";

const ANALYST_TEXT: Record<AnalystKey, readonly [string, string, string, string]> = {
  market: ["技术", "Technical", "价格、成交量与技术指标", "Price, volume and indicators"],
  social: ["情绪", "Sentiment", "社交讨论与市场情绪", "Social discussion and market mood"],
  news: ["新闻", "News", "公司与宏观新闻", "Company and macro news"],
  fundamentals: ["基本面", "Fundamentals", "财报与估值数据", "Financials and valuation"],
};

export const ANALYSTS: { key: AnalystKey; readonly label: string; readonly desc: string }[] = (
  Object.keys(ANALYST_TEXT) as AnalystKey[]
).map((key) => ({
  key,
  get label() {
    const [zh, en] = ANALYST_TEXT[key];
    return t(zh, en);
  },
  get desc() {
    const [, , zh, en] = ANALYST_TEXT[key];
    return t(zh, en);
  },
}));

export const analystLabel = (key: string) => ANALYSTS.find((a) => a.key === key)?.label ?? key;

export type Rating = "Buy" | "Overweight" | "Hold" | "Underweight" | "Sell" | "REVIEW";
export type TraderAction = "Buy" | "Hold" | "Sell";

export const RATING_LABEL: Record<Rating, string> = bilingual({
  Buy: ["买入", "Buy"],
  Overweight: ["增持", "Overweight"],
  Hold: ["持有", "Hold"],
  Underweight: ["减仓", "Underweight"],
  Sell: ["卖出", "Sell"],
  REVIEW: ["需复核", "Review"],
});

export const TRADER_ACTION_LABEL: Record<TraderAction, string> = bilingual({
  Buy: ["买入", "Buy"],
  Hold: ["持有", "Hold"],
  Sell: ["卖出", "Sell"],
});

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

const STATUS_TEXT = bilingual<RunStatus>({
  queued: ["排队中", "Queued"],
  running: ["运行中", "Running"],
  cancelling: ["正在停止", "Stopping"],
  cancelled: ["已取消", "Cancelled"],
  completed: ["已完成", "Completed"],
  completed_with_warnings: ["完成 · 有警告", "Completed · warnings"],
  failed: ["失败", "Failed"],
  interrupted: ["已中断", "Interrupted"],
});

const STATUS_TONE: Record<RunStatus, DotTone> = {
  queued: "hollow",
  running: "active",
  cancelling: "active",
  cancelled: "muted",
  completed: "ok",
  completed_with_warnings: "caution",
  failed: "danger",
  interrupted: "caution",
};

export const RUN_STATUS: Record<RunStatus, { readonly label: string; tone: DotTone }> = Object.fromEntries(
  (Object.keys(STATUS_TONE) as RunStatus[]).map((s) => [
    s,
    {
      tone: STATUS_TONE[s],
      get label() {
        return STATUS_TEXT[s];
      },
    },
  ]),
) as Record<RunStatus, { readonly label: string; tone: DotTone }>;

export const ASSET_TYPE_LABEL: Record<string, string> = bilingual({
  stock: ["股票", "Stock"],
  crypto: ["加密资产", "Crypto"],
});

const STAGE_TEXT = {
  analysts: ["分析师", "Analysts"],
  research: ["多空研究", "Bull vs bear"],
  trader: ["交易方案", "Trade plan"],
  risk: ["风险讨论", "Risk debate"],
  decision: ["最终决策", "Final decision"],
} as const;

export type StageKey = keyof typeof STAGE_TEXT;

export const STAGES: { key: StageKey; readonly label: string }[] = (Object.keys(STAGE_TEXT) as StageKey[]).map(
  (key) => ({
    key,
    get label() {
      const [zh, en] = STAGE_TEXT[key];
      return t(zh, en);
    },
  }),
);

export type StepState = "pending" | "running" | "done" | "failed" | "warn" | "skipped";

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const en = getLang() === "en";
  if (seconds < 1) return en ? "<1s" : "<1秒";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return en ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}时${String(m).padStart(2, "0")}分`;
  if (m) return en ? `${m}m ${String(r).padStart(2, "0")}s` : `${m}分${String(r).padStart(2, "0")}秒`;
  return en ? `${r}s` : `${r}秒`;
}

export const SECTION_LABEL: Record<string, string> = bilingual({
  market_report: ["技术分析", "Technical analysis"],
  sentiment_report: ["情绪分析", "Sentiment analysis"],
  news_report: ["新闻分析", "News analysis"],
  fundamentals_report: ["基本面分析", "Fundamentals analysis"],
  bull_history: ["多方论证", "Bull case"],
  bear_history: ["空方论证", "Bear case"],
  investment_plan: ["研究经理方案", "Research manager's plan"],
  trader_investment_plan: ["交易员方案", "Trader's plan"],
  aggressive_history: ["激进风控", "Aggressive risk view"],
  conservative_history: ["保守风控", "Conservative risk view"],
  neutral_history: ["中性风控", "Neutral risk view"],
  final_trade_decision: ["最终决策", "Final decision"],
});

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
  return d.toLocaleTimeString(locale(), { hour12: false });
}

export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatNumber(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString(locale(), { maximumFractionDigits: digits });
}

export function formatPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(digits)}%`;
}
