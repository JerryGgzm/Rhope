import { AlertTriangle, ArrowDown, ChevronDown, Copy, Download, MoreHorizontal, Pencil, RotateCcw, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Disclosure } from "../../components/Disclosure";
import { Drawer } from "../../components/Drawer";
import { Markdown } from "../../components/Markdown";
import { Menu } from "../../components/Menu";
import { ResearchTrack, type TrackModel } from "../../components/ResearchTrack";
import { useToast } from "../../components/Toast";
import { Button, Empty, Notice, RatingHero, Status, Tabs } from "../../components/ui";
import { ApiError, artifactUrl, errorText } from "../../lib/api/client";
import { useCancelRun, useCreateRun, useRun, useRunEvents, useSections, useSettings, type StreamState } from "../../lib/api/hooks";
import type { RunDetail, RunEvent } from "../../lib/api/types";
import {
  ANALYSTS,
  ASSET_TYPE_LABEL,
  REPORT_KEY,
  SECTION_LABEL,
  STAGES,
  analystLabel,
  formatClock,
  formatDuration,
  formatNumber,
  formatStamp,
  isRating,
  secondsBetween,
  stageLabel,
  type StageKey,
  type StepState,
} from "../../lib/labels";
import { pickMessage, t, useLang } from "../../lib/i18n";

type TabKey = "decision" | "reports" | "debate" | "log" | "inputs";

const ACTIVE = new Set(["queued", "running", "cancelling"]);

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

const SETTINGS_FIXABLE = new Set(["PROVIDER_AUTH_FAILED", "PROVIDER_MODEL_NOT_FOUND"]);

function trackModel(run: RunDetail): TrackModel {
  const failed = run.status === "failed" || run.status === "interrupted";
  const halted = failed || run.status === "cancelled";
  const stages = {} as TrackModel["stages"];
  for (const s of STAGES) {
    const p = run.stages[s.key];
    let state: StepState = p?.state === "completed" ? "done" : p?.state === "running" ? "running" : "pending";
    if (state === "running" && halted) state = failed ? "failed" : "pending";
    const seconds = p?.started_at ? secondsBetween(p.started_at, p.finished_at) : null;
    stages[s.key as StageKey] = {
      state,
      seconds: state === "done" ? seconds : null,
      detail: state === "failed" ? (run.status === "interrupted" ? t("已中断", "Interrupted") : t("失败", "Failed")) : undefined,
    };
  }
  const selected = run.request.analysts;
  const analysts = ANALYSTS.map((a) => {
    if (!selected.includes(a.key)) return { key: a.key, state: "skipped" as StepState };
    const p = run.agents[a.key];
    let state: StepState = p?.state === "completed" ? "done" : p?.state === "running" ? "running" : "pending";
    if (state === "running" && halted) state = failed ? "failed" : "pending";
    return { key: a.key, state, seconds: state === "done" ? secondsBetween(p?.started_at, p?.finished_at) : null };
  });
  return { stages, analysts };
}

export function RunDetailPage() {
  useLang();
  const { id = "" } = useParams();
  const run = useRun(id);
  const { events, state: stream } = useRunEvents(id);

  if (run.isError) {
    const notFound = run.error instanceof ApiError && run.error.status === 404;
    return (
      <Empty
        title={notFound ? t("找不到这次运行", "Run not found") : t("无法读取这次运行", "Could not load this run")}
        action={
          <Link to="/runs" className="btn btn-sm">
            {t("返回历史", "Back to history")}
          </Link>
        }
      >
        {notFound ? t("它可能来自另一个数据目录。", "It may belong to another data directory.") : errorText(run.error)}
      </Empty>
    );
  }
  if (!run.data) {
    return (
      <div className="stack-lg" aria-busy>
        <div className="skeleton" style={{ height: 56, width: 220 }} />
        <div className="skeleton" style={{ height: 14, width: 360 }} />
        <div className="skeleton" style={{ height: 88, width: "100%", marginTop: 24 }} />
      </div>
    );
  }
  return <RunView run={run.data} events={events} stream={stream} />;
}

function RunView({ run, events, stream }: { run: RunDetail; events: RunEvent[]; stream: StreamState }) {
  const active = ACTIVE.has(run.status);
  const [tab, setTab] = useState<TabKey>(active ? "reports" : "decision");
  const [diag, setDiag] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const cancel = useCancelRun(run.id);
  const rerun = useCreateRun();
  const settings = useSettings();
  const sections = useSections(run.id);
  const now = useNow(active);
  const prevActive = useRef(active);

  useEffect(() => {
    if (prevActive.current && !active) setTab("decision");
    prevActive.current = active;
  }, [active]);

  const issues = useMemo(() => events.filter((e) => e.severity !== "info"), [events]);
  const elapsed = run.started_at
    ? ((run.finished_at ? Date.parse(run.finished_at) : now) - Date.parse(run.started_at)) / 1000
    : null;
  const s = sections.data ?? {};
  const reportsDone = run.request.analysts.filter((a) => s[REPORT_KEY[a as keyof typeof REPORT_KEY]]).length;

  const doRerun = () => {
    if (!settings.data) return;
    const r = run.request;
    rerun.mutate(
      {
        key: crypto.randomUUID(),
        body: {
          ticker: r.ticker,
          analysis_date: r.analysis_date,
          asset_type: r.asset_type as "stock" | "crypto",
          analysts: r.analysts,
          settings_revision: settings.data.revision,
          overrides: r.overrides ?? {},
          portfolio:
            r.portfolio.mode === "snapshot"
              ? { mode: "snapshot", id: r.portfolio.id ?? undefined, version: r.portfolio.version ?? undefined }
              : { mode: r.portfolio.mode as "none" | "flat" },
          checkpoint_enabled: Boolean(r.checkpoint_enabled),
          report_options: r.report_options,
        },
      },
      {
        onSuccess: (next) => {
          toast(t("已创建新的运行", "New run created"));
          navigate(`/runs/${next.id}`);
        },
        onError: (e) => toast(errorText(e)),
      },
    );
  };

  const editParams = () =>
    navigate("/analysis", {
      state: {
        prefill: {
          ticker: run.request.ticker,
          dateMode: "history",
          date: run.request.analysis_date,
          analysts: run.request.analysts,
          debateRounds: (run.request.overrides?.max_debate_rounds as number) ?? null,
          riskRounds: (run.request.overrides?.max_risk_discuss_rounds as number) ?? null,
          language: (run.request.overrides?.output_language as string) ?? null,
          checkpoint: run.request.checkpoint_enabled,
        },
      },
    });

  return (
    <>
      <div className="row small t3" style={{ gap: 10, marginBottom: 28 }}>
        <Link to="/runs" className="text-link t2">
          {t("历史", "History")}
        </Link>
        <span>/</span>
        <span className="mono">{run.id}</span>
      </div>

      <header className="stack-lg" style={{ marginBottom: 48 }}>
        <div className="row-between" style={{ alignItems: "flex-end" }}>
          <div className="stack-sm" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 16, alignItems: "baseline" }}>
              <h1 className="serif" style={{ fontSize: 56, lineHeight: 1, fontWeight: 400 }}>
                {run.ticker}
              </h1>
              <span className="t2">{ASSET_TYPE_LABEL[run.asset_type] ?? run.asset_type}</span>
            </div>
            <div className="row small t2" style={{ gap: 18 }}>
              <Status status={run.status} />
              <span>
                {t("分析日期", "Date")} <span className="num" style={{ color: "var(--text)" }}>{run.analysis_date}</span>
              </span>
              <span className="num">{t("运行于", "Ran")} {formatStamp(run.started_at ?? run.created_at)}</span>
              {elapsed != null && <span className="num">{t("用时", "Took")} {formatDuration(elapsed)}</span>}
            </div>
          </div>
          <div className="row">
            {active ? (
              run.status === "cancelling" ? (
                <Button variant="danger" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate(true)}>
                  {t("强制终止", "Force stop")}
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  loading={cancel.isPending}
                  icon={<Square size={12} />}
                  onClick={() => cancel.mutate(false, { onError: (e) => toast(errorText(e)) })}
                >
                  {run.status === "queued" ? t("取消排队", "Leave queue") : t("请求停止", "Stop")}
                </Button>
              )
            ) : (
              <>
                <Button size="sm" icon={<Pencil size={14} />} onClick={editParams}>
                  {t("编辑参数", "Edit inputs")}
                </Button>
                <Button size="sm" variant="solid" icon={<RotateCcw size={14} />} loading={rerun.isPending} onClick={doRerun}>
                  {t("重新运行", "Run again")}
                </Button>
              </>
            )}
            <Menu
              trigger={({ toggle, ref, open }) => (
                <Button
                  ref={ref}
                  size="sm"
                  variant="ghost"
                  aria-label={t("更多操作", "More actions")}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  onClick={toggle}
                  icon={<MoreHorizontal size={18} />}
                />
              )}
            >
              {(close) => (
                <>
                  <button
                    className="menu-item"
                    role="menuitem"
                    onClick={() => {
                      close();
                      setDiag(true);
                    }}
                  >
                    {t("诊断", "Diagnostics")} <span className="t3">{issues.length}</span>
                  </button>
                  <button
                    className="menu-item"
                    role="menuitem"
                    onClick={() => {
                      close();
                      navigator.clipboard.writeText(run.id).then(() => toast(t("运行 ID 已复制", "Run ID copied")));
                    }}
                  >
                    {t("复制运行 ID", "Copy run ID")}
                  </button>
                </>
              )}
            </Menu>
          </div>
        </div>

        <ResearchTrack model={trackModel(run)} />
        {run.status === "running" && (
          <p className="small t3">
            {t(
              "分析师并行运行中。总时长无法可靠估计，因此不显示百分比。",
              "Analysts are working in parallel. Total time can't be estimated reliably, so no percentage is shown.",
            )}
          </p>
        )}
        {run.status === "queued" && (
          <p className="small t3">
            {t("排队中：轮到这次运行时自动开始，一次只运行一个分析。", "Queued: starts automatically when its turn comes; one analysis runs at a time.")}
          </p>
        )}
      </header>

      <div style={{ marginBottom: 8 }}>
        {stream === "lost" && active && (
          <Notice kind="warn" title={t("与服务的连接已断开，后台状态待确认。", "Lost connection to the service; background state unknown.")}>
            {t(
              "分析可能仍在后台运行；重连后会补齐期间的事件，不会重新启动任务。",
              "The analysis may still be running; missed events are filled in on reconnect and the run is not restarted.",
            )}
          </Notice>
        )}
        {run.status === "cancelling" && (
          <Notice kind="warn" title={t("正在停止。", "Stopping.")}>
            {t(
              "进行中的模型调用结束后进程退出，期间仍可能计费。需要立即结束可“强制终止”。",
              "The process exits after the model call in progress, which may still be billed. Use “Force stop” to end it now.",
            )}
          </Notice>
        )}
        {run.status === "failed" && run.error && (
          <Notice
            kind="error"
            title={
              run.error.stage
                ? t(`${stageLabel(run.error.stage)}阶段失败：`, `Failed during ${stageLabel(run.error.stage)}: `) + pickMessage(run.error)
                : t("失败：", "Failed: ") + pickMessage(run.error)
            }
            actions={
              <>
                {SETTINGS_FIXABLE.has(run.error.code) && (
                  <Link to="/settings" className="btn btn-sm">
                    {t("前往设置", "Open settings")}
                  </Link>
                )}
                <Button size="sm" variant="ghost" onClick={() => setDiag(true)}>
                  {t("诊断", "Diagnostics")}
                </Button>
              </>
            }
          >
            {Object.values(s).some(Boolean) && t("已完成的报告仍可阅读。", "Finished reports are still readable. ")}
            <span className="mono t3">{run.error.code}</span>
          </Notice>
        )}
        {run.status === "interrupted" && (
          <Notice kind="warn" title={t("运行被中断。", "The run was interrupted.")}>
            {t(
              "服务重启或进程意外退出。已完成的报告保留；开启断点恢复的运行可用相同输入重新运行以继续。",
              "The service restarted or the process exited unexpectedly. Finished reports are kept; with checkpoints on, rerun with the same inputs to continue.",
            )}
          </Notice>
        )}
        {run.status === "cancelled" && (
          <Notice kind="info" title={t("已取消。", "Cancelled.")}>
            {t("已完成的报告保留。", "Finished reports are kept.")}
          </Notice>
        )}
        {run.rating === "REVIEW" && (
          <Notice kind="warn" title={t("需复核。", "Needs review.")}>
            {t(
              "无法从最终决策中读出评级，本次记录为“需复核”，不是持有或任何交易建议。请阅读决策原文自行判断。",
              "No rating could be read from the final decision, so it is recorded as “Review”, which is not Hold or any trade advice. Read the decision text and judge for yourself.",
            )}
          </Notice>
        )}
        {run.status === "completed_with_warnings" && issues.length > 0 && (
          <Notice
            kind="warn"
            title={t(`${issues.length} 项警告。`, `${issues.length} warning${issues.length === 1 ? "" : "s"}.`)}
            actions={
              <Button size="sm" variant="ghost" onClick={() => setDiag(true)}>
                {t("查看", "View")}
              </Button>
            }
          >
            {(pickMessage(issues[0].payload) || String(issues[0].payload.preview ?? issues[0].type)).slice(0, 120)}
          </Notice>
        )}
        {run.memory_note && (
          <Notice kind="info" title={t("决策日志：", "Decision log:")}>
            {run.memory_note}
          </Notice>
        )}
      </div>

      <Tabs<TabKey>
        label={t("运行内容", "Run content")}
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "decision", label: t("结论", "Decision") },
          { key: "reports", label: t("分析报告", "Reports"), count: reportsDone },
          { key: "debate", label: t("研究与风控", "Debate & risk") },
          { key: "log", label: t("运行记录", "Log"), count: events.length },
          { key: "inputs", label: t("本次输入", "Inputs") },
        ]}
      />
      <div className="tab-panel" key={tab} role="tabpanel">
        {tab === "decision" && <DecisionTab run={run} sections={s} />}
        {tab === "reports" && <ReportsTab run={run} sections={s} />}
        {tab === "debate" && <DebateTab run={run} sections={s} />}
        {tab === "log" && <LogTab events={events} live={active && stream === "open"} />}
        {tab === "inputs" && <InputsTab run={run} />}
      </div>

      <DiagnosticsDrawer open={diag} onClose={() => setDiag(false)} run={run} issues={issues} />
    </>
  );
}

function ExportMenu({ run }: { run: RunDetail }) {
  const labels: Record<string, [string, string]> = {
    report_md: [t("Markdown 报告", "Markdown report"), ".md"],
    report_html: [t("HTML 报告", "HTML report"), ".html"],
    state: [t("运行数据", "Run data"), ".json"],
    report_zip: [t("全部报告", "All reports"), ".zip"],
  };
  if (!run.artifacts.length) return null;
  const html = run.artifacts.find((a) => a.kind === "report_html");
  return (
    <Menu
      align="end"
      trigger={({ toggle, ref, open }) => (
        <Button ref={ref} size="sm" aria-haspopup="menu" aria-expanded={open} onClick={toggle} icon={<Download size={14} />}>
          {t("导出", "Export")} <ChevronDown size={13} />
        </Button>
      )}
    >
      {(close) => (
        <>
          {run.artifacts.map((a) => (
            <a key={a.id} className="menu-item" role="menuitem" href={artifactUrl(run.id, a.id)} download onClick={close}>
              {labels[a.kind]?.[0] ?? a.name} <span className="t3 mono">{labels[a.kind]?.[1]}</span>
            </a>
          ))}
          {html && (
            <>
              <div className="menu-sep" />
              <a className="menu-item" role="menuitem" href={artifactUrl(run.id, html.id, true)} target="_blank" rel="noopener noreferrer" onClick={close}>
                {t("在新标签页查看 HTML", "Open HTML in a new tab")}
              </a>
            </>
          )}
        </>
      )}
    </Menu>
  );
}

function DecisionTab({ run, sections }: { run: RunDetail; sections: Record<string, string> }) {
  const toast = useToast();
  const decision = sections.final_trade_decision;
  const trader = sections.trader_investment_plan;
  if (!decision) {
    if (ACTIVE.has(run.status)) {
      return (
        <Empty title={t("最终决策尚未生成", "No final decision yet")}>
          {t(
            "投资组合经理会在风险讨论结束后给出评级。已完成的分析师报告可以先在“分析报告”中阅读。",
            "The portfolio manager rates after the risk debate. Finished analyst reports can be read under “Reports” meanwhile.",
          )}
        </Empty>
      );
    }
    return (
      <Empty title={t("没有最终评级", "No final rating")}>
        {t("这次运行没有产生最终决策。没有评级不等于“持有”。", "This run produced no final decision. No rating does not mean “Hold”.")}
      </Empty>
    );
  }
  return (
    <div className="stack-xl">
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        {isRating(run.rating) ? (
          <RatingHero rating={run.rating} source={t("最终评级 · 投资组合经理", "Final rating · portfolio manager")} />
        ) : (
          <span className="t2">{t("评级尚未记录", "No rating recorded yet")}</span>
        )}
        <div className="row">
          <Button
            size="sm"
            variant="ghost"
            icon={<Copy size={14} />}
            onClick={() => navigator.clipboard.writeText(decision).then(() => toast(t("结论已复制", "Decision copied")))}
          >
            {t("复制", "Copy")}
          </Button>
          <ExportMenu run={run} />
        </div>
      </div>

      <section className="stack" style={{ gap: 10 }}>
        <span className="eyebrow">{t("投资组合经理决策", "Portfolio manager decision")}</span>
        <Markdown text={decision} />
      </section>

      {trader && (
        <>
          <hr className="hr" />
          <section className="stack" style={{ gap: 10 }}>
            <div className="row-between">
              <h2 className="section-title">{t("交易员方案", "Trader plan")}</h2>
              <span className="small t3">{t("来自交易员，独立于最终评级", "From the trader, separate from the final rating")}</span>
            </div>
            <Markdown text={trader} />
          </section>
        </>
      )}

      <p className="small t3">
        {t(
          "研究建议，不是交易指令。页面只展示代理生成的消息、工具事件与报告，不包含模型内部推理。",
          "Research, not a trade instruction. Only agent messages, tool events and reports are shown, never the model's internal reasoning.",
        )}
      </p>
    </div>
  );
}

function ReportsTab({ run, sections }: { run: RunDetail; sections: Record<string, string> }) {
  const active = ACTIVE.has(run.status);
  return (
    <div style={{ marginTop: -16 }}>
      {ANALYSTS.map((a, i) => {
        const selected = run.request.analysts.includes(a.key);
        const text = sections[REPORT_KEY[a.key]];
        const working = active && run.agents[a.key]?.state === "running";
        const state = !selected
          ? t("未选择", "Not selected")
          : text
            ? t("已生成", "Ready")
            : working
              ? t("生成中", "Writing")
              : active
                ? t("等待", "Waiting")
                : t("未生成", "Not produced");
        return (
          <Disclosure
            key={a.key}
            defaultOpen={i === 0 && !!text}
            title={t(`${a.label}分析`, `${a.label} analysis`)}
            meta={
              <span className="row small" style={{ gap: 10, fontWeight: 400 }}>
                {selected && !text && working && <span className="dot" data-tone="active" aria-hidden />}
                <span className={selected && !text && !active ? "caution-text" : "t3"}>{state}</span>
              </span>
            }
          >
            {text ? (
              <Markdown text={text} />
            ) : !selected ? (
              <p className="small t3">{t("本次没有选择这位分析师。", "This analyst was not selected.")}</p>
            ) : !working && active ? (
              <p className="small t3">{t("分析师开始后，报告会在这里逐步出现。", "The report appears here once the analyst starts.")}</p>
            ) : working ? (
              <div className="stack-sm" style={{ maxWidth: 560, gap: 10 }}>
                <div className="skeleton" style={{ height: 12, width: "72%" }} />
                <div className="skeleton" style={{ height: 12, width: "94%" }} />
                <div className="skeleton" style={{ height: 12, width: "58%" }} />
              </div>
            ) : (
              <p className="small t3">{t("运行结束前这份报告没有生成。", "This report was not produced before the run ended.")}</p>
            )}
          </Disclosure>
        );
      })}
    </div>
  );
}

function DebateTab({ run, sections }: { run: RunDetail; sections: Record<string, string> }) {
  const parts: [string, string][] = (
    [
      "bull_history",
      "bear_history",
      "investment_plan",
      "aggressive_history",
      "conservative_history",
      "neutral_history",
    ] as const
  )
    .filter((k) => sections[k])
    .map((k) => [k, sections[k]]);
  if (!parts.length) {
    return ACTIVE.has(run.status) ? (
      <Empty title={t("研究辩论尚未开始", "The debate hasn't started")}>
        {t("分析师报告全部完成后，多空研究员会开始辩论。", "Bull and bear researchers debate once all analyst reports are done.")}
      </Empty>
    ) : (
      <Empty title={t("没有研究与风控内容", "No debate or risk content")}>
        {t("这次运行在辩论开始前结束。", "This run ended before the debate began.")}
      </Empty>
    );
  }
  return (
    <div style={{ marginTop: -16 }}>
      {parts.map(([k, text], i) => (
        <Disclosure key={k} title={SECTION_LABEL[k]} defaultOpen={i === 0} meta={<span className="small t3">{formatNumber(text.length, 0)} {t("字", "chars")}</span>}>
          <Markdown text={text} />
        </Disclosure>
      ))}
    </div>
  );
}

const TYPE_TEXT: Record<string, readonly [string, string]> = {
  queued: ["排队", "Queued"],
  "run.started": ["开始", "Start"],
  "run.finalizing": ["收尾", "Finishing"],
  "run.completed": ["完成", "Done"],
  "run.failed": ["失败", "Failed"],
  "run.cancelled": ["取消", "Cancelled"],
  "run.cancelling": ["停止中", "Stopping"],
  "run.interrupted": ["中断", "Interrupted"],
  "stage.started": ["阶段开始", "Stage start"],
  "stage.completed": ["阶段完成", "Stage done"],
  "agent.started": ["开始", "Start"],
  "agent.completed": ["完成", "Done"],
  message: ["消息", "Message"],
  "tool.started": ["工具", "Tool"],
  "tool.completed": ["返回", "Result"],
  "tool.failed": ["工具失败", "Tool failed"],
  "report.updated": ["报告", "Report"],
  "stats.updated": ["统计", "Stats"],
  warning: ["警告", "Warning"],
  checkpoint: ["断点", "Checkpoint"],
  "artifact.saved": ["已保存", "Saved"],
  "artifact.failed": ["保存失败", "Save failed"],
};

const typeLabel = (type: string) => (TYPE_TEXT[type] ? t(...TYPE_TEXT[type]) : type);

function describe(e: RunEvent): string {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case "queued":
      return t(`排队第 ${p.position ?? "?"} 位`, `Position ${p.position ?? "?"} in queue`);
    case "run.started":
      return `${t("进程", "Process")} ${p.pid} · ${p.ticker} · ${p.analysis_date}`;
    case "stage.started":
    case "stage.completed":
      return stageLabel(e.stage);
    case "agent.started":
    case "agent.completed":
      return t(`${analystLabel(e.agent ?? "")}分析师`, `${analystLabel(e.agent ?? "")} analyst`);
    case "tool.started":
      return `${p.tool}(${String(p.args ?? "")})`;
    case "tool.completed":
    case "tool.failed":
      return `${p.tool} · ${formatNumber(p.chars as number, 0)} ${t("字符", "chars")}${p.code ? ` · ${p.code}` : ""}${p.preview ? ` — ${String(p.preview).slice(0, 160)}` : ""}`;
    case "report.updated":
      return `${SECTION_LABEL[p.section as string] ?? p.section} · ${formatNumber(p.chars as number, 0)} ${t("字", "chars")}`;
    case "stats.updated":
      return t(
        `模型调用 ${p.llm_calls} · 工具 ${p.tool_calls} · 输入 ${formatNumber(p.tokens_in as number, 0)} / 输出 ${formatNumber(p.tokens_out as number, 0)} tokens`,
        `${p.llm_calls} model calls · ${p.tool_calls} tools · ${formatNumber(p.tokens_in as number, 0)} in / ${formatNumber(p.tokens_out as number, 0)} out tokens`,
      );
    case "message":
      return String(p.text ?? "")
        .replace(/[*_`#>]+/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 280);
    case "checkpoint":
      return p.resuming ? t("从保存的断点继续", "Resuming from the saved checkpoint") : t("全新开始（断点已开启）", "Fresh start (checkpoints on)");
    case "run.completed":
      return `${p.rating ?? t("无评级", "No rating")}`;
    case "run.failed":
    case "artifact.failed":
      return `${pickMessage(p)} ${p.code ? `(${p.code})` : ""}`;
    default:
      return pickMessage(p);
  }
}

function LogTab({ events, live }: { events: RunEvent[]; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [sev, setSev] = useState<"all" | "tools" | "warning">("all");
  const rows = useMemo(() => {
    const filtered = events.filter((e) =>
      sev === "all" ? true : sev === "tools" ? e.type.startsWith("tool.") : e.severity !== "info",
    );
    return filtered.slice(-1500);
  }, [events, sev]);

  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [follow, rows.length]);

  return (
    <div className="stack">
      <div className="row-between">
        <div className="pills" role="group" aria-label={t("筛选", "Filter")}>
          {(
            [
              ["all", t("全部", "All")],
              ["tools", t("工具", "Tools")],
              ["warning", t("警告与错误", "Warnings & errors")],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className="pill" aria-pressed={sev === k} onClick={() => setSev(k)}>
              {l}
            </button>
          ))}
        </div>
        {live && (
          <span className="status">
            <span className="dot" data-tone="active" aria-hidden /> {t("实时", "Live")}
          </span>
        )}
      </div>
      <div
        className="log"
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
        }}
      >
        {rows.length === 0 && <p className="small t3" style={{ padding: "16px 0" }}>{t("没有符合条件的事件。", "No matching events.")}</p>}
        {rows.map((e) => (
          <div className="log-row" key={e.sequence}>
            <span className="t">{formatClock(e.timestamp)}</span>
            <span className="sev" aria-label={e.severity}>
              {e.severity === "warning" ? (
                <AlertTriangle size={12} className="caution-text" />
              ) : e.severity === "error" ? (
                <AlertTriangle size={12} className="danger-text" />
              ) : (
                <span className="dot" data-tone={e.type.endsWith("completed") ? "ok" : "muted"} style={{ width: 5, height: 5 }} />
              )}
            </span>
            <span className="who">{e.agent ? analystLabel(e.agent) : stageLabel(e.stage) || t("系统", "System")}</span>
            <span className="what">
              <span className="type">{e.payload?.fallback ? t("切换数据源", "Fallback") : typeLabel(e.type)}</span>
              {describe(e)}
            </span>
            <span className="dur" />
          </div>
        ))}
        {!follow && live && (
          <div className="jump">
            <Button size="sm" variant="solid" icon={<ArrowDown size={14} />} onClick={() => setFollow(true)}>
              {t("有新消息", "New messages")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function InputsTab({ run }: { run: RunDetail }) {
  const c = run.config as Record<string, unknown>;
  const r = run.request;
  const vendors = { ...((c.data_vendors as object) ?? {}), ...((c.tool_vendors as object) ?? {}) } as Record<string, string>;
  return (
    <div className="stack-xl">
      <p className="small t2">
        {t(
          "以下参数在任务启动时固定；之后修改设置不会影响本次运行。配置快照已脱敏，不包含密钥。",
          "These inputs were fixed when the run started; later settings changes don't affect it. The config snapshot is redacted and holds no keys.",
        )}
      </p>
      <div className="cols-2" style={{ gap: 64 }}>
        <section className="stack">
          <span className="eyebrow">{t("请求", "Request")}</span>
          <dl className="kv">
            <dt>{t("代码", "Symbol")}</dt>
            <dd className="mono">{r.ticker}</dd>
            <dt>{t("资产类型", "Asset type")}</dt>
            <dd>{ASSET_TYPE_LABEL[r.asset_type] ?? r.asset_type}</dd>
            <dt>{t("分析日期", "Date")}</dt>
            <dd className="num">{r.analysis_date}</dd>
            <dt>{t("分析师", "Analysts")}</dt>
            <dd>{r.analysts.map(analystLabel).join(t("、", ", "))}</dd>
            <dt>{t("轮数", "Rounds")}</dt>
            <dd>
              {t("辩论", "Debate")} {String(c.max_debate_rounds)} · {t("风控", "risk")} {String(c.max_risk_discuss_rounds)}
            </dd>
            <dt>{t("报告语言", "Report language")}</dt>
            <dd>{String(c.output_language)}</dd>
            <dt>{t("断点恢复", "Checkpoints")}</dt>
            <dd>{c.checkpoint_enabled ? t("开启", "On") : t("关闭", "Off")}</dd>
            <dt>{t("持仓", "Position")}</dt>
            <dd>
              {r.portfolio.mode === "none"
                ? t("不提供", "None")
                : r.portfolio.mode === "flat"
                  ? t("明确空仓", "Flat")
                  : `${t("快照", "Snapshot")} ${r.portfolio.id ?? ""} v${r.portfolio.version ?? ""}`}
            </dd>
          </dl>
        </section>
        <section className="stack">
          <span className="eyebrow">{t("模型与版本", "Models & version")}</span>
          <dl className="kv">
            <dt>{t("快速层", "Quick tier")}</dt>
            <dd>
              {String(c.quick_think_provider)} · <span className="mono">{String(c.quick_think_llm)}</span>
            </dd>
            <dt>{t("深度层", "Deep tier")}</dt>
            <dd>
              {String(c.deep_think_provider)} · <span className="mono">{String(c.deep_think_llm)}</span>
            </dd>
            {c.backend_url ? (
              <>
                <dt>{t("端点", "Endpoint")}</dt>
                <dd className="mono small">{String(c.backend_url)}</dd>
              </>
            ) : null}
            {c.openai_reasoning_effort ? (
              <>
                <dt>{t("推理强度", "Reasoning effort")}</dt>
                <dd>{String(c.openai_reasoning_effort)}</dd>
              </>
            ) : null}
            <dt>{t("设置版本", "Settings")}</dt>
            <dd>revision {run.settings_revision ?? 0}</dd>
            <dt>TradingAgents</dt>
            <dd className="mono">{String(c.version)}</dd>
            {run.stats && (
              <>
                <dt>{t("调用统计", "Usage")}</dt>
                <dd className="num">
                  {t("模型", "models")} {run.stats.llm_calls} · {t("工具", "tools")} {run.stats.tool_calls} · tokens {formatNumber(run.stats.tokens_in, 0)} /{" "}
                  {formatNumber(run.stats.tokens_out, 0)}
                </dd>
              </>
            )}
          </dl>
        </section>
      </div>
      <section className="stack">
        <span className="eyebrow">{t("数据来源", "Data sources")}</span>
        <dl className="kv small">
          {Object.entries(vendors).map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt className="mono">{k}</dt>
              <dd className="mono">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function DiagnosticsDrawer({
  open,
  onClose,
  run,
  issues,
}: {
  open: boolean;
  onClose: () => void;
  run: RunDetail;
  issues: RunEvent[];
}) {
  const toast = useToast();
  const items = issues.slice(-100);
  const copy = () => {
    const detail = { run_id: run.id, status: run.status, error: run.error, issues: items };
    navigator.clipboard.writeText(JSON.stringify(detail, null, 2)).then(() => toast(t("脱敏详情已复制", "Redacted details copied")));
  };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("诊断", "Diagnostics")}
      footer={
        <>
          <span className="small t3">
            <span className="mono">{run.id}</span>
          </span>
          <Button size="sm" style={{ marginLeft: "auto" }} icon={<Copy size={14} />} onClick={copy}>
            {t("复制脱敏详情", "Copy redacted details")}
          </Button>
        </>
      }
    >
      {run.error && (
        <section className="stack" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
            <AlertTriangle size={15} style={{ marginTop: 3, flex: "none" }} className="danger-text" />
            <strong style={{ fontWeight: 600 }}>{pickMessage(run.error)}</strong>
          </div>
          <span className="tag tag-mono" style={{ alignSelf: "flex-start" }}>
            {run.error.code}
          </span>
          <dl className="kv small">
            <dt>{t("阶段", "Stage")}</dt>
            <dd>{stageLabel(run.error.stage) || "—"}</dd>
            <dt>{t("可重试", "Retryable")}</dt>
            <dd>{run.error.retryable ? t("是", "Yes") : t("否", "No")}</dd>
            <dt>{t("结束于", "Ended")}</dt>
            <dd>{formatStamp(run.finished_at)}</dd>
          </dl>
          {run.error.details && (
            <p className="small t2" style={{ wordBreak: "break-word" }}>
              {pickMessage(run.error, "details")}
            </p>
          )}
          {run.error.traceback && (
            <pre className="mono micro t2" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 280, overflow: "auto" }}>
              {run.error.traceback}
            </pre>
          )}
        </section>
      )}
      {!run.error && items.length === 0 && <p className="small t3">{t("没有警告或错误。", "No warnings or errors.")}</p>}
      {items.map((e, i) => (
        <section
          key={e.sequence}
          className="stack"
          style={{ gap: 10, paddingTop: i || run.error ? 20 : 0, borderTop: i || run.error ? "1px solid var(--line)" : 0 }}
        >
          <div className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
            <AlertTriangle size={15} style={{ marginTop: 3, flex: "none" }} className={e.severity === "error" ? "danger-text" : "caution-text"} />
            <strong style={{ fontWeight: 600, wordBreak: "break-word" }}>{describe(e) || typeLabel(e.type)}</strong>
          </div>
          <dl className="kv small">
            <dt>{t("时间", "Time")}</dt>
            <dd className="num">{formatClock(e.timestamp)}</dd>
            <dt>{t("阶段", "Stage")}</dt>
            <dd>{stageLabel(e.stage) || "—"}</dd>
            <dt>{t("类型", "Type")}</dt>
            <dd className="mono">{e.type}</dd>
            {e.payload.source ? (
              <>
                <dt>{t("来源", "Source")}</dt>
                <dd className="mono">{String(e.payload.source)}</dd>
              </>
            ) : null}
          </dl>
        </section>
      ))}
    </Drawer>
  );
}
