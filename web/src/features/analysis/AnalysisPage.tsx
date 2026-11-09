import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PageHead } from "../../app/Shell";
import { Button, Field, Notice, Pill, RatingInline, Segmented, Status, ToggleRow } from "../../components/ui";
import { ApiError, OfflineError, api, errorText } from "../../lib/api/client";
import { useCapabilities, useCreateRun, useRuns, useSettings } from "../../lib/api/hooks";
import type { RunCreateBody, SettingsDoc } from "../../lib/api/types";
import { t, useLang } from "../../lib/i18n";
import { ANALYSTS, ASSET_TYPE_LABEL, type AnalystKey } from "../../lib/labels";

type PortfolioMode = "none" | "flat";
type Depth = 1 | 3 | 5;

const today = () => new Date().toLocaleDateString("en-CA");
const FORM_KEY = "ta.analysis.form";

interface Form {
  ticker: string;
  dateMode: "today" | "history";
  date: string;
  analysts: AnalystKey[];
  depth: Depth;
  debateRounds: number | null;
  riskRounds: number | null;
  language: string | null;
  pfMode: PortfolioMode;
  checkpoint: boolean | null;
  saveReport: boolean;
  html: boolean;
}

const INITIAL: Form = {
  ticker: "",
  dateMode: "today",
  date: today(),
  analysts: ["market", "social", "news", "fundamentals"],
  depth: 1,
  debateRounds: null,
  riskRounds: null,
  language: null,
  pfMode: "none",
  checkpoint: null,
  saveReport: true,
  html: true,
};

function loadForm(prefill?: Partial<Form>): Form {
  try {
    const saved = JSON.parse(sessionStorage.getItem(FORM_KEY) ?? "null") as Partial<Form> | null;
    const form = { ...INITIAL, ...saved, ...prefill };
    if (form.dateMode === "today") form.date = today();
    return form;
  } catch {
    return { ...INITIAL, ...prefill };
  }
}

function setting(doc: SettingsDoc | undefined, key: string): unknown {
  return doc?.fields.find((f) => f.key === key && f.kind === "config")?.value;
}

interface TickerCheck {
  valid: boolean;
  symbol?: string;
  asset_type?: "stock" | "crypto";
}

function useTickerCheck(input: string) {
  const [check, setCheck] = useState<TickerCheck | null>(null);
  useEffect(() => {
    const value = input.trim();
    if (!value) {
      setCheck(null);
      return;
    }
    const ctl = new AbortController();
    const timer = window.setTimeout(() => {
      api<TickerCheck>(`/tickers/check?symbol=${encodeURIComponent(value)}`, { signal: ctl.signal })
        .then(setCheck)
        .catch(() => undefined);
    }, 250);
    return () => {
      ctl.abort();
      window.clearTimeout(timer);
    };
  }, [input]);
  return check;
}

export function AnalysisPage() {
  const lang = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as { prefill?: Partial<Form> } | null)?.prefill;
  const [form, setForm] = useState<Form>(() => loadForm(prefill));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [submitted, setSubmitted] = useState(false);
  const [advanced, setAdvanced] = useState(form.debateRounds != null || form.riskRounds != null);
  const attempt = useRef<string>(crypto.randomUUID());

  const caps = useCapabilities();
  const settings = useSettings();
  const recent = useRuns({ limit: 5 });
  const create = useCreateRun();
  const check = useTickerCheck(form.ticker);

  useEffect(() => {
    sessionStorage.setItem(FORM_KEY, JSON.stringify(form));
    attempt.current = crypto.randomUUID();
  }, [form]);

  const doc = settings.data;
  const provider = String(setting(doc, "llm_provider") ?? "");
  const quickProvider = String(setting(doc, "quick_think_provider") ?? provider);
  const deepProvider = String(setting(doc, "deep_think_provider") ?? provider);
  // An explicitly configured report language wins; otherwise reports follow the interface.
  const languageField = doc?.fields.find((f) => f.key === "output_language" && f.kind === "config");
  const language =
    form.language ??
    (languageField && languageField.source !== "default" ? String(languageField.value) : lang === "zh" ? "Chinese" : "English");
  const checkpoint = form.checkpoint ?? Boolean(setting(doc, "checkpoint_enabled"));

  const symbol = check?.valid ? check.symbol! : form.ticker.trim().toUpperCase();
  const asset = check?.valid ? check.asset_type! : "stock";
  const cryptoBlocked: AnalystKey[] = asset === "crypto" ? ["fundamentals"] : [];
  const effectiveAnalysts = form.analysts.filter((a) => !cryptoBlocked.includes(a));
  const isHistory = form.dateMode === "history" && form.date < today();
  const debate = form.debateRounds ?? form.depth;
  const risk = form.riskRounds ?? form.depth;

  const missingCredentials = useMemo(() => {
    if (!caps.data || !doc) return [];
    const needed = new Set([quickProvider, deepProvider]);
    const out: { provider: string; label: string; env: string | null; signIn: boolean }[] = [];
    needed.forEach((p) => {
      const cap = caps.data.providers.find((c) => c.id === p);
      if (!cap) return;
      if (cap.signed_in) return; // checked by the service at submit
      if (!cap.key_env || cap.key_optional) return;
      const cred = doc.credentials.find((c) => c.name === cap.key_env);
      if (!cred?.configured) out.push({ provider: p, label: cap.label, env: cap.key_env, signIn: false });
    });
    return out;
  }, [caps.data, doc, quickProvider, deepProvider]);

  const fredMissing = useMemo(() => {
    const vendors = setting(doc, "data_vendors") as Record<string, string> | undefined;
    const uses = (vendors?.macro_data ?? "").includes("fred");
    return uses && doc && !doc.credentials.find((c) => c.name === "FRED_API_KEY")?.configured;
  }, [doc]);

  const serverError = create.error instanceof ApiError ? create.error : null;
  const fieldError = (key: string) => serverError?.fieldError(key);
  const errors = {
    ticker:
      (submitted && !form.ticker.trim() && t("请输入股票或加密资产代码。", "Enter a stock or crypto symbol.")) ||
      (check && !check.valid && t("无法识别的代码，例如 AAPL、0700.HK、BTC-USD。", "Unrecognized symbol, e.g. AAPL, 0700.HK, BTC-USD.")) ||
      fieldError("ticker"),
    date: (form.date > today() && t("分析日期不能晚于今天。", "The analysis date cannot be in the future.")) || fieldError("analysis_date"),
    analysts: (submitted && effectiveAnalysts.length === 0 && t("至少选择一位分析师。", "Choose at least one analyst.")) || fieldError("analysts"),
  };

  const toggleAnalyst = (k: AnalystKey) =>
    set("analysts", form.analysts.includes(k) ? form.analysts.filter((x) => x !== k) : [...form.analysts, k]);

  const start = () => {
    setSubmitted(true);
    if (create.isPending || !doc) return;
    if (!form.ticker.trim() || (check && !check.valid) || effectiveAnalysts.length === 0 || form.date > today()) return;
    const body: RunCreateBody = {
      ticker: form.ticker.trim(),
      analysis_date: form.dateMode === "today" ? today() : form.date,
      analysts: effectiveAnalysts,
      settings_revision: doc.revision,
      overrides: { max_debate_rounds: debate, max_risk_discuss_rounds: risk, output_language: language },
      portfolio: { mode: form.pfMode },
      checkpoint_enabled: checkpoint,
      report_options: { save: form.saveReport, html: form.saveReport && form.html },
    };
    create.mutate(
      { body, key: attempt.current },
      {
        onSuccess: (run) => navigate(`/runs/${run.id}`),
        onError: (e) => {
          if (e instanceof ApiError && e.body.code === "SETTINGS_REVISION_STALE") settings.refetch();
        },
      },
    );
  };

  const languages = caps.data?.languages ?? [];
  const languageOptions = languages.some((l) => l.id === language) ? languages : [{ id: language, label: language }, ...languages];

  return (
    <>
      <PageHead
        title={t("新的研究", "New research")}
        sub={t("单只股票或加密资产 · 多位分析师协作给出研究建议", "One stock or crypto asset · a team of analysts builds a research view")}
      />

      <div className="split">
        <aside className="split-aside stack-lg" aria-label={t("分析参数", "Analysis parameters")}>
          <Field
            label={t("代码", "Symbol")}
            htmlFor="ticker"
            error={errors.ticker}
            hint={
              check?.valid && check.symbol !== form.ticker.trim().toUpperCase() ? (
                <>
                  {t("将按", "Analyzed as")} <span className="mono">{check.symbol}</span> {t("分析", "")}
                </>
              ) : (
                <>
                  {t("支持交易所后缀，如", "Exchange suffixes work, e.g.")} <span className="mono">AAPL</span> · <span className="mono">0700.HK</span> ·{" "}
                  <span className="mono">600519.SS</span> · <span className="mono">BTC-USD</span>
                </>
              )
            }
          >
            <input
              id="ticker"
              className="input input-hero"
              placeholder="AAPL"
              value={form.ticker}
              onChange={(e) => set("ticker", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && start()}
              aria-invalid={!!errors.ticker}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>

          <Field label={t("分析日期", "Analysis date")} error={errors.date} htmlFor="date">
            <Segmented
              label={t("日期模式", "Date mode")}
              value={form.dateMode}
              onChange={(v) => setForm((f) => ({ ...f, dateMode: v, date: v === "today" ? today() : f.date }))}
              options={[
                { value: "today", label: t("今天", "Today") },
                { value: "history", label: t("历史日期", "Past date") },
              ]}
            />
            {form.dateMode === "history" && (
              <input
                id="date"
                type="date"
                className="input"
                value={form.date}
                max={today()}
                onChange={(e) => set("date", e.target.value)}
                aria-invalid={!!errors.date}
              />
            )}
          </Field>

          <Field
            label={t("分析师", "Analysts")}
            error={errors.analysts}
            hint={
              cryptoBlocked.length
                ? t("加密资产没有公司财报，基本面分析师不适用。", "Crypto has no company financials, so the fundamentals analyst does not apply.")
                : undefined
            }
          >
            <div className="pills">
              {ANALYSTS.map((a) => {
                const blocked = cryptoBlocked.includes(a.key);
                return (
                  <Pill
                    key={a.key}
                    checked={form.analysts.includes(a.key) && !blocked}
                    disabled={blocked}
                    onToggle={() => toggleAnalyst(a.key)}
                    title={blocked ? t("加密资产不适用", "Not for crypto") : a.desc}
                  >
                    {a.label}
                  </Pill>
                );
              })}
            </div>
          </Field>

          <Field label={t("研究深度", "Depth")}>
            <Segmented
              label={t("研究深度", "Depth")}
              value={form.depth}
              onChange={(v) => set("depth", v)}
              options={[
                { value: 1, label: t("轻量", "Light") },
                { value: 3, label: t("标准", "Standard") },
                { value: 5, label: t("深入", "Deep") },
              ]}
            />
            <div className="row-between field-hint">
              <span>
                {t(`辩论 ${debate} 轮 · 风控 ${risk} 轮`, `Debate ${debate} · risk ${risk} rounds`)}
              </span>
              <button className="text-link micro t2" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}>
                {advanced ? t("收起", "Hide") : t("分别设置", "Set separately")}
              </button>
            </div>
            {advanced && (
              <div className="cols-2" style={{ gap: 12 }}>
                <Field label={t("研究辩论", "Debate")} machineKey="max_debate_rounds">
                  <input
                    className="input num"
                    type="number"
                    min={1}
                    max={10}
                    placeholder={String(form.depth)}
                    value={form.debateRounds ?? ""}
                    onChange={(e) => set("debateRounds", e.target.value ? Number(e.target.value) : null)}
                  />
                </Field>
                <Field label={t("风险讨论", "Risk debate")} machineKey="max_risk_discuss_rounds">
                  <input
                    className="input num"
                    type="number"
                    min={1}
                    max={10}
                    placeholder={String(form.depth)}
                    value={form.riskRounds ?? ""}
                    onChange={(e) => set("riskRounds", e.target.value ? Number(e.target.value) : null)}
                  />
                </Field>
              </div>
            )}
          </Field>

          <Field label={t("持仓上下文", "Position context")}>
            <Segmented
              label={t("持仓上下文", "Position context")}
              value={form.pfMode}
              onChange={(v) => set("pfMode", v)}
              options={[
                { value: "none", label: t("不提供", "None") },
                { value: "flat", label: t("明确空仓", "Flat") },
              ]}
            />
            <div className="field-hint">
              {form.pfMode === "none" &&
                t("分析不知道你的仓位，按一般情况给出建议。", "The analysis does not know your position and advises generally.")}
              {form.pfMode === "flat" &&
                t("明确告知当前没有持仓；现金未知时保持未知。", "States you hold no position; unknown cash stays unknown.")}{" "}
              {t("持仓快照将在“持仓”页接入后可选。", "Portfolio snapshots become available once the Portfolio page is connected.")}
            </div>
          </Field>

          <Field label={t("报告语言", "Report language")} machineKey="output_language" htmlFor="lang">
            <select id="lang" className="select" value={language} onChange={(e) => set("language", e.target.value)}>
              {languageOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                  {l.label !== l.id ? ` · ${l.id}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <div className="stack-sm" style={{ gap: 10 }}>
            <span className="eyebrow">{t("运行选项", "Run options")}</span>
            <ToggleRow
              label={t("断点恢复", "Resume from checkpoint")}
              checked={checkpoint}
              onChange={(v) => set("checkpoint", v)}
              hint={t("中断后用相同输入重新运行，会从上次保存的步骤继续。", "Rerunning with the same inputs after an interruption continues from the last saved step.")}
            />
            <ToggleRow label={t("保存报告文件", "Save report files")} checked={form.saveReport} onChange={(v) => set("saveReport", v)} />
            <ToggleRow
              label={t("同时生成 HTML", "Also create HTML")}
              checked={form.html && form.saveReport}
              onChange={(v) => set("html", v)}
              disabled={!form.saveReport}
            />
          </div>
        </aside>

        <div className="stack-xl">
          <section className="stack-lg">
            <div className="stack-sm" style={{ gap: 4 }}>
              <span className="eyebrow">{t("即将分析", "About to analyze")}</span>
              <div className="row" style={{ gap: 14, alignItems: "baseline" }}>
                <span className="serif" style={{ fontSize: 64, lineHeight: 1, color: symbol ? "var(--text)" : "var(--text-3)" }}>
                  {symbol || "—"}
                </span>
                {check?.valid && <span className="t2">{ASSET_TYPE_LABEL[asset]}</span>}
              </div>
            </div>

            <dl className="kv">
              <dt>{t("分析日期", "Date")}</dt>
              <dd className="num">
                {form.dateMode === "today" ? today() : form.date}{" "}
                <span className="t3">· {isHistory ? t("历史分析，仅使用当日可得数据", "past date: only data available that day is used") : t("今天", "today")}</span>
              </dd>
              <dt>{t("分析师", "Analysts")}</dt>
              <dd>
                {effectiveAnalysts.length
                  ? ANALYSTS.filter((a) => effectiveAnalysts.includes(a.key))
                      .map((a) => a.label)
                      .join(t("、", ", "))
                  : t("未选择", "None selected")}
              </dd>
              <dt>{t("模型", "Models")}</dt>
              <dd>
                {doc ? (
                  <>
                    <span className="mono">{String(setting(doc, "quick_think_llm"))}</span>{" "}
                    <span className="t3">{t("快速", "quick")}{quickProvider !== provider ? ` · ${quickProvider}` : ""}</span> ·{" "}
                    <span className="mono">{String(setting(doc, "deep_think_llm"))}</span>{" "}
                    <span className="t3">{t("深度", "deep")}{deepProvider !== provider ? ` · ${deepProvider}` : ""}</span>{" "}
                    <span className="t3">· {provider}</span>
                    <Link to="/settings" className="text-link small t2" style={{ marginLeft: 8 }}>
                      {t("修改", "Change")}
                    </Link>
                  </>
                ) : (
                  <span className="t3">{t("读取设置中…", "Loading settings…")}</span>
                )}
              </dd>
              <dt>{t("持仓", "Position")}</dt>
              <dd>{form.pfMode === "none" ? t("不提供", "None") : t("明确空仓 · 现金未知", "Flat · cash unknown")}</dd>
            </dl>

            <div>
              {settings.isError && (
                <Notice kind="error" title={t("无法读取设置。", "Could not load settings.")}>
                  {errorText(settings.error)}
                </Notice>
              )}
              {missingCredentials.map((m) => (
                <Notice
                  key={m.provider}
                  kind="error"
                  title={t(`缺少 ${m.label} 的 API Key。`, `${m.label} API key is missing.`)}
                  actions={
                    <Link to="/settings" className="btn btn-sm">
                      {t("前往设置", "Open settings")}
                    </Link>
                  }
                >
                  {t("在设置中填写", "Set")} <span className="mono">{m.env}</span>
                  {t("；表单内容会保留。", " in Settings; your form is kept.")}
                </Notice>
              ))}
              {fredMissing && (
                <Notice kind="info">
                  <span className="mono">FRED_API_KEY</span>{" "}
                  {t("未配置，宏观数据会缺失，不影响核心分析。", "is not set: macro data will be missing; the core analysis is unaffected.")}
                </Notice>
              )}
              {serverError && !serverError.body.field_errors.length && (
                <Notice
                  kind="error"
                  title={serverError.body.message}
                  actions={
                    ["CREDENTIAL_MISSING", "PROVIDER_SIGN_IN_REQUIRED", "PROVIDER_ENDPOINT_INVALID", "PROVIDER_ENDPOINT_MISSING"].includes(
                      serverError.body.code,
                    ) ? (
                      <Link to="/settings" className="btn btn-sm">
                        {t("前往设置", "Open settings")}
                      </Link>
                    ) : undefined
                  }
                >
                  {serverError.body.details ?? ""} <span className="mono t3">{serverError.body.code}</span>
                </Notice>
              )}
              {create.error instanceof OfflineError && (
                <Notice kind="error" title={t("无法连接本地服务，任务没有创建。", "Cannot reach the local service; no run was created.")}>
                  {t("服务恢复后可再次提交；不会重复创建。", "Submit again once it is back; it will not be created twice.")}
                </Notice>
              )}
            </div>

            <div className="row" style={{ gap: 16 }}>
              <Button
                variant="solid"
                size="lg"
                loading={create.isPending}
                disabled={!doc || missingCredentials.length > 0}
                onClick={start}
                icon={<ArrowRight size={17} />}
              >
                {t("开始分析", "Start analysis")}
              </Button>
              <span className="small t3">{t("研究建议，不会下单或改变持仓。", "Research only: no orders are placed and no positions change.")}</span>
            </div>
          </section>

          <section className="section">
            <div className="row-between">
              <h2 className="section-title">{t("最近", "Recent")}</h2>
              <Link to="/runs" className="text-link small t2">
                {t("全部历史", "All history")}
              </Link>
            </div>
            <div>
              {recent.data?.items.length === 0 && <p className="small t3">{t("还没有运行记录。开始第一次分析后会出现在这里。", "No runs yet. Your first analysis will appear here.")}</p>}
              {recent.isError && <p className="small t3">{errorText(recent.error)}</p>}
              {recent.data?.items.map((r) => (
                <Link key={r.id} to={`/runs/${r.id}`} className="recent-row">
                  <span className="mono" style={{ fontWeight: 500, minWidth: 96 }}>
                    {r.ticker}
                  </span>
                  <span className="num t3 small">{r.analysis_date}</span>
                  <span style={{ marginLeft: "auto" }} className="row">
                    <RatingInline rating={r.rating} />
                    <span style={{ width: 120, display: "inline-flex", justifyContent: "flex-end" }}>
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
