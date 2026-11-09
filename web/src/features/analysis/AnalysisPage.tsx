import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHead } from "../../app/Shell";
import { Button, DemoMark, Field, Notice, Pill, RatingInline, Segmented, Status, ToggleRow } from "../../components/ui";
import { ANALYSTS, ASSET_TYPE_LABEL, type AnalystKey } from "../../lib/labels";
import { demoPortfolio, demoRuns } from "../../demo/fixtures";

type PortfolioMode = "none" | "flat" | "snapshot";
type Depth = 1 | 3 | 5;

const today = new Date().toLocaleDateString("en-CA");

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
  const [submitted, setSubmitted] = useState(false);
  const [starting, setStarting] = useState(false);

  const symbol = ticker.trim().toUpperCase();
  const asset = detectAsset(ticker);
  const cryptoBlocked: AnalystKey[] = asset === "crypto" ? ["fundamentals"] : [];
  const effectiveAnalysts = analysts.filter((a) => !cryptoBlocked.includes(a));
  const isHistory = dateMode === "history" && date < today;
  const position = demoPortfolio.positions.find((p) => p.ticker === symbol);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (submitted && !symbol) e.ticker = "请输入股票或加密资产代码。";
    if (date > today) e.date = "分析日期不能晚于今天。";
    if (submitted && effectiveAnalysts.length === 0) e.analysts = "至少选择一位分析师。";
    return e;
  }, [submitted, symbol, date, effectiveAnalysts.length]);

  const toggleAnalyst = (k: AnalystKey) =>
    setAnalysts((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  const start = () => {
    setSubmitted(true);
    if (!symbol || effectiveAnalysts.length === 0 || date > today || starting) return;
    setStarting(true);
    window.setTimeout(() => navigate("/runs/demo-running"), 700);
  };

  return (
    <>
      <PageHead title="新的研究" sub="单只股票或加密资产 · 多位分析师协作给出研究建议" />

      <div className="split">
        <aside className="split-aside stack-lg" aria-label="分析参数">
          <Field
            label="代码"
            htmlFor="ticker"
            error={errors.ticker}
            hint={
              <>
                支持交易所后缀，如 <span className="mono">AAPL</span> · <span className="mono">0700.HK</span> ·{" "}
                <span className="mono">600519.SS</span> · <span className="mono">BTC-USD</span>
              </>
            }
          >
            <input
              id="ticker"
              className="input input-hero"
              placeholder="AAPL"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && start()}
              aria-invalid={!!errors.ticker}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>

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

          <Field
            label="分析师"
            error={errors.analysts}
            hint={cryptoBlocked.length ? "加密资产没有公司财报，基本面分析师不适用。" : undefined}
          >
            <div className="pills">
              {ANALYSTS.map((a) => {
                const blocked = cryptoBlocked.includes(a.key);
                return (
                  <Pill
                    key={a.key}
                    checked={analysts.includes(a.key) && !blocked}
                    disabled={blocked}
                    onToggle={() => toggleAnalyst(a.key)}
                    title={blocked ? "加密资产不适用" : a.desc}
                  >
                    {a.label}
                  </Pill>
                );
              })}
            </div>
          </Field>

          <Field label="研究深度">
            <Segmented
              label="研究深度"
              value={depth}
              onChange={setDepth}
              options={[
                { value: 1, label: "轻量" },
                { value: 3, label: "标准" },
                { value: 5, label: "深入" },
              ]}
            />
            <div className="row-between field-hint">
              <span>
                辩论 {debateRounds ?? depth} 轮 · 风控 {riskRounds ?? depth} 轮
              </span>
              <button className="text-link micro t2" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}>
                {advanced ? "收起" : "分别设置"}
              </button>
            </div>
            {advanced && (
              <div className="cols-2" style={{ gap: 12 }}>
                <Field label="研究辩论" machineKey="max_debate_rounds">
                  <input
                    className="input num"
                    type="number"
                    min={1}
                    max={10}
                    placeholder={String(depth)}
                    value={debateRounds ?? ""}
                    onChange={(e) => setDebateRounds(e.target.value ? Number(e.target.value) : null)}
                  />
                </Field>
                <Field label="风险讨论" machineKey="max_risk_discuss_rounds">
                  <input
                    className="input num"
                    type="number"
                    min={1}
                    max={10}
                    placeholder={String(depth)}
                    value={riskRounds ?? ""}
                    onChange={(e) => setRiskRounds(e.target.value ? Number(e.target.value) : null)}
                  />
                </Field>
              </div>
            )}
          </Field>

          <Field label="持仓上下文">
            <Segmented
              label="持仓上下文"
              value={pfMode}
              onChange={setPfMode}
              options={[
                { value: "none", label: "不提供" },
                { value: "flat", label: "空仓" },
                { value: "snapshot", label: "快照" },
              ]}
            />
            <div className="field-hint">
              {pfMode === "none" && "分析不知道你的仓位，按一般情况给出建议。"}
              {pfMode === "flat" && "明确告知当前没有持仓；现金未知时保持未知。"}
              {pfMode === "snapshot" && (
                <>
                  {demoPortfolio.name} v{demoPortfolio.version} · {demoPortfolio.asOf} · <DemoMark />
                </>
              )}
            </div>
          </Field>

          <Field label="报告语言" machineKey="output_language" htmlFor="lang">
            <select id="lang" className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {["简体中文", "English", "繁體中文", "日本語", "한국어"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Field>

          <div className="stack-sm" style={{ gap: 10 }}>
            <span className="eyebrow">运行选项</span>
            <ToggleRow label="断点恢复" checked={checkpoint} onChange={setCheckpoint} />
            <ToggleRow label="保存报告文件" checked={saveReport} onChange={setSaveReport} />
            <ToggleRow label="同时生成 HTML" checked={html && saveReport} onChange={setHtml} disabled={!saveReport} />
          </div>
        </aside>

        <div className="stack-xl">
          <section className="stack-lg">
            <div className="stack-sm" style={{ gap: 4 }}>
              <span className="eyebrow">即将分析</span>
              <div className="row" style={{ gap: 14, alignItems: "baseline" }}>
                <span className="serif" style={{ fontSize: 64, lineHeight: 1, color: symbol ? "var(--text)" : "var(--text-3)" }}>
                  {symbol || "—"}
                </span>
                {symbol && <span className="t2">{ASSET_TYPE_LABEL[asset]}</span>}
              </div>
            </div>

            <dl className="kv">
              <dt>分析日期</dt>
              <dd className="num">
                {date} <span className="t3">· {isHistory ? "历史分析，仅使用当日可得数据" : "今天"}</span>
              </dd>
              <dt>分析师</dt>
              <dd>
                {effectiveAnalysts.length
                  ? ANALYSTS.filter((a) => effectiveAnalysts.includes(a.key))
                      .map((a) => a.label)
                      .join("、")
                  : "未选择"}
              </dd>
              <dt>模型</dt>
              <dd>
                <span className="mono">gpt-5.4-mini</span> <span className="t3">快速</span> ·{" "}
                <span className="mono">gpt-5.4</span> <span className="t3">深度</span>{" "}
                <Link to="/settings" className="text-link small t2" style={{ marginLeft: 6 }}>
                  修改
                </Link>
              </dd>
              <dt>持仓</dt>
              <dd>
                {pfMode === "none" && "不提供"}
                {pfMode === "flat" && "明确空仓"}
                {pfMode === "snapshot" &&
                  (position
                    ? `${position.quantity} 股 · 成本 ${position.avg ?? "未提供"}`
                    : symbol
                      ? "快照中没有这只股票"
                      : `${demoPortfolio.name} v${demoPortfolio.version}`)}
              </dd>
            </dl>

            <div>
              {pfMode === "snapshot" && isHistory && (
                <Notice kind="warn" title="快照日期与分析日期不同。">
                  此快照记录于 {demoPortfolio.asOf}，未必代表 {date} 的持仓。
                </Notice>
              )}
              <Notice
                kind="error"
                title="缺少 OpenAI API Key。"
                actions={
                  <Link to="/settings" className="btn btn-sm">
                    前往设置
                  </Link>
                }
              >
                表单内容会保留。
              </Notice>
              <Notice kind="info">
                未配置 <span className="mono">FRED_API_KEY</span>，宏观数据会缺失，不影响核心分析。
              </Notice>
            </div>

            <div className="row" style={{ gap: 16 }}>
              <Button variant="solid" size="lg" loading={starting} onClick={start} icon={<ArrowRight size={17} />}>
                开始分析
              </Button>
              <span className="small t3">研究建议，不会下单或改变持仓。</span>
            </div>
          </section>

          <section className="section">
            <div className="row-between">
              <h2 className="section-title">最近</h2>
              <Link to="/runs" className="text-link small t2">
                全部历史
              </Link>
            </div>
            <div>
              {demoRuns.slice(0, 4).map((r) => (
                <Link key={r.id} to={`/runs/${r.id}`} className="recent-row">
                  <span className="mono" style={{ fontWeight: 500, minWidth: 96 }}>
                    {r.ticker}
                  </span>
                  <span className="num t3 small">{r.date}</span>
                  <span style={{ marginLeft: "auto" }} className="row" >
                    <RatingInline rating={r.rating} />
                    <span style={{ width: 104, display: "inline-flex", justifyContent: "flex-end" }}>
                      <Status status={r.status} />
                    </span>
                  </span>
                  <ArrowUpRight size={15} className="t3 recent-arrow" aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
