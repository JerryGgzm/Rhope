import { ArrowRight, Cpu, Info, Play, Settings2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Topbar } from "../../app/Shell";
import { Banner, ChoiceChip, Field, RatingBadge, Segmented, StatusBadge, ToggleRow } from "../../components/ui";
import { ANALYSTS, ASSET_TYPE_LABEL, type AnalystKey } from "../../lib/labels";
import { demoPortfolio, demoRuns } from "../../demo/fixtures";

type PortfolioMode = "none" | "flat" | "snapshot";
type Depth = 1 | 3 | 5;

const today = new Date().toISOString().slice(0, 10);

function detectAsset(ticker: string): "stock" | "crypto" {
  return /-(USD|USDT|USDC|EUR)$/i.test(ticker.trim()) ? "crypto" : "stock";
}

export function AnalysisPage() {
  const navigate = useNavigate();
  const [ticker, setTicker] = useState("");
  const [dateMode, setDateMode] = useState<"today" | "history">("today");
  const [date, setDate] = useState(today);
  const [analysts, setAnalysts] = useState<AnalystKey[]>(["market", "social", "news", "fundamentals"]);
  const [depth, setDepth] = useState<Depth>(1);
  const [advanced, setAdvanced] = useState(false);
  const [debateRounds, setDebateRounds] = useState<number | null>(null);
  const [riskRounds, setRiskRounds] = useState<number | null>(null);
  const [language, setLanguage] = useState("简体中文");
  const [pfMode, setPfMode] = useState<PortfolioMode>("none");
  const [checkpoint, setCheckpoint] = useState(false);
  const [saveReport, setSaveReport] = useState(true);
  const [html, setHtml] = useState(true);
  const [focus, setFocus] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const asset = detectAsset(ticker);
  const cryptoBlocked: AnalystKey[] = asset === "crypto" ? ["fundamentals"] : [];
  const effectiveAnalysts = analysts.filter((a) => !cryptoBlocked.includes(a));
  const isHistory = dateMode === "history" && date < today;

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (submitted && !ticker.trim()) e.ticker = "请输入股票或加密资产代码。";
    if (date > today) e.date = "分析日期不能晚于今天。";
    if (submitted && effectiveAnalysts.length === 0) e.analysts = "至少选择一位分析师。";
    return e;
  }, [submitted, ticker, date, effectiveAnalysts.length]);

  const toggleAnalyst = (k: AnalystKey) =>
    setAnalysts((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  const start = () => {
    setSubmitted(true);
    if (!ticker.trim() || effectiveAnalysts.length === 0 || date > today) return;
    navigate("/runs/demo-running");
  };

  const position = demoPortfolio.positions.find((p) => p.ticker === ticker.trim().toUpperCase());

  return (
    <>
      <Topbar
        title="分析工作台"
        crumb="单只股票／加密资产研究"
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => setFocus((f) => !f)}>
            {focus ? "显示参数" : "专注模式"}
          </button>
        }
      />
      <div className="page">
        <div className="workbench" data-focus={focus}>
          <section className="panel params" aria-label="分析参数">
            <div className="panel-body stack" style={{ gap: 20 }}>
              <Field
                label="代码"
                htmlFor="ticker"
                error={errors.ticker}
                hint={
                  <>
                    支持交易所后缀，例如 <span className="mono">AAPL</span>、<span className="mono">0700.HK</span>、
                    <span className="mono">600519.SS</span>、<span className="mono">BTC-USD</span>
                  </>
                }
              >
                <input
                  id="ticker"
                  className="input input-lg"
                  placeholder="输入代码"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  aria-invalid={!!errors.ticker}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              {ticker.trim() && (
                <div className="row" style={{ marginTop: -8 }}>
                  <span className="badge badge-blue">{ASSET_TYPE_LABEL[asset]}</span>
                  <span className="aux">
                    规范代码 <span className="mono">{ticker.trim().toUpperCase()}</span> · 由后端解析确认
                  </span>
                </div>
              )}

              <Field label="分析日期" error={errors.date} htmlFor="date">
                <Segmented
                  label="日期模式"
                  value={dateMode}
                  onChange={(v) => {
                    setDateMode(v);
                    if (v === "today") setDate(today);
                  }}
                  options={[
                    { value: "today", label: "今天" },
                    { value: "history", label: "历史日期" },
                  ]}
                />
                {dateMode === "history" && (
                  <input
                    id="date"
                    type="date"
                    className="input"
                    value={date}
                    max={today}
                    onChange={(e) => setDate(e.target.value)}
                    aria-invalid={!!errors.date}
                  />
                )}
              </Field>

              <Field label="分析师" error={errors.analysts}>
                <div className="chips">
                  {ANALYSTS.map((a) => {
                    const blocked = cryptoBlocked.includes(a.key);
                    return (
                      <ChoiceChip
                        key={a.key}
                        checked={analysts.includes(a.key) && !blocked}
                        disabled={blocked}
                        onToggle={() => toggleAnalyst(a.key)}
                        title={blocked ? "加密资产没有公司财报，基本面分析师不适用" : a.desc}
                      >
                        {a.label}
                      </ChoiceChip>
                    );
                  })}
                </div>
                {cryptoBlocked.length > 0 && (
                  <div className="field-hint">加密资产没有公司财报，基本面分析师不适用。</div>
                )}
                {ANALYSTS.length - effectiveAnalysts.length > 0 && cryptoBlocked.length === 0 && (
                  <div className="field-hint">
                    未选：
                    {ANALYSTS.filter((a) => !effectiveAnalysts.includes(a.key))
                      .map((a) => a.label)
                      .join("、")}
                  </div>
                )}
              </Field>

              <Field label="研究深度" hint="多空辩论与风险讨论的轮数。">
                <Segmented
                  label="研究深度"
                  value={depth}
                  onChange={setDepth}
                  options={[
                    { value: 1, label: "轻量 · 1" },
                    { value: 3, label: "标准 · 3" },
                    { value: 5, label: "深入 · 5" },
                  ]}
                />
                <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setAdvanced((a) => !a)}>
                  <Settings2 size={14} /> {advanced ? "收起高级" : "分别设置轮数"}
                </button>
                {advanced && (
                  <div className="grid-2">
                    <Field label="研究辩论" machineKey="max_debate_rounds">
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={10}
                        placeholder={`随深度（${depth}）`}
                        value={debateRounds ?? ""}
                        onChange={(e) => setDebateRounds(e.target.value ? Number(e.target.value) : null)}
                      />
                    </Field>
                    <Field label="风险讨论" machineKey="max_risk_discuss_rounds">
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={10}
                        placeholder={`随深度（${depth}）`}
                        value={riskRounds ?? ""}
                        onChange={(e) => setRiskRounds(e.target.value ? Number(e.target.value) : null)}
                      />
                    </Field>
                  </div>
                )}
              </Field>

              <Field label="报告语言" machineKey="output_language" htmlFor="lang">
                <select id="lang" className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {["简体中文", "English", "繁體中文", "日本語", "한국어"].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </Field>

              <Field label="持仓上下文">
                <Segmented
                  label="持仓上下文"
                  value={pfMode}
                  onChange={setPfMode}
                  options={[
                    { value: "none", label: "不提供" },
                    { value: "flat", label: "明确空仓" },
                    { value: "snapshot", label: "选快照" },
                  ]}
                />
                <div className="field-hint">
                  {pfMode === "none" && "分析不知道你的仓位，建议按一般情况给出。"}
                  {pfMode === "flat" && "告诉分析：你当前没有任何持仓。现金未知时保持未知。"}
                </div>
                {pfMode === "snapshot" && (
                  <div className="panel raised" style={{ padding: 12 }}>
                    <div className="row-between">
                      <strong style={{ fontSize: 14 }}>
                        {demoPortfolio.name} · v{demoPortfolio.version}
                      </strong>
                      <span className="demo-tag">演示</span>
                    </div>
                    <dl className="kv" style={{ marginTop: 8 }}>
                      <dt>快照时间</dt>
                      <dd>{demoPortfolio.asOf}</dd>
                      <dt>现金</dt>
                      <dd className="num">
                        {demoPortfolio.cash?.toLocaleString()} {demoPortfolio.currency}
                      </dd>
                      <dt>本标的</dt>
                      <dd>
                        {position
                          ? `${position.quantity} 股 · 成本 ${position.avg ?? "未提供"}`
                          : ticker.trim()
                            ? "快照中没有这只股票"
                            : "输入代码后显示"}
                      </dd>
                    </dl>
                  </div>
                )}
                {pfMode === "snapshot" && isHistory && (
                  <Banner kind="warn">
                    此快照记录于 {demoPortfolio.asOf}，未必代表 {date} 的持仓。请确认这是你想用的快照。
                  </Banner>
                )}
              </Field>

              <div className="stack-sm" style={{ gap: 14 }}>
                <span className="section-label">运行选项</span>
                <ToggleRow
                  label="断点恢复"
                  checked={checkpoint}
                  onChange={setCheckpoint}
                  hint="中断后可从上次完成的步骤继续。启动前会由后端检查是否有相容的断点。"
                />
                <ToggleRow label="保存报告文件" checked={saveReport} onChange={setSaveReport} />
                <ToggleRow label="同时生成 HTML" checked={html && saveReport} onChange={setHtml} disabled={!saveReport} />
                <div className="field-hint">运行记录和事件始终保留，与报告导出选项无关。</div>
              </div>
            </div>
          </section>

          <div className="stack" style={{ gap: 20 }}>
            <section className="panel">
              <div className="panel-head">
                <h3>启动前确认</h3>
                <span className="demo-tag">演示</span>
              </div>
              <div className="panel-body stack">
                <div className="grid-3">
                  <div className="metric">
                    <span className="label">标的</span>
                    <span className="value" style={{ fontSize: 18 }}>
                      {ticker.trim().toUpperCase() || <span className="faint">未填写</span>}
                    </span>
                    <span className="aux">{ticker.trim() ? ASSET_TYPE_LABEL[asset] : "—"}</span>
                  </div>
                  <div className="metric">
                    <span className="label">分析日期</span>
                    <span className="value" style={{ fontSize: 18 }}>
                      {date}
                    </span>
                    <span className="aux">{isHistory ? "历史分析 · 点时数据" : "今天"}</span>
                  </div>
                  <div className="metric">
                    <span className="label">分析师</span>
                    <span className="value" style={{ fontSize: 18 }}>
                      {effectiveAnalysts.length} / 4
                    </span>
                    <span className="aux">
                      辩论 {debateRounds ?? depth} 轮 · 风控 {riskRounds ?? depth} 轮
                    </span>
                  </div>
                </div>

                <div className="panel raised" style={{ padding: 16 }}>
                  <div className="row-between">
                    <div className="row">
                      <Cpu size={16} className="muted" aria-hidden />
                      <strong style={{ fontSize: 14 }}>模型</strong>
                      <span className="aux">设置 revision 3</span>
                    </div>
                    <Link to="/settings" className="btn btn-ghost btn-sm">
                      本次覆盖 <ArrowRight size={14} />
                    </Link>
                  </div>
                  <dl className="kv" style={{ marginTop: 10 }}>
                    <dt>快速层</dt>
                    <dd>
                      openai · <span className="mono">gpt-5.4-mini</span>
                    </dd>
                    <dt>深度层</dt>
                    <dd>
                      openai · <span className="mono">gpt-5.4</span>
                    </dd>
                    <dt>持仓</dt>
                    <dd>{{ none: "不提供", flat: "明确空仓", snapshot: `${demoPortfolio.name} v${demoPortfolio.version}` }[pfMode]}</dd>
                  </dl>
                </div>

                <Banner
                  kind="error"
                  title="缺少 OpenAI API Key。"
                  actions={
                    <Link to="/settings" className="btn btn-sm">
                      前往设置
                    </Link>
                  }
                >
                  快速层和深度层都使用 openai。表单内容会保留。
                </Banner>
                <Banner kind="info">
                  未配置 <span className="mono">FRED_API_KEY</span>：宏观数据会缺失，核心分析不受影响。
                </Banner>

                <div className="row-between" style={{ paddingTop: 4 }}>
                  <span className="aux">
                    <Info size={13} style={{ verticalAlign: -2 }} aria-hidden /> 这是研究建议，不会下单或改变你的持仓。
                  </span>
                  <button className="btn btn-primary btn-lg" onClick={start}>
                    <Play size={16} /> 开始分析
                  </button>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h3>最近运行</h3>
                <Link to="/runs" className="btn btn-ghost btn-sm">
                  全部历史 <ArrowRight size={14} />
                </Link>
              </div>
              <div className="stack-sm" style={{ padding: 8 }}>
                {demoRuns.slice(0, 4).map((r) => (
                  <Link
                    key={r.id}
                    to={`/runs/${r.id}`}
                    className="nav-item"
                    style={{ height: "auto", padding: "10px 12px", gap: 12, color: "var(--text)" }}
                  >
                    <strong className="mono" style={{ minWidth: 92 }}>
                      {r.ticker}
                    </strong>
                    <span className="aux num">{r.date}</span>
                    <span style={{ marginLeft: "auto" }} className="row">
                      <RatingBadge rating={r.rating} />
                      <StatusBadge status={r.status} />
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <section className="panel panel-pad row" style={{ gap: 16, alignItems: "flex-start" }}>
              <Sparkles size={18} style={{ color: "var(--accent)", flex: "none", marginTop: 3 }} aria-hidden />
              <div className="stack-sm">
                <strong style={{ fontSize: 14 }}>一次完整分析会经过五个阶段</strong>
                <p className="aux" style={{ lineHeight: 1.7 }}>
                  分析师并行收集数据 → 多空研究员辩论 → 交易员给出方案 → 风险团队讨论 → 投资组合经理给出最终评级。运行中可以随时阅读已完成的报告。
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
