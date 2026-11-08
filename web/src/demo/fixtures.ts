/**
 * Visual-review fixtures. Everything here is illustrative and is rendered with a
 * "演示数据" marker; none of it is a real analysis, price, or account.
 */
import type { TrackModel } from "../components/ResearchTrack";
import type { Rating, RunStatus, TraderAction } from "../lib/labels";

export type DemoRunState = "running" | "completed" | "failed";

export const DEMO_TICKER = "DEMO";

export const demoTrack: Record<DemoRunState, TrackModel> = {
  running: {
    stages: {
      analysts: { state: "running" },
      research: { state: "pending" },
      trader: { state: "pending" },
      risk: { state: "pending" },
      decision: { state: "pending" },
    },
    analysts: [
      { key: "market", state: "done", seconds: 74 },
      { key: "social", state: "running" },
      { key: "news", state: "warn", seconds: 92 },
      { key: "fundamentals", state: "running" },
    ],
  },
  completed: {
    stages: {
      analysts: { state: "done", seconds: 186 },
      research: { state: "done", seconds: 141, detail: "1 轮辩论" },
      trader: { state: "done", seconds: 38 },
      risk: { state: "done", seconds: 166, detail: "1 轮讨论" },
      decision: { state: "done", seconds: 29 },
    },
    analysts: [
      { key: "market", state: "done", seconds: 74 },
      { key: "social", state: "done", seconds: 121 },
      { key: "news", state: "warn", seconds: 92 },
      { key: "fundamentals", state: "done", seconds: 186 },
    ],
  },
  failed: {
    stages: {
      analysts: { state: "done", seconds: 190 },
      research: { state: "done", seconds: 133, detail: "1 轮辩论" },
      trader: { state: "failed", detail: "模型调用失败" },
      risk: { state: "pending" },
      decision: { state: "pending" },
    },
    analysts: [
      { key: "market", state: "done", seconds: 70 },
      { key: "social", state: "skipped" },
      { key: "news", state: "done", seconds: 88 },
      { key: "fundamentals", state: "done", seconds: 190 },
    ],
  },
};

export const demoDecision: {
  rating: Rating;
  trader: TraderAction;
  summary: string;
  thesis: string;
  priceTarget: number | null;
  timeHorizon: string | null;
  entry: number | null;
  stop: number | null;
  sizing: string | null;
  traderReasoning: string;
} = {
  rating: "Underweight",
  trader: "Hold",
  summary:
    "（演示文本）维持现有仓位但不再加仓，若跌破关键支撑位则分批降低敞口；关注下季度指引与毛利率变化。",
  thesis:
    "（演示文本）多方论证集中在营收增速和新产品周期，但空方指出估值已经反映了大部分乐观预期，同时库存天数上升、管理层对下一季度的指引偏谨慎。风险讨论中，保守派强调在指引不确定时应降低敞口，中立派认为当前没有足够证据支持离场。综合判断：相对基准略为减配。",
  priceTarget: null,
  timeHorizon: "3–6 个月",
  entry: null,
  stop: 118.5,
  sizing: "不超过标准仓位的 60%",
  traderReasoning:
    "（演示文本）研究经理的方案倾向于谨慎，但技术面尚未出现明确的破位信号，因此本轮维持持有，并设定止损以控制下行风险。",
};

export const demoReports: Record<string, { status: "ready" | "running" | "skipped" | "failed" | "nodata"; text?: string; note?: string }> = {
  market: {
    status: "ready",
    text: `## 技术面概览（演示）

- **趋势**：50 日均线仍在 200 日均线上方，但斜率趋缓。
- **动量**：RSI 在 48–55 区间震荡，没有超买或超卖信号。
- **成交量**：最近 10 个交易日成交量低于 20 日均值。

| 指标 | 读数 | 解读 |
|---|---|---|
| RSI(14) | 51.2 | 中性 |
| MACD | 接近零轴 | 动能减弱 |
| ATR(14) | 3.4 | 波动处于中位 |

> 以上数值仅用于展示排版，不是任何真实证券的数据。`,
  },
  social: { status: "running", note: "情绪分析师仍在运行，报告生成后会显示在这里。" },
  news: {
    status: "ready",
    text: `## 新闻摘要（演示）

本节展示一份有部分数据缺失的报告。全球新闻来源返回了结果，但公司新闻的主数据源暂时不可用，已切换到备用来源。

1. 行业监管讨论升温，暂无落地政策。
2. 公司发布了产品更新，市场反应平淡。`,
    note: "Alpha Vantage 返回限流，公司新闻已改由 yfinance 提供。",
  },
  fundamentals: { status: "nodata", note: "所选日期没有可用的财报数据（数据源报告 NO_DATA_AVAILABLE）。这不代表利空，也不代表数值为 0。" },
};

export const demoDebate = {
  bull: "（演示）多方研究员：营收连续三个季度加速，新产品线毛利率高于公司平均水平……",
  bear: "（演示）空方研究员：估值已处于历史区间上沿，库存天数上升说明需求可能放缓……",
  manager: `**Recommendation**: Hold

**Rationale**: （演示）双方论据都有支撑，空方关于库存的论证更具体……

**Strategic Actions**: （演示）维持仓位，设置止损，等待下季度指引。`,
  risk: [
    { role: "激进派", text: "（演示）当前回调是加仓机会……" },
    { role: "保守派", text: "（演示）指引不确定，应降低敞口……" },
    { role: "中立派", text: "（演示）证据不足以支持离场，也不支持加仓……" },
  ],
};

export type DemoEvent = {
  t: string;
  sev: "info" | "ok" | "warning" | "error";
  agent: string;
  type: string;
  text: string;
  dur?: string;
};

export const demoEvents: DemoEvent[] = [
  { t: "20:14:02", sev: "info", agent: "系统", type: "run.started", text: "开始分析 DEMO · 2026-11-06（演示）" },
  { t: "20:14:02", sev: "info", agent: "记忆", type: "stage.started", text: "读取历史决策并结算已到期的条目" },
  { t: "20:14:03", sev: "info", agent: "技术", type: "tool.started", text: "get_stock_data(symbol=DEMO, start=2026-08-01, end=2026-11-06)" },
  { t: "20:14:05", sev: "ok", agent: "技术", type: "tool.completed", text: "get_stock_data · yfinance", dur: "1.8s" },
  { t: "20:14:06", sev: "info", agent: "新闻", type: "tool.started", text: "get_news(ticker=DEMO, curr_date=2026-11-06)" },
  { t: "20:14:09", sev: "warning", agent: "新闻", type: "tool.failed", text: "alpha_vantage 返回限流（429），改用下一个已配置来源 yfinance", dur: "2.6s" },
  { t: "20:14:11", sev: "ok", agent: "新闻", type: "tool.completed", text: "get_news · yfinance（接替来源）", dur: "1.4s" },
  { t: "20:14:12", sev: "info", agent: "基本面", type: "tool.started", text: "get_balance_sheet(ticker=DEMO, freq=quarterly)" },
  { t: "20:14:14", sev: "warning", agent: "基本面", type: "tool.completed", text: "sec_edgar 返回 NO_DATA_AVAILABLE：所选日期之前没有可用申报", dur: "2.1s" },
  { t: "20:15:16", sev: "ok", agent: "技术", type: "agent.completed", text: "技术分析报告已生成" },
  { t: "20:15:40", sev: "info", agent: "情绪", type: "message", text: "正在汇总 StockTwits 与 Reddit 讨论……" },
];

export const demoRuns: {
  id: string;
  ticker: string;
  date: string;
  started: string;
  status: RunStatus;
  rating: Rating | null;
  model: string;
  portfolio: string;
  legacy?: boolean;
}[] = [
  { id: "demo-running", ticker: "DEMO", date: "2026-11-06", started: "11-08 20:14", status: "running", rating: null, model: "gpt-5.4-mini / gpt-5.4", portfolio: "主账户 v3" },
  { id: "demo-completed", ticker: "DEMO", date: "2026-11-06", started: "11-08 19:02", status: "completed_with_warnings", rating: "Underweight", model: "gpt-5.4-mini / gpt-5.4", portfolio: "主账户 v3" },
  { id: "demo-review", ticker: "SAMPLE.HK", date: "2026-11-05", started: "11-07 10:40", status: "completed", rating: "REVIEW", model: "deepseek-chat / deepseek-reasoner", portfolio: "未提供" },
  { id: "demo-failed", ticker: "TEST-USD", date: "2026-11-05", started: "11-07 09:15", status: "failed", rating: null, model: "claude-sonnet / claude-opus", portfolio: "明确空仓" },
  { id: "demo-legacy", ticker: "OLD", date: "2026-03-14", started: "—", status: "completed", rating: "Hold", model: "未记录", portfolio: "未记录", legacy: true },
];

export const demoPortfolio = {
  name: "主账户",
  version: 3,
  asOf: "2026-11-01",
  cash: 25000 as number | null,
  currency: "USD",
  positions: [
    { ticker: "DEMO", quantity: 120, avg: 131.4 as number | null, note: "USD" },
    { ticker: "SAMPLE.HK", quantity: 800, avg: 312.6 as number | null, note: "HKD（不与 USD 合并）" },
    { ticker: "SHORT", quantity: -50, avg: 42.1 as number | null, note: "空头" },
    { ticker: "GIFT", quantity: 10, avg: null, note: "成本未提供" },
  ],
};

export const demoBacktest = {
  tickers: ["DEMO", "SAMPLE.HK"],
  dates: ["10-01", "10-08", "10-15", "10-22", "10-29", "11-05"],
  cells: {
    DEMO: ["completed", "completed", "completed", "failed", "running", "pending"],
    "SAMPLE.HK": ["completed", "completed", "skipped", "completed", "pending", "pending"],
  } as Record<string, string[]>,
  stats: [
    { rating: "Buy", count: 2, hit: 0.5, alpha: 0.012 },
    { rating: "Overweight", count: 1, hit: 1, alpha: 0.031 },
    { rating: "Hold", count: 3, hit: null, alpha: -0.004 },
    { rating: "Underweight", count: 0, hit: null, alpha: null },
    { rating: "Sell", count: 1, hit: 0, alpha: -0.018 },
  ] as { rating: Rating; count: number; hit: number | null; alpha: number | null }[],
};

export const demoMemory = [
  { ticker: "DEMO", date: "2026-10-01", rating: "Overweight" as Rating, status: "resolved", raw: 0.042, alpha: 0.018, holding: 5, resolved: "2026-10-08" },
  { ticker: "SAMPLE.HK", date: "2026-10-15", rating: "Hold" as Rating, status: "resolved", raw: -0.011, alpha: 0.003, holding: 5, resolved: "2026-10-22" },
  { ticker: "DEMO", date: "2026-11-05", rating: "Underweight" as Rating, status: "pending", raw: null, alpha: null, holding: null, resolved: null },
  { ticker: "TEST-USD", date: "2026-11-04", rating: "REVIEW" as Rating, status: "pending", raw: null, alpha: null, holding: null, resolved: null },
];
