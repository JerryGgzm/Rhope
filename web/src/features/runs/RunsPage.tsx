import { Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHead } from "../../app/Shell";
import { useToast } from "../../components/Toast";
import { Button, DemoMark, RatingInline, Status } from "../../components/ui";
import { demoRuns } from "../../demo/fixtures";

const FILTERS = [
  ["all", "全部"],
  ["running", "运行中"],
  ["done", "已完成"],
  ["failed", "失败"],
] as const;

export function RunsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [q, setQ] = useState("");
  const [indexing, setIndexing] = useState(false);

  const rows = demoRuns.filter((r) => {
    if (q && !r.ticker.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "running") return r.status === "running" || r.status === "queued";
    if (filter === "done") return r.status === "completed" || r.status === "completed_with_warnings";
    if (filter === "failed") return r.status === "failed" || r.status === "interrupted";
    return true;
  });

  return (
    <>
      <PageHead
        title="历史"
        sub="每次运行独立保存，同一天重复分析也不会互相覆盖。"
        actions={
          <Button
            size="sm"
            loading={indexing}
            onClick={() => {
              setIndexing(true);
              window.setTimeout(() => {
                setIndexing(false);
                toast("已索引 12 份旧结果（演示）");
              }, 900);
            }}
          >
            索引已有结果
          </Button>
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
        <div className="row">
          <div style={{ position: "relative", width: 220 }}>
            <Search size={15} className="t3" style={{ position: "absolute", left: 12, top: 12 }} aria-hidden />
            <input
              className="input"
              placeholder="代码"
              style={{ paddingLeft: 34, height: 38, borderRadius: 999 }}
              aria-label="按代码筛选"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <DemoMark />
        </div>
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>代码</th>
              <th>分析日期</th>
              <th>开始</th>
              <th>状态</th>
              <th>最终评级</th>
              <th>模型</th>
              <th>持仓</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="clickable"
                tabIndex={0}
                onClick={() => navigate(`/runs/${r.id}`)}
                onKeyDown={(e) => e.key === "Enter" && navigate(`/runs/${r.id}`)}
              >
                <td>
                  <span className="mono" style={{ fontWeight: 500 }}>
                    {r.ticker}
                  </span>
                  {r.legacy && (
                    <span className="tag" style={{ marginLeft: 8 }}>
                      旧版记录
                    </span>
                  )}
                </td>
                <td className="num">{r.date}</td>
                <td className="num t2">{r.started}</td>
                <td>
                  <Status status={r.status} />
                </td>
                <td>
                  <RatingInline rating={r.rating} />
                </td>
                <td className="mono t2 small">{r.model}</td>
                <td className={r.portfolio === "未记录" ? "t3" : "t2"}>{r.portfolio}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="small t3" style={{ padding: "24px 0" }}>没有符合条件的运行。</p>}
      </div>

      <div className="row-between small t3" style={{ marginTop: 20 }}>
        <span>{rows.length} 条</span>
        <div className="row">
          <Button size="sm" variant="ghost" disabled>
            上一页
          </Button>
          <Button size="sm" variant="ghost" disabled>
            下一页
          </Button>
        </div>
      </div>
    </>
  );
}
