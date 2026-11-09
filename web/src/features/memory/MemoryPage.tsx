import { useState } from "react";
import { PageHead } from "../../app/Shell";
import { useToast } from "../../components/Toast";
import { Button, DemoMark, RatingInline } from "../../components/ui";
import { formatPct } from "../../lib/labels";
import { demoMemory } from "../../demo/fixtures";

const FILTERS = [
  ["all", "全部"],
  ["pending", "待结算"],
  ["resolved", "已结算"],
] as const;

export function MemoryPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [settling, setSettling] = useState(false);
  const rows = demoMemory.filter((m) => filter === "all" || m.status === filter);

  return (
    <>
      <PageHead
        title="复盘"
        sub="历史建议在持有窗口结束后结算，并生成复盘文本。回测日志与此分开存放。"
        actions={
          <>
            <Button size="sm" variant="ghost">
              下载日志
            </Button>
            <Button
              size="sm"
              variant="solid"
              loading={settling}
              onClick={() => {
                setSettling(true);
                window.setTimeout(() => {
                  setSettling(false);
                  toast("结算任务已加入队列（演示）");
                }, 800);
              }}
            >
              更新已到期结果
            </Button>
          </>
        }
      />

      <div className="row-between" style={{ marginBottom: 20 }}>
        <div className="pills" role="group" aria-label="按状态筛选">
          {FILTERS.map(([k, l]) => (
            <button key={k} className="pill" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        <DemoMark />
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>代码</th>
              <th>决策日期</th>
              <th>原始评级</th>
              <th>状态</th>
              <th className="num">原始收益</th>
              <th className="num">alpha</th>
              <th className="num">持有天数</th>
              <th>结算日期</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={i} className="clickable" tabIndex={0}>
                <td className="mono" style={{ fontWeight: 500 }}>
                  {m.ticker}
                </td>
                <td className="num">{m.date}</td>
                <td>
                  <RatingInline rating={m.rating} />
                </td>
                <td>
                  <span className="status">
                    <span className="dot" data-tone={m.status === "pending" ? "hollow" : "ok"} aria-hidden />
                    {m.status === "pending" ? "待结算" : "已结算"}
                  </span>
                </td>
                <td className="num">{formatPct(m.raw)}</td>
                <td className="num">{formatPct(m.alpha)}</td>
                <td className="num">{m.holding ?? "—"}</td>
                <td className="num t2">{m.resolved ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small t3" style={{ marginTop: 20 }}>
        结算可能调用行情数据与模型。未满足持有窗口的条目继续显示为待结算，不会补零。
      </p>
    </>
  );
}
