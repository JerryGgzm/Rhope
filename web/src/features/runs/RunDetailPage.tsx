import {
  AlertTriangle,
  ArrowDown,
  Bug,
  ChevronDown,
  Clock,
  Copy,
  Download,
  FileText,
  Pencil,
  RotateCcw,
  Square,
  WifiOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Topbar } from "../../app/Shell";
import { Drawer } from "../../components/Drawer";
import { Markdown } from "../../components/Markdown";
import { ResearchTrack } from "../../components/ResearchTrack";
import { ActionBadge, Banner, Metric, RatingBlock, StatusBadge, Tabs } from "../../components/ui";
import { ANALYSTS, formatDuration, type RunStatus } from "../../lib/labels";
import {
  demoDebate,
  demoDecision,
  demoEvents,
  demoReports,
  demoTrack,
  type DemoRunState,
} from "../../demo/fixtures";

type TabKey = "decision" | "reports" | "debate" | "log" | "inputs";

const STATE_BY_ID: Record<string, DemoRunState> = {
  "demo-running": "running",
  "demo-completed": "completed",
  "demo-failed": "failed",
};

const STATUS_BY_STATE: Record<DemoRunState, RunStatus> = {
  running: "running",
  completed: "completed_with_warnings",
  failed: "failed",
};

export function RunDetailPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const state: DemoRunState = (params.get("demo") as DemoRunState) || STATE_BY_ID[id] || "completed";
  const status = STATUS_BY_STATE[state];
  const [tab, setTab] = useState<TabKey>(state === "running" ? "reports" : "decision");
  const [diag, setDiag] = useState(false);
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => setTab(state === "running" ? "reports" : "decision"), [state]);

  return (
    <>
      <Topbar
        title="运行详情"
        crumb={<span className="mono">{id}</span>}
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setDiag(true)}>
              <Bug size={15} /> 诊断 <span className="badge badge-warn" style={{ height: 18 }}>3</span>
            </button>
          </>
        }
      />
      <div className="page">
        <div className="row" role="group" aria-label="演示状态切换">
          <span className="demo-tag">演示状态</span>
          {(["running", "completed", "failed"] as DemoRunState[]).map((s) => (
            <button
              key={s}
              className="btn btn-sm"
              aria-pressed={s === state}
              style={s === state ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
              onClick={() => setParams({ demo: s })}
            >
              {{ running: "运行中", completed: "已完成", failed: "失败" }[s]}
            </button>
          ))}
          <button className="btn btn-sm btn-ghost" onClick={() => setDisconnected((d) => !d)}>
            <WifiOff size={14} /> 模拟断线
          </button>
        </div>

        {disconnected && (
          <Banner kind="warn" title="与服务连接断开，后台状态待确认。" actions={<button className="btn btn-sm">立即重连</button>}>
            分析仍可能在后台运行，重连后会补齐期间的事件。不会重新启动任务。
          </Banner>
        )}

        <section className="panel">
          <div className="panel-body stack" style={{ gap: 20 }}>
            <div className="row-between" style={{ alignItems: "flex-start" }}>
              <div className="stack-sm">
                <div className="row" style={{ gap: 12 }}>
                  <h2 style={{ fontSize: 28 }} className="mono">
                    DEMO
                  </h2>
                  <span className="muted">演示公司（示例名称）</span>
                  <StatusBadge status={status} />
                  <span className="demo-tag">演示数据</span>
                </div>
                <div className="row aux" style={{ gap: 16 }}>
                  <span>
                    分析日期 <strong className="num" style={{ color: "var(--text)" }}>2026-11-06</strong>
                  </span>
                  <span>
                    实际运行 <span className="num">2026-11-08 20:14</span>
                  </span>
                  <span>股票</span>
                  <span>
                    <Clock size={12} style={{ verticalAlign: -1 }} aria-hidden /> 已用时{" "}
                    {formatDuration(state === "running" ? 98 : 560)}
                  </span>
                </div>
              </div>
              <div className="row">
                {state === "running" ? (
                  <button className="btn btn-danger btn-sm">
                    <Square size={13} /> 请求停止
                  </button>
                ) : (
                  <>
                    <Link to="/analysis" className="btn btn-sm">
                      <Pencil size={14} /> 返回编辑参数
                    </Link>
                    <button className="btn btn-sm">
                      <RotateCcw size={14} /> 以相同输入重新运行
                    </button>
                  </>
                )}
              </div>
            </div>
            <ResearchTrack model={demoTrack[state]} />
            {state === "running" && (
              <div className="aux">当前阶段：分析师（3 位并行）· 无法可靠估计总时长，因此不显示百分比。</div>
            )}
          </div>
        </section>

        {state === "failed" && (
          <Banner
            kind="error"
            title="交易员阶段失败：模型调用超时（已重试 3 次）。"
            actions={
              <>
                <button className="btn btn-sm" onClick={() => setDiag(true)}>
                  查看诊断
                </button>
                <button className="btn btn-sm">从断点继续</button>
              </>
            }
          >
            已完成的 3 份分析师报告和研究经理方案仍可阅读。
          </Banner>
        )}
        {state === "completed" && (
          <Banner kind="warn" title="部分完成：有 2 项数据降级。">
            新闻主数据源限流后切换到备用来源；基本面在所选日期没有可用申报。
            <button className="btn btn-ghost btn-sm" onClick={() => setDiag(true)} style={{ marginLeft: 4 }}>
              详情
            </button>
          </Banner>
        )}

        <section className="panel">
          <div style={{ padding: "0 12px" }}>
            <Tabs<TabKey>
              label="运行内容"
              value={tab}
              onChange={setTab}
              tabs={[
                { key: "decision", label: "结论" },
                { key: "reports", label: "分析报告", count: state === "running" ? 2 : 3 },
                { key: "debate", label: "研究与风控" },
                { key: "log", label: "运行记录", count: demoEvents.length },
                { key: "inputs", label: "本次输入" },
              ]}
            />
          </div>
          <div className="tab-panel" key={tab}>
            {tab === "decision" && <DecisionTab state={state} />}
            {tab === "reports" && <ReportsTab />}
            {tab === "debate" && <DebateTab state={state} />}
            {tab === "log" && <LogTab live={state === "running"} />}
            {tab === "inputs" && <InputsTab />}
          </div>
        </section>
      </div>

      <DiagnosticsDrawer open={diag} onClose={() => setDiag(false)} />
    </>
  );
}

function DecisionTab({ state }: { state: DemoRunState }) {
  if (state !== "completed") {
    return (
      <div className="panel-body">
        <div className="empty" style={{ padding: "40px 0" }}>
          <h3>{state === "running" ? "最终决策尚未生成" : "未能生成最终决策"}</h3>
          <p>
            {state === "running"
              ? "投资组合经理会在风险讨论结束后给出评级。已完成的分析师报告可以先在“分析报告”中阅读。"
              : "运行在交易员阶段失败，没有最终评级。这不等同于“持有”。"}
          </p>
        </div>
      </div>
    );
  }
  const d = demoDecision;
  return (
    <div className="panel-body stack" style={{ gap: 24 }}>
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <RatingBlock rating={d.rating} source="最终评级 · 投资组合经理" />
        <div className="row">
          <button className="btn btn-sm">
            <Copy size={14} /> 复制结论
          </button>
          <ExportMenu />
        </div>
      </div>

      <div className="grid-2">
        <Metric label="目标价" value={d.priceTarget} />
        <Metric label="时间范围" value={d.timeHorizon} hint="AI 建议的持有期，与复盘计分窗口无关" />
      </div>

      <div className="stack-sm">
        <span className="section-label">执行摘要</span>
        <Markdown text={d.summary} />
      </div>
      <div className="stack-sm">
        <span className="section-label">投资论点</span>
        <Markdown text={d.thesis} />
      </div>

      <hr className="divider" />

      <div className="panel raised" style={{ padding: 20 }}>
        <div className="row-between">
          <div className="row">
            <strong style={{ fontSize: 15 }}>交易员方案</strong>
            <ActionBadge action={d.trader} />
          </div>
          <span className="aux">来自交易员 · 与最终评级相互独立</span>
        </div>
        <div className="grid-3" style={{ marginTop: 14 }}>
          <Metric label="入场价" value={d.entry} />
          <Metric label="止损" value={d.stop} />
          <Metric label="仓位建议" value={d.sizing} />
        </div>
        <p className="muted" style={{ marginTop: 14, fontSize: 14.5, lineHeight: 1.75 }}>
          {d.traderReasoning}
        </p>
      </div>

      <div className="aux">
        这是研究建议，不是交易指令。页面只展示代理生成的消息、工具事件和报告，不包含模型内部隐藏推理。
      </div>
    </div>
  );
}

function ExportMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button className="btn btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Download size={14} /> 导出 <ChevronDown size={13} />
      </button>
      {open && (
        <div
          className="panel glass"
          role="menu"
          style={{ position: "absolute", right: 0, top: 36, zIndex: 10, minWidth: 200, padding: 6 }}
        >
          {["Markdown 完整报告", "HTML 完整报告", "运行 JSON", "全部报告 ZIP"].map((l) => (
            <button key={l} role="menuitem" className="btn btn-ghost btn-sm btn-block" style={{ justifyContent: "flex-start" }}>
              <FileText size={14} /> {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const REPORT_STATUS_TEXT = {
  ready: { label: "已生成", cls: "badge-pos" },
  running: { label: "生成中", cls: "badge-accent" },
  skipped: { label: "未选择", cls: "" },
  failed: { label: "失败", cls: "badge-neg" },
  nodata: { label: "无可用数据", cls: "badge-warn" },
} as const;

function ReportsTab() {
  return (
    <div className="panel-body stack">
      {ANALYSTS.map((a, i) => {
        const r = demoReports[a.key];
        const s = REPORT_STATUS_TEXT[r.status];
        return (
          <details className="section-card" key={a.key} open={i === 0}>
            <summary>
              {a.label}分析师
              <span className={`badge ${s.cls}`}>{s.label}</span>
              {r.note && r.status === "ready" && (
                <span className="badge badge-warn">
                  <AlertTriangle size={11} /> 有降级
                </span>
              )}
              <ChevronDown size={16} className="chev" aria-hidden />
            </summary>
            <div className="section-content stack">
              {r.note && <Banner kind={r.status === "ready" ? "warn" : r.status === "nodata" ? "info" : "info"}>{r.note}</Banner>}
              {r.text && <Markdown text={r.text} />}
              {r.status === "running" && (
                <div className="stack-sm">
                  <div className="skeleton" style={{ height: 14, width: "70%" }} />
                  <div className="skeleton" style={{ height: 14, width: "90%" }} />
                  <div className="skeleton" style={{ height: 14, width: "55%" }} />
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function DebateTab({ state }: { state: DemoRunState }) {
  if (state === "running") {
    return (
      <div className="panel-body">
        <div className="empty" style={{ padding: "40px 0" }}>
          <h3>研究辩论尚未开始</h3>
          <p>分析师报告全部完成后，多空研究员会开始辩论。</p>
        </div>
      </div>
    );
  }
  return (
    <div className="panel-body stack">
      <span className="section-label">多空研究 · 第 1 轮</span>
      <div className="grid-2">
        <div className="panel raised panel-pad stack-sm">
          <span className="badge badge-pos" style={{ alignSelf: "flex-start" }}>
            多方研究员
          </span>
          <p className="muted" style={{ lineHeight: 1.75 }}>
            {demoDebate.bull}
          </p>
        </div>
        <div className="panel raised panel-pad stack-sm">
          <span className="badge badge-neg" style={{ alignSelf: "flex-start" }}>
            空方研究员
          </span>
          <p className="muted" style={{ lineHeight: 1.75 }}>
            {demoDebate.bear}
          </p>
        </div>
      </div>
      <details className="section-card" open>
        <summary>
          研究经理方案
          <ChevronDown size={16} className="chev" aria-hidden />
        </summary>
        <div className="section-content">
          <Markdown text={demoDebate.manager} />
        </div>
      </details>
      {state === "completed" && (
        <>
          <span className="section-label" style={{ marginTop: 8 }}>
            风险讨论 · 第 1 轮
          </span>
          <div className="grid-3">
            {demoDebate.risk.map((r) => (
              <div className="panel raised panel-pad stack-sm" key={r.role}>
                <span className="badge" style={{ alignSelf: "flex-start" }}>
                  {r.role}
                </span>
                <p className="muted" style={{ lineHeight: 1.75 }}>
                  {r.text}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LogTab({ live }: { live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [sev, setSev] = useState<string>("all");
  const rows = demoEvents.filter((e) => sev === "all" || e.sev === sev);

  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [follow, rows.length]);

  return (
    <div>
      <div className="row" style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
        <select className="select" style={{ width: 150 }} value={sev} onChange={(e) => setSev(e.target.value)} aria-label="按级别筛选">
          <option value="all">全部级别</option>
          <option value="info">信息</option>
          <option value="ok">完成</option>
          <option value="warning">警告</option>
          <option value="error">错误</option>
        </select>
        <select className="select" style={{ width: 150 }} aria-label="按代理筛选">
          <option>全部代理</option>
        </select>
        <select className="select" style={{ width: 150 }} aria-label="按工具筛选">
          <option>全部工具</option>
        </select>
        {live && (
          <span className="badge badge-accent" style={{ marginLeft: "auto" }}>
            <span className="status-dot live" /> 实时
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
        {rows.map((e, i) => (
          <div className="log-row" key={i}>
            <span className="t">{e.t}</span>
            <span className={`sev-${e.sev}`} aria-label={e.sev}>
              {e.sev === "warning" || e.sev === "error" ? <AlertTriangle size={14} /> : "●"}
            </span>
            <span className="who">{e.agent}</span>
            <span className="what">
              <span className="mono faint" style={{ marginRight: 8 }}>
                {e.type}
              </span>
              {e.text}
            </span>
            <span className="dur faint num">{e.dur ?? ""}</span>
          </div>
        ))}
        {!follow && live && (
          <div className="new-msgs">
            <button className="btn btn-sm btn-primary" onClick={() => setFollow(true)}>
              <ArrowDown size={14} /> 有新消息
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InputsTab() {
  return (
    <div className="panel-body stack">
      <Banner kind="info">以下参数在任务启动时已固定，之后修改设置不会影响本次运行。</Banner>
      <div className="grid-2">
        <div className="panel raised panel-pad">
          <span className="section-label">请求</span>
          <dl className="kv" style={{ marginTop: 10 }}>
            <dt>原始输入</dt>
            <dd className="mono">demo</dd>
            <dt>规范代码</dt>
            <dd className="mono">DEMO</dd>
            <dt>资产类型</dt>
            <dd>股票</dd>
            <dt>分析师</dt>
            <dd>技术、情绪、新闻、基本面</dd>
            <dt>轮数</dt>
            <dd>辩论 1 · 风控 1</dd>
            <dt>断点恢复</dt>
            <dd>关闭</dd>
          </dl>
        </div>
        <div className="panel raised panel-pad">
          <span className="section-label">模型与版本</span>
          <dl className="kv" style={{ marginTop: 10 }}>
            <dt>快速层</dt>
            <dd>
              openai · <span className="mono">gpt-5.4-mini</span>
            </dd>
            <dt>深度层</dt>
            <dd>
              openai · <span className="mono">gpt-5.4</span>
            </dd>
            <dt>设置 revision</dt>
            <dd>3</dd>
            <dt>TradingAgents</dt>
            <dd className="mono">0.7.1</dd>
            <dt>持仓快照</dt>
            <dd>主账户 v3（2026-11-01）</dd>
            <dt>数据来源</dt>
            <dd className="mono">core_stock_apis=yfinance · news_data=alpha_vantage,yfinance</dd>
          </dl>
        </div>
      </div>
      <div className="aux">
        <span className="demo-tag">演示</span> 有效配置快照已脱敏，不包含任何密钥。
      </div>
    </div>
  );
}

function DiagnosticsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const items = [
    {
      code: "VENDOR_RATE_LIMITED",
      sev: "warning",
      title: "新闻主数据源限流，已切换",
      meta: [
        ["时间", "20:14:09"],
        ["阶段", "分析师 · 新闻"],
        ["工具", "get_news"],
        ["来源", "alpha_vantage → yfinance"],
        ["可重试", "是"],
      ],
      detail: "上游返回 429 Too Many Requests；已尝试下一个已配置来源。",
    },
    {
      code: "NO_DATA_AVAILABLE",
      sev: "info",
      title: "基本面：所选日期没有可用申报",
      meta: [
        ["时间", "20:14:14"],
        ["阶段", "分析师 · 基本面"],
        ["工具", "get_balance_sheet"],
        ["来源", "sec_edgar"],
        ["可重试", "否"],
      ],
      detail: "点时数据约束：分析日期之前没有已公开的季度申报。",
    },
    {
      code: "PROVIDER_TIMEOUT",
      sev: "error",
      title: "交易员模型调用超时",
      meta: [
        ["时间", "20:19:41"],
        ["阶段", "交易方案"],
        ["Provider", "openai · gpt-5.4"],
        ["请求 ID", "req_demo_8f2c"],
        ["可重试", "是"],
      ],
      detail: "请求在 120 秒后超时，已按 llm_max_retries 重试 3 次。",
    },
  ];
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="诊断"
      icon={<Bug size={18} style={{ color: "var(--accent)" }} />}
      footer={
        <>
          <span className="aux">
            运行 ID <span className="mono">demo-completed</span>
          </span>
          <button className="btn btn-sm" style={{ marginLeft: "auto" }}>
            <Copy size={14} /> 复制脱敏详情
          </button>
        </>
      }
    >
      <span className="demo-tag" style={{ alignSelf: "flex-start" }}>
        演示数据
      </span>
      {items.map((it) => (
        <div key={it.code} className={`banner banner-${it.sev === "error" ? "error" : it.sev === "warning" ? "warn" : "info"}`} style={{ flexDirection: "column", gap: 8 }}>
          <div className="row-between" style={{ width: "100%" }}>
            <strong>{it.title}</strong>
            <span className="mono aux">{it.code}</span>
          </div>
          <dl className="kv" style={{ width: "100%" }}>
            {it.meta.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="muted" style={{ fontSize: 13.5 }}>
            {it.detail}
          </p>
        </div>
      ))}
    </Drawer>
  );
}
