/**
 * Visual-review fixtures. Everything here is illustrative and is rendered with a
 * "演示" marker; none of it is a real analysis, price, or account.
 */
import type { Rating } from "../lib/labels";

export const demoPortfolio = {
  name: ["主账户", "Main account"] as const,
  version: 3,
  asOf: "2026-11-01",
  cash: 25000 as number | null,
  currency: "USD",
  positions: [
    { ticker: "DEMO", quantity: 120, avg: 131.4 as number | null, note: ["USD", "USD"] as const },
    { ticker: "SAMPLE.HK", quantity: 800, avg: 312.6 as number | null, note: ["HKD（不与 USD 合并）", "HKD (not combined with USD)"] as const },
    { ticker: "SHORT", quantity: -50, avg: 42.1 as number | null, note: ["空头", "Short"] as const },
    { ticker: "GIFT", quantity: 10, avg: null, note: ["成本未提供", "No cost given"] as const },
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
