import { Download, Play, RotateCcw } from "lucide-react";
import { Topbar } from "../../app/Shell";
import { Banner, Field, RatingBadge, StatusBadge } from "../../components/ui";
import { formatPct } from "../../lib/labels";
import { demoBacktest } from "../../demo/fixtures";

export function BacktestsPage() {
  return (
    <>
      <Topbar title="回测" crumb="按 ticker × 日期网格复用分析引擎" />
      <div className="page">
        <div className="workbench">
          <section className="panel params" aria-label="回测参数">
            <div className="panel-body stack" style={{ gap: 18 }}>
              <Field label="代码列表" hint="每行一个，或用逗号分隔。">
                <textarea className="textarea mono" defaultValue={"DEMO\nSAMPLE.HK"} />
              </Field>
              <div className="grid-2">
                <Field label="开始日期">
                  <input type="date" className="input" defaultValue="2026-10-01" />
                </Field>
                <Field label="结束日期">
                  <input type="date" className="input" defaultValue="2026-11-08" />
                </Field>
              </div>
              <Field label="间隔（日历日）" machineKey="every" hint="按日历日计算，不是交易日。">
                <input type="number" className="input" defaultValue={7} min={1} />
              </Field>
              <Field label="持仓快照（可选）" hint="在整个网格内固定，回测不会因建议而改变持仓。">
                <select className="select">
                  <option>不提供</option>
                  <option>主账户 v3</option>
                </select>
              </Field>
              <Field label="继续已有回测" machineKey="run_id" hint="跳过已完成的单元，并结算到期项。">
                <select className="select">
                  <option>新建回测</option>
                  <option>bt_demo_1007</option>
                </select>
              </Field>
              <div className="panel raised" style={{ padding: 12 }}>
                <div className="row-between">
                  <strong style={{ fontSize: 13.5 }}>网格预览</strong>
                  <span className="demo-tag">演示</span>
                </div>
                <p className="aux" style={{ marginTop: 6 }}>
                  2 个代码 × 6 个日期 = <strong style={{ color: "var(--text)" }}>12</strong> 个单元。结束日期已按规则裁到今天。
                </p>
              </div>
              <button className="btn btn-primary btn-block">
                <Play size={15} /> 开始回测
              </button>
            </div>
          </section>

          <div className="stack" style={{ gap: 20 }}>
            <Banner kind="info">
              回测不是成交模拟：不计算净值、最大回撤或 Sharpe。mean alpha 是相对基准的原有指标，不是账户收益。
            </Banner>
            <section className="panel">
              <div className="panel-head">
                <div className="row">
                  <h3 className="mono">bt_demo_1007</h3>
                  <StatusBadge status="running" />
                  <span className="demo-tag">演示数据</span>
                </div>
                <div className="row">
                  <button className="btn btn-sm">
                    <RotateCcw size={14} /> 继续并结算
                  </button>
                  <button className="btn btn-sm">
                    <Download size={14} /> 日志与统计 JSON
                  </button>
                </div>
              </div>
              <div className="panel-body stack">
                <div style={{ overflowX: "auto" }}>
                  <div
                    className="cell-grid"
                    style={{ gridTemplateColumns: `110px repeat(${demoBacktest.dates.length}, minmax(44px, 1fr))`, minWidth: 420 }}
                  >
                    <span />
                    {demoBacktest.dates.map((d) => (
                      <span key={d} className="aux num" style={{ textAlign: "center" }}>
                        {d}
                      </span>
                    ))}
                    {demoBacktest.tickers.map((t) => (
                      <div key={t} style={{ display: "contents" }}>
                        <span className="mono" style={{ fontSize: 13 }}>
                          {t}
                        </span>
                        {demoBacktest.cells[t].map((s, i) => (
                          <span key={i} className="cell" data-s={s} title={`${t} ${demoBacktest.dates[i]}：${s}`}>
                            {s === "failed" ? "!" : ""}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="legend">
                  {[
                    ["pending", "待运行"],
                    ["running", "运行中"],
                    ["completed", "完成"],
                    ["failed", "失败"],
                    ["skipped", "已跳过"],
                  ].map(([s, l]) => (
                    <span key={s}>
                      <span className="cell" data-s={s} /> {l}
                    </span>
                  ))}
                </div>
                <Banner kind="error" title="1 个单元失败：">
                  DEMO · 10-22 —— 数据源返回 NO_DATA_AVAILABLE。另有 1 项结算失败，详见下方。
                </Banner>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h3>结果统计</h3>
                <span className="aux">持有 5 天 · 基准 SPY · resolved 7 · pending 4 · unscored 1</span>
              </div>
              <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>评级</th>
                      <th className="num">数量</th>
                      <th className="num">方向命中率</th>
                      <th className="num">mean alpha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demoBacktest.stats.map((s) => (
                      <tr key={s.rating}>
                        <td>
                          <RatingBadge rating={s.rating} />
                        </td>
                        <td className="num">{s.count}</td>
                        <td className="num">
                          {s.rating === "Hold" ? (
                            <span className="faint">不适用</span>
                          ) : s.hit == null ? (
                            <span className="faint">—</span>
                          ) : (
                            formatPct(s.hit, 0).replace("+", "")
                          )}
                        </td>
                        <td className="num">{formatPct(s.alpha)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
