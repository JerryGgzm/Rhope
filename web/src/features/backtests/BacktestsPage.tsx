import { Download, RotateCcw } from "lucide-react";
import { useState } from "react";
import { PageHead } from "../../app/Shell";
import { useToast } from "../../components/Toast";
import { Button, DemoMark, Field, Notice, RatingInline, Status } from "../../components/ui";
import { formatPct } from "../../lib/labels";
import { demoBacktest } from "../../demo/fixtures";
import { t, useLang } from "../../lib/i18n";

const CELL_TEXT: Record<string, readonly [string, string]> = {
  pending: ["待运行", "Pending"],
  running: ["运行中", "Running"],
  completed: ["完成", "Done"],
  failed: ["失败", "Failed"],
  skipped: ["已跳过", "Skipped"],
};

export function BacktestsPage() {
  useLang();
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  return (
    <>
      <PageHead
        title={t("回测", "Backtests")}
        sub={t(
          "按代码 × 日期网格复用分析引擎；不是成交模拟，不计算净值、回撤或 Sharpe。",
          "Runs the analysis over a symbol × date grid; not a fill simulation, no NAV, drawdown or Sharpe.",
        )}
      />

      <div className="split">
        <aside className="split-aside stack-lg" aria-label={t("回测参数", "Backtest parameters")}>
          <Field label={t("代码", "Symbols")} hint={t("每行一个，或用逗号分隔。", "One per line, or comma-separated.")}>
            <textarea className="textarea mono" defaultValue={"DEMO\nSAMPLE.HK"} />
          </Field>
          <div className="cols-2" style={{ gap: 12 }}>
            <Field label={t("开始", "Start")}>
              <input type="date" className="input" defaultValue="2026-10-01" />
            </Field>
            <Field label={t("结束", "End")}>
              <input type="date" className="input" defaultValue="2026-11-08" />
            </Field>
          </div>
          <Field label={t("间隔", "Every")} machineKey="every" hint={t("日历日，不是交易日。", "Calendar days, not trading days.")}>
            <input type="number" className="input num" defaultValue={7} min={1} />
          </Field>
          <Field label={t("持仓快照", "Portfolio snapshot")} hint={t("在整个网格内固定。", "Fixed across the whole grid.")}>
            <select className="select">
              <option>{t("不提供", "None")}</option>
              <option>{t("主账户 v3", "Main account v3")}</option>
            </select>
          </Field>
          <Field
            label={t("继续已有回测", "Continue a backtest")}
            machineKey="run_id"
            hint={t("跳过已完成单元并结算到期项。", "Skips finished cells and settles matured ones.")}
          >
            <select className="select">
              <option>{t("新建回测", "New backtest")}</option>
              <option>bt_demo_1007</option>
            </select>
          </Field>
          <div className="stack-sm" style={{ gap: 14 }}>
            <p className="small t2">
              {t("2 个代码 × 6 个日期 =", "2 symbols × 6 dates =")}{" "}
              <span style={{ color: "var(--text)", fontWeight: 600 }}>12</span>{" "}
              {t("个单元；结束日期已裁到今天。", "cells; the end date is capped at today.")}
            </p>
            <Button
              variant="solid"
              block
              loading={starting}
              onClick={() => {
                setStarting(true);
                window.setTimeout(() => {
                  setStarting(false);
                  toast(t("回测已加入队列（演示）", "Backtest queued (demo)"));
                }, 800);
              }}
            >
              {t("开始回测", "Start backtest")}
            </Button>
          </div>
        </aside>

        <div className="stack-xl">
          <section className="stack-lg">
            <div className="row-between">
              <div className="row" style={{ gap: 14 }}>
                <h2 className="section-title mono">bt_demo_1007</h2>
                <Status status="running" />
                <DemoMark />
              </div>
              <div className="row">
                <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />}>
                  {t("继续并结算", "Continue & settle")}
                </Button>
                <Button size="sm" variant="ghost" icon={<Download size={14} />}>
                  {t("日志与统计", "Log & stats")}
                </Button>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <div
                className="grid-cells"
                style={{ gridTemplateColumns: `100px repeat(${demoBacktest.dates.length}, minmax(40px, 1fr))`, minWidth: 420 }}
              >
                <span />
                {demoBacktest.dates.map((d) => (
                  <span key={d} className="micro t3 num" style={{ textAlign: "center", paddingBottom: 4 }}>
                    {d}
                  </span>
                ))}
                {demoBacktest.tickers.map((ticker) => (
                  <div key={ticker} style={{ display: "contents" }}>
                    <span className="mono small" style={{ alignSelf: "center" }}>
                      {ticker}
                    </span>
                    {demoBacktest.cells[ticker].map((s, i) => (
                      <span key={i} className="cell" data-s={s} title={`${ticker} · ${demoBacktest.dates[i]} · ${t(...CELL_TEXT[s])}`}>
                        {s === "failed" ? "!" : ""}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="legend">
              {Object.entries(CELL_TEXT).map(([s, l]) => (
                <span key={s}>
                  <span className="cell" data-s={s} /> {t(...l)}
                </span>
              ))}
            </div>
            <Notice kind="error" title={t("1 个单元失败。", "1 cell failed.")}>
              {t("DEMO · 10-22：数据源返回 NO_DATA_AVAILABLE。另有 1 项结算失败。", "DEMO · 10-22: the data source returned NO_DATA_AVAILABLE. 1 settlement also failed.")}
            </Notice>
          </section>

          <section className="stack-lg">
            <div className="row-between">
              <h2 className="section-title">{t("结果", "Results")}</h2>
              <span className="small t3">{t("持有 5 天 · 基准 SPY", "5-day hold · benchmark SPY")} · resolved 7 · pending 4 · unscored 1</span>
            </div>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("评级", "Rating")}</th>
                    <th className="num">{t("数量", "Count")}</th>
                    <th className="num">{t("方向命中率", "Direction hit rate")}</th>
                    <th className="num">mean alpha</th>
                  </tr>
                </thead>
                <tbody>
                  {demoBacktest.stats.map((s) => (
                    <tr key={s.rating}>
                      <td>
                        <RatingInline rating={s.rating} />
                      </td>
                      <td className="num">{s.count}</td>
                      <td className="num">
                        {s.rating === "Hold" ? (
                          <span className="t3">{t("不适用", "n/a")}</span>
                        ) : s.hit == null ? (
                          <span className="t3">—</span>
                        ) : (
                          `${Math.round(s.hit * 100)}%`
                        )}
                      </td>
                      <td className="num">{formatPct(s.alpha)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small t3">{t("mean alpha 是相对基准的原有指标，不是账户收益。", "Mean alpha is the existing benchmark-relative metric, not account return.")}</p>
          </section>
        </div>
      </div>
    </>
  );
}
