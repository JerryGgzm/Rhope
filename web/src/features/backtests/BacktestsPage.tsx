import { Download, RotateCcw } from "lucide-react";
import { useState } from "react";
import { PageHead } from "../../app/Shell";
import { useToast } from "../../components/Toast";
import { Button, DemoMark, Field, Notice, RatingInline, Status } from "../../components/ui";
import { formatPct } from "../../lib/labels";
import { demoBacktest } from "../../demo/fixtures";

const CELL_TEXT: Record<string, string> = {
  pending: "待运行",
  running: "运行中",
  completed: "完成",
  failed: "失败",
  skipped: "已跳过",
};

export function BacktestsPage() {
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  return (
    <>
      <PageHead title="回测" sub="按代码 × 日期网格复用分析引擎；不是成交模拟，不计算净值、回撤或 Sharpe。" />

      <div className="split">
        <aside className="split-aside stack-lg" aria-label="回测参数">
          <Field label="代码" hint="每行一个，或用逗号分隔。">
            <textarea className="textarea mono" defaultValue={"DEMO\nSAMPLE.HK"} />
          </Field>
          <div className="cols-2" style={{ gap: 12 }}>
            <Field label="开始">
              <input type="date" className="input" defaultValue="2026-10-01" />
            </Field>
            <Field label="结束">
              <input type="date" className="input" defaultValue="2026-11-08" />
            </Field>
          </div>
          <Field label="间隔" machineKey="every" hint="日历日，不是交易日。">
            <input type="number" className="input num" defaultValue={7} min={1} />
          </Field>
          <Field label="持仓快照" hint="在整个网格内固定。">
            <select className="select">
              <option>不提供</option>
              <option>主账户 v3</option>
            </select>
          </Field>
          <Field label="继续已有回测" machineKey="run_id" hint="跳过已完成单元并结算到期项。">
            <select className="select">
              <option>新建回测</option>
              <option>bt_demo_1007</option>
            </select>
          </Field>
          <div className="stack-sm" style={{ gap: 14 }}>
            <p className="small t2">
              2 个代码 × 6 个日期 = <span style={{ color: "var(--text)", fontWeight: 600 }}>12</span> 个单元；结束日期已裁到今天。
            </p>
            <Button
              variant="solid"
              block
              loading={starting}
              onClick={() => {
                setStarting(true);
                window.setTimeout(() => {
                  setStarting(false);
                  toast("回测已加入队列（演示）");
                }, 800);
              }}
            >
              开始回测
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
                  继续并结算
                </Button>
                <Button size="sm" variant="ghost" icon={<Download size={14} />}>
                  日志与统计
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
                {demoBacktest.tickers.map((t) => (
                  <div key={t} style={{ display: "contents" }}>
                    <span className="mono small" style={{ alignSelf: "center" }}>
                      {t}
                    </span>
                    {demoBacktest.cells[t].map((s, i) => (
                      <span key={i} className="cell" data-s={s} title={`${t} · ${demoBacktest.dates[i]} · ${CELL_TEXT[s]}`}>
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
                  <span className="cell" data-s={s} /> {l}
                </span>
              ))}
            </div>
            <Notice kind="error" title="1 个单元失败。">
              DEMO · 10-22：数据源返回 NO_DATA_AVAILABLE。另有 1 项结算失败。
            </Notice>
          </section>

          <section className="stack-lg">
            <div className="row-between">
              <h2 className="section-title">结果</h2>
              <span className="small t3">持有 5 天 · 基准 SPY · resolved 7 · pending 4 · unscored 1</span>
            </div>
            <div className="table-scroll">
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
                        <RatingInline rating={s.rating} />
                      </td>
                      <td className="num">{s.count}</td>
                      <td className="num">
                        {s.rating === "Hold" ? (
                          <span className="t3">不适用</span>
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
            <p className="small t3">mean alpha 是相对基准的原有指标，不是账户收益。</p>
          </section>
        </div>
      </div>
    </>
  );
}
