import { Search } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHead } from "../../app/Shell";
import { Button, Empty, RatingInline, Status } from "../../components/ui";
import { errorText } from "../../lib/api/client";
import { useRuns } from "../../lib/api/hooks";
import { formatStamp } from "../../lib/labels";

const FILTERS = [
  ["", "全部"],
  ["running", "运行中"],
  ["completed", "已完成"],
  ["completed_with_warnings", "有警告"],
  ["failed", "失败"],
] as const;

const PAGE = 25;

export function RunsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const runs = useRuns({ ticker: q.trim(), status, limit: PAGE, offset: page * PAGE });
  const total = runs.data?.total ?? 0;
  const rows = runs.data?.items ?? [];

  return (
    <>
      <PageHead title="历史" sub="每次运行独立保存，同一天重复分析也不会互相覆盖。" />

      <div className="row-between" style={{ marginBottom: 20 }}>
        <div className="pills" role="group" aria-label="按状态筛选">
          {FILTERS.map(([k, l]) => (
            <button
              key={k}
              className="pill"
              aria-pressed={status === k}
              onClick={() => {
                setStatus(k);
                setPage(0);
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <div style={{ position: "relative", width: 220 }}>
          <Search size={15} className="t3" style={{ position: "absolute", left: 12, top: 12 }} aria-hidden />
          <input
            className="input"
            placeholder="代码"
            style={{ paddingLeft: 34, height: 38, borderRadius: 999 }}
            aria-label="按代码筛选"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
      </div>

      {runs.isError ? (
        <Empty title="无法读取运行历史">{errorText(runs.error)}</Empty>
      ) : runs.data && total === 0 && !q && !status ? (
        <Empty
          title="还没有运行记录"
          action={
            <Link to="/analysis" className="btn btn-solid btn-sm">
              开始第一次分析
            </Link>
          }
        >
          每次分析都会在这里留下独立的记录、报告和运行日志。
        </Empty>
      ) : (
        <>
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
                    </td>
                    <td className="num">{r.analysis_date}</td>
                    <td className="num t2">{formatStamp(r.started_at ?? r.created_at)}</td>
                    <td>
                      <Status status={r.status} />
                    </td>
                    <td>
                      <RatingInline rating={r.rating} />
                    </td>
                    <td className="mono t2 small">
                      {r.models.quick}
                      {r.models.deep && r.models.deep !== r.models.quick ? ` / ${r.models.deep}` : ""}
                    </td>
                    <td className="t2">
                      {!r.portfolio ? (
                        <span className="t3">未提供</span>
                      ) : r.portfolio.source === "flat" ? (
                        "空仓"
                      ) : (
                        `${r.portfolio.name ?? r.portfolio.id} v${r.portfolio.version}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {runs.data && rows.length === 0 && <p className="small t3" style={{ padding: "24px 0" }}>没有符合条件的运行。</p>}
            {runs.isPending && <p className="small t3" style={{ padding: "24px 0" }}>读取中…</p>}
          </div>

          <div className="row-between small t3" style={{ marginTop: 20 }}>
            <span>{total} 条</span>
            <div className="row">
              <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                上一页
              </Button>
              <Button size="sm" variant="ghost" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>
                下一页
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
