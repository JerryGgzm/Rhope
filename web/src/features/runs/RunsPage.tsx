import { Search } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHead } from "../../app/Shell";
import { Button, Empty, RatingInline, Status } from "../../components/ui";
import { errorText } from "../../lib/api/client";
import { useRuns } from "../../lib/api/hooks";
import { t, useLang } from "../../lib/i18n";
import { formatStamp } from "../../lib/labels";

const filters = () =>
  [
    ["", t("全部", "All")],
    ["running", t("运行中", "Running")],
    ["completed", t("已完成", "Completed")],
    ["completed_with_warnings", t("有警告", "With warnings")],
    ["failed", t("失败", "Failed")],
  ] as const;

const PAGE = 25;

export function RunsPage() {
  useLang();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const runs = useRuns({ ticker: q.trim(), status, limit: PAGE, offset: page * PAGE });
  const total = runs.data?.total ?? 0;
  const rows = runs.data?.items ?? [];

  return (
    <>
      <PageHead
        title={t("历史", "History")}
        sub={t("每次运行独立保存，同一天重复分析也不会互相覆盖。", "Each run is kept separately; repeat analyses on the same day never overwrite each other.")}
      />

      <div className="row-between" style={{ marginBottom: 20 }}>
        <div className="pills" role="group" aria-label={t("按状态筛选", "Filter by status")}>
          {filters().map(([k, l]) => (
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
            placeholder={t("代码", "Symbol")}
            style={{ paddingLeft: 34, height: 38, borderRadius: 999 }}
            aria-label={t("按代码筛选", "Filter by symbol")}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
      </div>

      {runs.isError ? (
        <Empty title={t("无法读取运行历史", "Could not load run history")}>{errorText(runs.error)}</Empty>
      ) : runs.data && total === 0 && !q && !status ? (
        <Empty
          title={t("还没有运行记录", "No runs yet")}
          action={
            <Link to="/analysis" className="btn btn-solid btn-sm">
              {t("开始第一次分析", "Start your first analysis")}
            </Link>
          }
        >
          {t("每次分析都会在这里留下独立的记录、报告和运行日志。", "Every analysis leaves its own record, reports and log here.")}
        </Empty>
      ) : (
        <>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("代码", "Symbol")}</th>
                  <th>{t("分析日期", "Date")}</th>
                  <th>{t("开始", "Started")}</th>
                  <th>{t("状态", "Status")}</th>
                  <th>{t("最终评级", "Rating")}</th>
                  <th>{t("模型", "Models")}</th>
                  <th>{t("持仓", "Position")}</th>
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
                        <span className="t3">{t("未提供", "None")}</span>
                      ) : r.portfolio.source === "flat" ? (
                        t("空仓", "Flat")
                      ) : (
                        `${r.portfolio.name ?? r.portfolio.id} v${r.portfolio.version}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {runs.data && rows.length === 0 && <p className="small t3" style={{ padding: "24px 0" }}>{t("没有符合条件的运行。", "No matching runs.")}</p>}
            {runs.isPending && <p className="small t3" style={{ padding: "24px 0" }}>{t("读取中…", "Loading…")}</p>}
          </div>

          <div className="row-between small t3" style={{ marginTop: 20 }}>
            <span>{t(`${total} 条`, `${total} runs`)}</span>
            <div className="row">
              <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                {t("上一页", "Previous")}
              </Button>
              <Button size="sm" variant="ghost" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>
                {t("下一页", "Next")}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
