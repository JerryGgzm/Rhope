import { Download, RefreshCw } from "lucide-react";
import { Topbar } from "../../app/Shell";
import { Banner, RatingBadge } from "../../components/ui";
import { formatPct } from "../../lib/labels";
import { demoMemory } from "../../demo/fixtures";

export function MemoryPage() {
  return (
    <>
      <Topbar
        title="决策复盘"
        actions={
          <>
            <button className="btn btn-sm">
              <Download size={15} /> 下载日志
            </button>
            <button className="btn btn-primary btn-sm">
              <RefreshCw size={15} /> 更新已到期结果
            </button>
          </>
        }
      />
      <div className="page">
        <Banner kind="info">
          “更新已到期结果”会作为后台任务运行，可能调用行情数据和模型生成复盘。未满足持有窗口的条目会继续显示为待结算。回测日志与日常记忆分开存放。
        </Banner>
        <div className="row">
          <select className="select" style={{ width: 150 }} aria-label="按状态筛选">
            <option>全部</option>
            <option>待结算</option>
            <option>已结算</option>
          </select>
          <input className="input" placeholder="按代码筛选" style={{ width: 200 }} aria-label="按代码筛选" />
          <span className="demo-tag" style={{ marginLeft: "auto" }}>
            演示数据
          </span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="sticky-col">代码</th>
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
              {demoMemory.map((m, i) => (
                <tr key={i} className="row-link" tabIndex={0}>
                  <td className="sticky-col mono">
                    <strong>{m.ticker}</strong>
                  </td>
                  <td className="num">{m.date}</td>
                  <td>
                    <RatingBadge rating={m.rating} />
                  </td>
                  <td>
                    {m.status === "pending" ? (
                      <span className="badge badge-blue">待结算</span>
                    ) : (
                      <span className="badge badge-pos">已结算</span>
                    )}
                  </td>
                  <td className="num">{formatPct(m.raw)}</td>
                  <td className="num">{formatPct(m.alpha)}</td>
                  <td className="num">{m.holding ?? "—"}</td>
                  <td className="num muted">{m.resolved ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
