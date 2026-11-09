import { useState } from "react";
import { PageHead } from "../../app/Shell";
import { useToast } from "../../components/Toast";
import { Button, DemoMark, RatingInline } from "../../components/ui";
import { formatPct } from "../../lib/labels";
import { demoMemory } from "../../demo/fixtures";
import { t, useLang } from "../../lib/i18n";

const FILTERS = [
  ["all", ["全部", "All"]],
  ["pending", ["待结算", "Pending"]],
  ["resolved", ["已结算", "Settled"]],
] as const;

export function MemoryPage() {
  useLang();
  const toast = useToast();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [settling, setSettling] = useState(false);
  const rows = demoMemory.filter((m) => filter === "all" || m.status === filter);

  return (
    <>
      <PageHead
        title={t("复盘", "Review")}
        sub={t(
          "历史建议在持有窗口结束后结算，并生成复盘文本。回测日志与此分开存放。",
          "Past calls are settled after their holding window and get a written review. Backtest logs are kept separately.",
        )}
        actions={
          <>
            <Button size="sm" variant="ghost">
              {t("下载日志", "Download log")}
            </Button>
            <Button
              size="sm"
              variant="solid"
              loading={settling}
              onClick={() => {
                setSettling(true);
                window.setTimeout(() => {
                  setSettling(false);
                  toast(t("结算任务已加入队列（演示）", "Settlement queued (demo)"));
                }, 800);
              }}
            >
              {t("更新已到期结果", "Settle matured results")}
            </Button>
          </>
        }
      />

      <div className="row-between" style={{ marginBottom: 20 }}>
        <div className="pills" role="group" aria-label={t("按状态筛选", "Filter by status")}>
          {FILTERS.map(([k, l]) => (
            <button key={k} className="pill" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {t(l[0], l[1])}
            </button>
          ))}
        </div>
        <DemoMark />
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>{t("代码", "Symbol")}</th>
              <th>{t("决策日期", "Decided")}</th>
              <th>{t("原始评级", "Rating")}</th>
              <th>{t("状态", "Status")}</th>
              <th className="num">{t("原始收益", "Raw return")}</th>
              <th className="num">alpha</th>
              <th className="num">{t("持有天数", "Days held")}</th>
              <th>{t("结算日期", "Settled")}</th>
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
                    {m.status === "pending" ? t("待结算", "Pending") : t("已结算", "Settled")}
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
        {t(
          "结算可能调用行情数据与模型。未满足持有窗口的条目继续显示为待结算，不会补零。",
          "Settling may call market data and models. Entries whose holding window hasn't passed stay pending and are never filled with zeros.",
        )}
      </p>
    </>
  );
}
