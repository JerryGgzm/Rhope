import { FolderInput, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Topbar } from "../../app/Shell";
import { RatingBadge, StatusBadge } from "../../components/ui";
import { demoRuns } from "../../demo/fixtures";

export function RunsPage() {
  const navigate = useNavigate();
  return (
    <>
      <Topbar
        title="运行历史"
        actions={
          <button className="btn btn-sm">
            <FolderInput size={15} /> 索引已有结果目录
          </button>
        }
      />
      <div className="page">
        <div className="row">
          <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 280 }}>
            <Search size={15} className="faint" style={{ position: "absolute", left: 12, top: 12 }} aria-hidden />
            <input className="input" placeholder="按代码筛选" style={{ paddingLeft: 34 }} aria-label="按代码筛选" />
          </div>
          <select className="select" style={{ width: 150 }} aria-label="按状态筛选">
            <option>全部状态</option>
            <option>运行中</option>
            <option>已完成</option>
            <option>失败</option>
            <option>已中断</option>
          </select>
          <input type="date" className="input" style={{ width: 170 }} aria-label="分析日期" />
          <span className="demo-tag" style={{ marginLeft: "auto" }}>
            演示数据
          </span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="sticky-col">代码</th>
                <th>分析日期</th>
                <th>开始时间</th>
                <th>状态</th>
                <th>最终评级</th>
                <th>模型（快速 / 深度）</th>
                <th>持仓快照</th>
              </tr>
            </thead>
            <tbody>
              {demoRuns.map((r) => (
                <tr
                  key={r.id}
                  className="row-link"
                  tabIndex={0}
                  onClick={() => navigate(`/runs/${r.id}`)}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/runs/${r.id}`)}
                >
                  <td className="sticky-col">
                    <strong className="mono">{r.ticker}</strong>
                    {r.legacy && (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        旧版记录
                      </span>
                    )}
                  </td>
                  <td className="num">{r.date}</td>
                  <td className="num muted">{r.started}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>
                    <RatingBadge rating={r.rating} />
                  </td>
                  <td className="mono muted" style={{ fontSize: 12.5 }}>
                    {r.model}
                  </td>
                  <td className={r.portfolio === "未记录" ? "faint" : "muted"}>{r.portfolio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row-between aux">
          <span>共 5 条 · 第 1 / 1 页</span>
          <div className="row">
            <button className="btn btn-sm" disabled>
              上一页
            </button>
            <button className="btn btn-sm" disabled>
              下一页
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
