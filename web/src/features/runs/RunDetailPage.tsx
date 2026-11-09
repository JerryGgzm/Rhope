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

type TabKey = "decision" | "reports" | "debate" | "log" | "inputs";

const ACTIVE = new Set(["queued", "running", "cancelling"]);

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

const SETTINGS_FIXABLE = new Set(["PROVIDER_AUTH_FAILED", "MODEL_NOT_FOUND"]);

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
      detail: state === "failed" ? (run.status === "interrupted" ? "已中断" : "失败") : undefined,
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
  const { id = "" } = useParams();
  const run = useRun(id);
  const { events, state: stream } = useRunEvents(id);

  if (run.isError) {
    const notFound = run.error instanceof ApiError && run.error.status === 404;
    return (
      <Empty
        title={notFound ? "找不到这次运行" : "无法读取这次运行"}
        action={
          <Link to="/runs" className="btn btn-sm">
            返回历史
          </Link>
        }
      >
        {notFound ? "它可能来自另一个数据目录。" : errorText(run.error)}
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
          toast("已创建新的运行");
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
          历史
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
                分析日期 <span className="num" style={{ color: "var(--text)" }}>{run.analysis_date}</span>
              </span>
              <span className="num">运行于 {formatStamp(run.started_at ?? run.created_at)}</span>
              {elapsed != null && <span className="num">用时 {formatDuration(elapsed)}</span>}
            </div>
          </div>
          <div className="row">
            {active ? (
              run.status === "cancelling" ? (
                <Button variant="danger" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate(true)}>
                  强制终止
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  loading={cancel.isPending}
                  icon={<Square size={12} />}
                  onClick={() => cancel.mutate(false, { onError: (e) => toast(errorText(e)) })}
                >
                  {run.status === "queued" ? "取消排队" : "请求停止"}
                </Button>
              )
            ) : (
              <>
                <Button size="sm" icon={<Pencil size={14} />} onClick={editParams}>
                  编辑参数
                </Button>
                <Button size="sm" variant="solid" icon={<RotateCcw size={14} />} loading={rerun.isPending} onClick={doRerun}>
                  重新运行
                </Button>
              </>
            )}
            <Menu
              trigger={({ toggle, ref, open }) => (
                <Button
                  ref={ref}
                  size="sm"
                  variant="ghost"
                  aria-label="更多操作"
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
                    诊断 <span className="t3">{issues.length} 项</span>
                  </button>
                  <button
                    className="menu-item"
                    role="menuitem"
                    onClick={() => {
                      close();
                      navigator.clipboard.writeText(run.id).then(() => toast("运行 ID 已复制"));
                    }}
                  >
                    复制运行 ID
                  </button>
                </>
              )}
            </Menu>
          </div>
        </div>

        <ResearchTrack model={trackModel(run)} />
        {run.status === "running" && (
          <p className="small t3">分析师并行运行中。总时长无法可靠估计，因此不显示百分比。</p>
        )}
        {run.status === "queued" && <p className="small t3">排队中：轮到这次运行时自动开始，一次只运行一个分析。</p>}
      </header>

      <div style={{ marginBottom: 8 }}>
        {stream === "lost" && active && (
          <Notice kind="warn" title="与服务的连接已断开，后台状态待确认。">
            分析可能仍在后台运行；重连后会补齐期间的事件，不会重新启动任务。
          </Notice>
        )}
        {run.status === "cancelling" && (
          <Notice kind="warn" title="正在停止。">
            进行中的模型调用结束后进程退出，期间仍可能计费。需要立即结束可“强制终止”。
          </Notice>
        )}
        {run.status === "failed" && run.error && (
          <Notice
            kind="error"
            title={`${run.error.stage ? stageLabel(run.error.stage) + "阶段" : ""}失败：${run.error.message}`}
            actions={
              <>
                {SETTINGS_FIXABLE.has(run.error.code) && (
                  <Link to="/settings" className="btn btn-sm">
                    前往设置
                  </Link>
                )}
                <Button size="sm" variant="ghost" onClick={() => setDiag(true)}>
                  诊断
                </Button>
              </>
            }
          >
            {Object.values(s).some(Boolean) && "已完成的报告仍可阅读。"}
            <span className="mono t3">{run.error.code}</span>
          </Notice>
        )}
        {run.status === "interrupted" && (
          <Notice kind="warn" title="运行被中断。">
            服务重启或进程意外退出。已完成的报告保留；开启断点恢复的运行可用相同输入重新运行以继续。
          </Notice>
        )}
        {run.status === "cancelled" && <Notice kind="info" title="已取消。">已完成的报告保留。</Notice>}
        {run.rating === "REVIEW" && (
          <Notice kind="warn" title="需复核。">
            无法从最终决策中读出评级，本次记录为“需复核”，不是持有或任何交易建议。请阅读决策原文自行判断。
          </Notice>
        )}
        {run.status === "completed_with_warnings" && issues.length > 0 && (
          <Notice
            kind="warn"
            title={`${issues.length} 项警告。`}
            actions={
              <Button size="sm" variant="ghost" onClick={() => setDiag(true)}>
                查看
              </Button>
            }
          >
            {String(issues[0].payload.message ?? issues[0].payload.preview ?? issues[0].type).slice(0, 120)}
          </Notice>
        )}
        {run.memory_note && (
          <Notice kind="info" title="决策日志：">
            {run.memory_note}
          </Notice>
        )}
      </div>

      <Tabs<TabKey>
        label="运行内容"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "decision", label: "结论" },
          { key: "reports", label: "分析报告", count: reportsDone },
          { key: "debate", label: "研究与风控" },
          { key: "log", label: "运行记录", count: events.length },
          { key: "inputs", label: "本次输入" },
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
    report_md: ["Markdown 报告", ".md"],
    report_html: ["HTML 报告", ".html"],
    state: ["运行数据", ".json"],
    report_zip: ["全部报告", ".zip"],
  };
  if (!run.artifacts.length) return null;
  const html = run.artifacts.find((a) => a.kind === "report_html");
  return (
    <Menu
      align="end"
      trigger={({ toggle, ref, open }) => (
        <Button ref={ref} size="sm" aria-haspopup="menu" aria-expanded={open} onClick={toggle} icon={<Download size={14} />}>
          导出 <ChevronDown size={13} />
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
                在新标签页查看 HTML
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
      return <Empty title="最终决策尚未生成">投资组合经理会在风险讨论结束后给出评级。已完成的分析师报告可以先在“分析报告”中阅读。</Empty>;
    }
    return <Empty title="没有最终评级">这次运行没有产生最终决策。没有评级不等于“持有”。</Empty>;
  }
  return (
    <div className="stack-xl">
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        {isRating(run.rating) ? (
          <RatingHero rating={run.rating} source="最终评级 · 投资组合经理" />
        ) : (
          <span className="t2">评级尚未记录</span>
        )}
        <div className="row">
          <Button
            size="sm"
            variant="ghost"
            icon={<Copy size={14} />}
            onClick={() => navigator.clipboard.writeText(decision).then(() => toast("结论已复制"))}
          >
            复制
          </Button>
          <ExportMenu run={run} />
        </div>
      </div>

      <section className="stack" style={{ gap: 10 }}>
        <span className="eyebrow">投资组合经理决策</span>
        <Markdown text={decision} />
      </section>

      {trader && (
        <>
          <hr className="hr" />
          <section className="stack" style={{ gap: 10 }}>
            <div className="row-between">
              <h2 className="section-title">交易员方案</h2>
              <span className="small t3">来自交易员，独立于最终评级</span>
            </div>
            <Markdown text={trader} />
          </section>
        </>
      )}

      <p className="small t3">研究建议，不是交易指令。页面只展示代理生成的消息、工具事件与报告，不包含模型内部推理。</p>
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
        const state = !selected ? "未选择" : text ? "已生成" : working ? "生成中" : active ? "等待" : "未生成";
        return (
          <Disclosure
            key={a.key}
            defaultOpen={i === 0 && !!text}
            title={`${a.label}分析`}
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
              <p className="small t3">本次没有选择这位分析师。</p>
            ) : !working && active ? (
              <p className="small t3">分析师开始后，报告会在这里逐步出现。</p>
            ) : working ? (
              <div className="stack-sm" style={{ maxWidth: 560, gap: 10 }}>
                <div className="skeleton" style={{ height: 12, width: "72%" }} />
                <div className="skeleton" style={{ height: 12, width: "94%" }} />
                <div className="skeleton" style={{ height: 12, width: "58%" }} />
              </div>
            ) : (
              <p className="small t3">运行结束前这份报告没有生成。</p>
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
      <Empty title="研究辩论尚未开始">分析师报告全部完成后，多空研究员会开始辩论。</Empty>
    ) : (
      <Empty title="没有研究与风控内容">这次运行在辩论开始前结束。</Empty>
    );
  }
  return (
    <div style={{ marginTop: -16 }}>
      {parts.map(([k, text], i) => (
        <Disclosure key={k} title={SECTION_LABEL[k]} defaultOpen={i === 0} meta={<span className="small t3">{formatNumber(text.length, 0)} 字</span>}>
          <Markdown text={text} />
        </Disclosure>
      ))}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  queued: "排队",
  "run.started": "开始",
  "run.finalizing": "收尾",
  "run.completed": "完成",
  "run.failed": "失败",
  "run.cancelled": "取消",
  "run.cancelling": "停止中",
  "run.interrupted": "中断",
  "stage.started": "阶段开始",
  "stage.completed": "阶段完成",
  "agent.started": "开始",
  "agent.completed": "完成",
  message: "消息",
  "tool.started": "工具",
  "tool.completed": "返回",
  "tool.failed": "工具失败",
  "report.updated": "报告",
  "stats.updated": "统计",
  warning: "警告",
  checkpoint: "断点",
  "artifact.saved": "已保存",
  "artifact.failed": "保存失败",
};

function describe(e: RunEvent): string {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case "queued":
      return `排队第 ${p.position ?? "?"} 位`;
    case "run.started":
      return `进程 ${p.pid} · ${p.ticker} · ${p.analysis_date}`;
    case "stage.started":
    case "stage.completed":
      return stageLabel(e.stage);
    case "agent.started":
    case "agent.completed":
      return `${analystLabel(e.agent ?? "")}分析师`;
    case "tool.started":
      return `${p.tool}(${String(p.args ?? "")})`;
    case "tool.completed":
    case "tool.failed":
      return `${p.tool} · ${formatNumber(p.chars as number, 0)} 字符${p.code ? ` · ${p.code}` : ""}${p.preview ? ` — ${String(p.preview).slice(0, 160)}` : ""}`;
    case "report.updated":
      return `${SECTION_LABEL[p.section as string] ?? p.section} · ${formatNumber(p.chars as number, 0)} 字`;
    case "stats.updated":
      return `模型调用 ${p.llm_calls} · 工具 ${p.tool_calls} · 输入 ${formatNumber(p.tokens_in as number, 0)} / 输出 ${formatNumber(p.tokens_out as number, 0)} tokens`;
    case "message":
      return String(p.text ?? "")
        .replace(/[*_`#>]+/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 280);
    case "checkpoint":
      return p.resuming ? "从保存的断点继续" : "全新开始（断点已开启）";
    case "run.completed":
      return `${p.rating ?? "无评级"}`;
    case "run.failed":
    case "artifact.failed":
      return `${p.message ?? ""} ${p.code ? `(${p.code})` : ""}`;
    default:
      return String(p.message ?? "");
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
        <div className="pills" role="group" aria-label="筛选">
          {(
            [
              ["all", "全部"],
              ["tools", "工具"],
              ["warning", "警告与错误"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className="pill" aria-pressed={sev === k} onClick={() => setSev(k)}>
              {l}
            </button>
          ))}
        </div>
        {live && (
          <span className="status">
            <span className="dot" data-tone="active" aria-hidden /> 实时
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
        {rows.length === 0 && <p className="small t3" style={{ padding: "16px 0" }}>没有符合条件的事件。</p>}
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
            <span className="who">{e.agent ? analystLabel(e.agent) : stageLabel(e.stage) || "系统"}</span>
            <span className="what">
              <span className="type">{e.payload?.fallback ? "切换数据源" : (TYPE_LABEL[e.type] ?? e.type)}</span>
              {describe(e)}
            </span>
            <span className="dur" />
          </div>
        ))}
        {!follow && live && (
          <div className="jump">
            <Button size="sm" variant="solid" icon={<ArrowDown size={14} />} onClick={() => setFollow(true)}>
              有新消息
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
      <p className="small t2">以下参数在任务启动时固定；之后修改设置不会影响本次运行。配置快照已脱敏，不包含密钥。</p>
      <div className="cols-2" style={{ gap: 64 }}>
        <section className="stack">
          <span className="eyebrow">请求</span>
          <dl className="kv">
            <dt>代码</dt>
            <dd className="mono">{r.ticker}</dd>
            <dt>资产类型</dt>
            <dd>{ASSET_TYPE_LABEL[r.asset_type] ?? r.asset_type}</dd>
            <dt>分析日期</dt>
            <dd className="num">{r.analysis_date}</dd>
            <dt>分析师</dt>
            <dd>{r.analysts.map(analystLabel).join("、")}</dd>
            <dt>轮数</dt>
            <dd>
              辩论 {String(c.max_debate_rounds)} · 风控 {String(c.max_risk_discuss_rounds)}
            </dd>
            <dt>报告语言</dt>
            <dd>{String(c.output_language)}</dd>
            <dt>断点恢复</dt>
            <dd>{c.checkpoint_enabled ? "开启" : "关闭"}</dd>
            <dt>持仓</dt>
            <dd>
              {r.portfolio.mode === "none" ? "不提供" : r.portfolio.mode === "flat" ? "明确空仓" : `快照 ${r.portfolio.id ?? ""} v${r.portfolio.version ?? ""}`}
            </dd>
          </dl>
        </section>
        <section className="stack">
          <span className="eyebrow">模型与版本</span>
          <dl className="kv">
            <dt>快速层</dt>
            <dd>
              {String(c.quick_think_provider)} · <span className="mono">{String(c.quick_think_llm)}</span>
            </dd>
            <dt>深度层</dt>
            <dd>
              {String(c.deep_think_provider)} · <span className="mono">{String(c.deep_think_llm)}</span>
            </dd>
            {c.backend_url ? (
              <>
                <dt>端点</dt>
                <dd className="mono small">{String(c.backend_url)}</dd>
              </>
            ) : null}
            {c.openai_reasoning_effort ? (
              <>
                <dt>推理强度</dt>
                <dd>{String(c.openai_reasoning_effort)}</dd>
              </>
            ) : null}
            <dt>设置版本</dt>
            <dd>revision {run.settings_revision ?? 0}</dd>
            <dt>TradingAgents</dt>
            <dd className="mono">{String(c.version)}</dd>
            {run.stats && (
              <>
                <dt>调用统计</dt>
                <dd className="num">
                  模型 {run.stats.llm_calls} · 工具 {run.stats.tool_calls} · tokens {formatNumber(run.stats.tokens_in, 0)} /{" "}
                  {formatNumber(run.stats.tokens_out, 0)}
                </dd>
              </>
            )}
          </dl>
        </section>
      </div>
      <section className="stack">
        <span className="eyebrow">数据来源</span>
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
    navigator.clipboard.writeText(JSON.stringify(detail, null, 2)).then(() => toast("脱敏详情已复制"));
  };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="诊断"
      footer={
        <>
          <span className="small t3">
            <span className="mono">{run.id}</span>
          </span>
          <Button size="sm" style={{ marginLeft: "auto" }} icon={<Copy size={14} />} onClick={copy}>
            复制脱敏详情
          </Button>
        </>
      }
    >
      {run.error && (
        <section className="stack" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
            <AlertTriangle size={15} style={{ marginTop: 3, flex: "none" }} className="danger-text" />
            <strong style={{ fontWeight: 600 }}>{run.error.message}</strong>
          </div>
          <span className="tag tag-mono" style={{ alignSelf: "flex-start" }}>
            {run.error.code}
          </span>
          <dl className="kv small">
            <dt>阶段</dt>
            <dd>{stageLabel(run.error.stage) || "—"}</dd>
            <dt>可重试</dt>
            <dd>{run.error.retryable ? "是" : "否"}</dd>
            <dt>结束于</dt>
            <dd>{formatStamp(run.finished_at)}</dd>
          </dl>
          {run.error.details && <p className="small t2" style={{ wordBreak: "break-word" }}>{run.error.details}</p>}
          {run.error.traceback && (
            <pre className="mono micro t2" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 280, overflow: "auto" }}>
              {run.error.traceback}
            </pre>
          )}
        </section>
      )}
      {!run.error && items.length === 0 && <p className="small t3">没有警告或错误。</p>}
      {items.map((e, i) => (
        <section
          key={e.sequence}
          className="stack"
          style={{ gap: 10, paddingTop: i || run.error ? 20 : 0, borderTop: i || run.error ? "1px solid var(--line)" : 0 }}
        >
          <div className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
            <AlertTriangle size={15} style={{ marginTop: 3, flex: "none" }} className={e.severity === "error" ? "danger-text" : "caution-text"} />
            <strong style={{ fontWeight: 600, wordBreak: "break-word" }}>{describe(e) || TYPE_LABEL[e.type] || e.type}</strong>
          </div>
          <dl className="kv small">
            <dt>时间</dt>
            <dd className="num">{formatClock(e.timestamp)}</dd>
            <dt>阶段</dt>
            <dd>{stageLabel(e.stage) || "—"}</dd>
            <dt>类型</dt>
            <dd className="mono">{e.type}</dd>
            {e.payload.source ? (
              <>
                <dt>来源</dt>
                <dd className="mono">{String(e.payload.source)}</dd>
              </>
            ) : null}
          </dl>
        </section>
      ))}
    </Drawer>
  );
}
