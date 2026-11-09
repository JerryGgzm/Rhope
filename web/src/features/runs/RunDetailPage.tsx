import { AlertTriangle, ArrowDown, ChevronDown, Copy, Download, MoreHorizontal, Pencil, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Disclosure } from "../../components/Disclosure";
import { Drawer } from "../../components/Drawer";
import { Markdown } from "../../components/Markdown";
import { Menu } from "../../components/Menu";
import { ResearchTrack } from "../../components/ResearchTrack";
import { useToast } from "../../components/Toast";
import { ActionInline, Button, DemoMark, Empty, Notice, RatingHero, Segmented, Stat, Status, Tabs } from "../../components/ui";
import { ANALYSTS, formatDuration, type RunStatus } from "../../lib/labels";
import { demoDebate, demoDecision, demoEvents, demoReports, demoTrack, type DemoRunState } from "../../demo/fixtures";

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
  const [stopping, setStopping] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    setTab(state === "running" ? "reports" : "decision");
    setStopping(false);
  }, [state]);

  return (
    <>
      <div className="row-between" style={{ marginBottom: 28 }}>
        <div className="row small t3" style={{ gap: 10 }}>
          <Link to="/runs" className="text-link t2">
            历史
          </Link>
          <span>/</span>
          <span className="mono">{id}</span>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <DemoMark>演示状态</DemoMark>
          <div style={{ width: 240 }}>
            <Segmented
              label="演示状态"
              value={state}
              onChange={(s) => setParams({ demo: s })}
              options={[
                { value: "running", label: "运行中" },
                { value: "completed", label: "完成" },
                { value: "failed", label: "失败" },
              ]}
            />
          </div>
          <Button size="sm" variant="ghost" onClick={() => setDisconnected((d) => !d)}>
            {disconnected ? "恢复连接" : "模拟断线"}
          </Button>
        </div>
      </div>

      <header className="stack-lg" style={{ marginBottom: 48 }}>
        <div className="row-between" style={{ alignItems: "flex-end" }}>
          <div className="stack-sm" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 16, alignItems: "baseline" }}>
              <h1 className="serif" style={{ fontSize: 56, lineHeight: 1, fontWeight: 400 }}>
                DEMO
              </h1>
              <span className="t2">演示公司</span>
            </div>
            <div className="row small t2" style={{ gap: 18 }}>
              <Status status={stopping ? "cancelling" : status} />
              <span>
                分析日期 <span className="num" style={{ color: "var(--text)" }}>2026-11-06</span>
              </span>
              <span className="num">运行于 11-08 20:14</span>
              <span className="num">用时 {formatDuration(state === "running" ? 98 : 560)}</span>
            </div>
          </div>
          <div className="row">
            {state === "running" ? (
              <Button
                variant="danger"
                size="sm"
                loading={stopping}
                icon={<Square size={12} />}
                onClick={() => setStopping(true)}
              >
                请求停止
              </Button>
            ) : (
              <>
                <Button size="sm" icon={<Pencil size={14} />} onClick={() => navigate("/analysis")}>
                  编辑参数
                </Button>
                <Button
                  size="sm"
                  variant="solid"
                  icon={<RotateCcw size={14} />}
                  onClick={() => toast("已创建新的运行（演示）")}
                >
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
                    诊断 <span className="t3">3 项</span>
                  </button>
                  <button
                    className="menu-item"
                    role="menuitem"
                    onClick={() => {
                      close();
                      toast("运行 ID 已复制");
                    }}
                  >
                    复制运行 ID
                  </button>
                </>
              )}
            </Menu>
          </div>
        </div>

        <ResearchTrack model={demoTrack[state]} />
        {state === "running" && (
          <p className="small t3">分析师并行运行中。总时长无法可靠估计，因此不显示百分比。</p>
        )}
      </header>

      <div style={{ marginBottom: 8 }}>
        {disconnected && (
          <Notice
            kind="warn"
            title="与服务的连接已断开。"
            actions={
              <Button size="sm" onClick={() => setDisconnected(false)}>
                重新连接
              </Button>
            }
          >
            分析可能仍在后台运行；重连后会补齐期间的事件，不会重新启动任务。
          </Notice>
        )}
        {state === "failed" && (
          <Notice
            kind="error"
            title="交易员阶段失败：模型调用超时，已重试 3 次。"
            actions={
              <>
                <Button size="sm" variant="ghost" onClick={() => setDiag(true)}>
                  诊断
                </Button>
                <Button size="sm">从断点继续</Button>
              </>
            }
          >
            已完成的报告仍可阅读。
          </Notice>
        )}
        {state === "completed" && (
          <Notice
            kind="warn"
            title="2 项数据降级。"
            actions={
              <Button size="sm" variant="ghost" onClick={() => setDiag(true)}>
                查看
              </Button>
            }
          >
            新闻主来源限流后改用备用来源；基本面在所选日期没有可用申报。
          </Notice>
        )}
      </div>

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
      <div className="tab-panel" key={tab} role="tabpanel">
        {tab === "decision" && <DecisionTab state={state} />}
        {tab === "reports" && <ReportsTab />}
        {tab === "debate" && <DebateTab state={state} />}
        {tab === "log" && <LogTab live={state === "running"} />}
        {tab === "inputs" && <InputsTab />}
      </div>

      <DiagnosticsDrawer open={diag} onClose={() => setDiag(false)} />
    </>
  );
}

function DecisionTab({ state }: { state: DemoRunState }) {
  const toast = useToast();
  if (state !== "completed") {
    return state === "running" ? (
      <Empty title="最终决策尚未生成">投资组合经理会在风险讨论结束后给出评级。已完成的分析师报告可以先在“分析报告”中阅读。</Empty>
    ) : (
      <Empty title="没有最终评级">运行在交易员阶段失败。没有评级不等于“持有”。</Empty>
    );
  }
  const d = demoDecision;
  return (
    <div className="stack-xl">
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <RatingHero rating={d.rating} source="最终评级 · 投资组合经理" />
        <div className="row">
          <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => toast("结论已复制")}>
            复制
          </Button>
          <Menu
            trigger={({ toggle, ref, open }) => (
              <Button ref={ref} size="sm" aria-haspopup="menu" aria-expanded={open} onClick={toggle} icon={<Download size={14} />}>
                导出 <ChevronDown size={13} />
              </Button>
            )}
          >
            {(close) =>
              [
                ["Markdown", ".md"],
                ["HTML 报告", ".html"],
                ["运行数据", ".json"],
                ["全部报告", ".zip"],
              ].map(([l, ext]) => (
                <button
                  key={l}
                  className="menu-item"
                  role="menuitem"
                  onClick={() => {
                    close();
                    toast(`已开始下载 ${ext}`);
                  }}
                >
                  {l} <span className="t3 mono">{ext}</span>
                </button>
              ))
            }
          </Menu>
        </div>
      </div>

      <div className="stats" style={{ maxWidth: 560 }}>
        <Stat label="目标价" value={d.priceTarget} />
        <Stat label="时间范围" value={d.timeHorizon} hint="AI 建议的持有期" />
      </div>

      <section className="stack" style={{ gap: 10 }}>
        <span className="eyebrow">执行摘要</span>
        <Markdown text={d.summary} />
      </section>
      <section className="stack" style={{ gap: 10 }}>
        <span className="eyebrow">投资论点</span>
        <Markdown text={d.thesis} />
      </section>

      <hr className="hr" />

      <section className="stack-lg">
        <div className="row-between">
          <div className="row" style={{ gap: 14 }}>
            <h2 className="section-title">交易员方案</h2>
            <ActionInline action={d.trader} />
          </div>
          <span className="small t3">来自交易员，独立于最终评级</span>
        </div>
        <div className="stats" style={{ maxWidth: 720 }}>
          <Stat label="入场价" value={d.entry} />
          <Stat label="止损" value={d.stop} />
          <Stat label="仓位建议" value={d.sizing} />
        </div>
        <p className="t2" style={{ maxWidth: 720, lineHeight: 1.75 }}>
          {d.traderReasoning}
        </p>
      </section>

      <p className="small t3">研究建议，不是交易指令。页面只展示代理生成的消息、工具事件与报告，不包含模型内部推理。</p>
    </div>
  );
}

const REPORT_STATE = {
  ready: { label: "已生成", cls: "t3" },
  running: { label: "生成中", cls: "t2" },
  skipped: { label: "未选择", cls: "t3" },
  failed: { label: "失败", cls: "danger-text" },
  nodata: { label: "无可用数据", cls: "caution-text" },
} as const;

function ReportsTab() {
  return (
    <div style={{ marginTop: -16 }}>
      {ANALYSTS.map((a, i) => {
        const r = demoReports[a.key];
        const s = REPORT_STATE[r.status];
        return (
          <Disclosure
            key={a.key}
            defaultOpen={i === 0}
            title={`${a.label}分析`}
            meta={
              <span className="row small" style={{ gap: 10, fontWeight: 400 }}>
                {r.note && r.status === "ready" && (
                  <span className="caution-text row" style={{ gap: 4 }}>
                    <AlertTriangle size={13} /> 有降级
                  </span>
                )}
                {r.status === "running" && <span className="dot" data-tone="active" aria-hidden />}
                <span className={s.cls}>{s.label}</span>
              </span>
            }
          >
            <div className="stack">
              {r.note && <p className="small t2" style={{ maxWidth: 720 }}>{r.note}</p>}
              {r.text && <Markdown text={r.text} />}
              {r.status === "running" && (
                <div className="stack-sm" style={{ maxWidth: 560, gap: 10 }}>
                  <div className="skeleton" style={{ height: 12, width: "72%" }} />
                  <div className="skeleton" style={{ height: 12, width: "94%" }} />
                  <div className="skeleton" style={{ height: 12, width: "58%" }} />
                </div>
              )}
            </div>
          </Disclosure>
        );
      })}
    </div>
  );
}

function DebateTab({ state }: { state: DemoRunState }) {
  if (state === "running") {
    return <Empty title="研究辩论尚未开始">分析师报告全部完成后，多空研究员会开始辩论。</Empty>;
  }
  return (
    <div className="stack-xl">
      <section className="stack-lg">
        <span className="eyebrow">多空研究 · 第 1 轮</span>
        <div className="cols-2" style={{ gap: 48 }}>
          <div className="stack-sm" style={{ gap: 10 }}>
            <span className="row" style={{ gap: 6, fontWeight: 600 }}>
              多方
            </span>
            <p className="t2" style={{ lineHeight: 1.75 }}>{demoDebate.bull}</p>
          </div>
          <div className="stack-sm" style={{ gap: 10 }}>
            <span className="row" style={{ gap: 6, fontWeight: 600 }}>
              空方
            </span>
            <p className="t2" style={{ lineHeight: 1.75 }}>{demoDebate.bear}</p>
          </div>
        </div>
      </section>
      <section className="stack" style={{ gap: 10 }}>
        <span className="eyebrow">研究经理方案</span>
        <Markdown text={demoDebate.manager} />
      </section>
      {state === "completed" && (
        <section className="stack-lg">
          <span className="eyebrow">风险讨论 · 第 1 轮</span>
          <div className="cols-3" style={{ gap: 40 }}>
            {demoDebate.risk.map((r) => (
              <div className="stack-sm" style={{ gap: 10 }} key={r.role}>
                <span style={{ fontWeight: 600 }}>{r.role}</span>
                <p className="t2" style={{ lineHeight: 1.75 }}>{r.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function LogTab({ live }: { live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [sev, setSev] = useState<"all" | "warning" | "error">("all");
  const rows = demoEvents.filter((e) => sev === "all" || e.sev === sev);

  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [follow, rows.length]);

  return (
    <div className="stack">
      <div className="row-between">
        <div className="pills" role="group" aria-label="按级别筛选">
          {(
            [
              ["all", "全部"],
              ["warning", "警告"],
              ["error", "错误"],
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
        {rows.map((e, i) => (
          <div className="log-row" key={i}>
            <span className="t">{e.t}</span>
            <span className="sev" aria-label={e.sev}>
              {e.sev === "warning" ? (
                <AlertTriangle size={12} className="caution-text" />
              ) : e.sev === "error" ? (
                <AlertTriangle size={12} className="danger-text" />
              ) : (
                <span className="dot" data-tone={e.sev === "ok" ? "ok" : "muted"} style={{ width: 5, height: 5 }} />
              )}
            </span>
            <span className="who">{e.agent}</span>
            <span className="what">
              <span className="type">{e.type}</span>
              {e.text}
            </span>
            <span className="dur">{e.dur ?? ""}</span>
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

function InputsTab() {
  return (
    <div className="stack-xl">
      <p className="small t2">以下参数在任务启动时固定；之后修改设置不会影响本次运行。配置快照已脱敏，不包含密钥。</p>
      <div className="cols-2" style={{ gap: 64 }}>
        <section className="stack">
          <span className="eyebrow">请求</span>
          <dl className="kv">
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
        </section>
        <section className="stack">
          <span className="eyebrow">模型与版本</span>
          <dl className="kv">
            <dt>快速层</dt>
            <dd>
              openai · <span className="mono">gpt-5.4-mini</span>
            </dd>
            <dt>深度层</dt>
            <dd>
              openai · <span className="mono">gpt-5.4</span>
            </dd>
            <dt>设置版本</dt>
            <dd>revision 3</dd>
            <dt>TradingAgents</dt>
            <dd className="mono">0.7.1</dd>
            <dt>持仓快照</dt>
            <dd>主账户 v3 · 2026-11-01</dd>
            <dt>数据来源</dt>
            <dd className="mono small">news_data = alpha_vantage, yfinance</dd>
          </dl>
        </section>
      </div>
      <DemoMark />
    </div>
  );
}

function DiagnosticsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const items = [
    {
      code: "VENDOR_RATE_LIMITED",
      sev: "warn",
      title: "新闻主来源限流，已切换",
      meta: [
        ["时间", "20:14:09"],
        ["阶段", "分析师 · 新闻"],
        ["工具", "get_news"],
        ["来源", "alpha_vantage → yfinance"],
        ["可重试", "是"],
      ],
      detail: "上游返回 429；已尝试下一个已配置来源。",
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
      detail: "120 秒后超时，已按 llm_max_retries 重试 3 次。",
    },
  ] as const;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="诊断"
      footer={
        <>
          <span className="small t3">
            <span className="mono">demo-completed</span>
          </span>
          <Button size="sm" style={{ marginLeft: "auto" }} icon={<Copy size={14} />} onClick={() => toast("脱敏详情已复制")}>
            复制脱敏详情
          </Button>
        </>
      }
    >
      <DemoMark>演示数据</DemoMark>
      {items.map((it, i) => (
        <section key={it.code} className="stack" style={{ gap: 12, paddingTop: i ? 20 : 0, borderTop: i ? "1px solid var(--line)" : 0 }}>
          <div className="row-between" style={{ alignItems: "flex-start" }}>
            <div className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
              <AlertTriangle
                size={15}
                style={{ marginTop: 3, flex: "none" }}
                className={it.sev === "error" ? "danger-text" : it.sev === "warn" ? "caution-text" : "t3"}
              />
              <strong style={{ fontWeight: 600 }}>{it.title}</strong>
            </div>
          </div>
          <span className="tag tag-mono" style={{ alignSelf: "flex-start" }}>
            {it.code}
          </span>
          <dl className="kv small">
            {it.meta.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="small t2">{it.detail}</p>
        </section>
      ))}
    </Drawer>
  );
}
