import { ArrowDown, ArrowUp, CheckCircle2, ExternalLink, KeyRound, Plus, Save, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Topbar } from "../../app/Shell";
import { Banner } from "../../components/ui";

const GROUPS = [
  { key: "models", label: "模型与认证" },
  { key: "data", label: "数据来源" },
  { key: "research", label: "研究参数" },
  { key: "output", label: "输出与存储" },
  { key: "network", label: "网络与高级" },
  { key: "about", label: "关于" },
] as const;

type Source = "default" | "env" | "web" | "inherit";
const SOURCE_LABEL: Record<Source, { label: string; cls: string }> = {
  default: { label: "内置默认", cls: "" },
  env: { label: "来自 .env", cls: "badge-blue" },
  web: { label: "Web 已保存", cls: "badge-accent" },
  inherit: { label: "继承主模型", cls: "" },
};

function SettingRow({
  name,
  machineKey,
  desc,
  source,
  secret,
  extra,
  children,
}: {
  name: string;
  machineKey: string;
  desc: string;
  source: Source;
  secret?: boolean;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const s = SOURCE_LABEL[source];
  return (
    <div className="setting-row">
      <div className="setting-meta">
        <span className="name">{name}</span>
        <span className="desc">{desc}</span>
        <div className="chips-line">
          <span className="badge mono" style={{ fontSize: 11 }}>
            {machineKey}
          </span>
          <span className={`badge ${s.cls}`}>{s.label}</span>
          {secret && (
            <span className="badge badge-warn">
              <KeyRound size={11} /> 敏感
            </span>
          )}
          {extra}
        </div>
      </div>
      <div className="stack-sm" style={{ justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [group, setGroup] = useState<(typeof GROUPS)[number]["key"]>("models");
  const [chain, setChain] = useState(["sec_edgar", "yfinance"]);

  return (
    <>
      <Topbar
        title="设置"
        crumb="revision 3 · 保存后用于新任务"
        actions={
          <button className="btn btn-primary btn-sm">
            <Save size={15} /> 保存
          </button>
        }
      />
      <div className="page">
        <div className="row">
          <span className="demo-tag">演示数据</span>
          <span className="aux">优先级：本次显式覆盖 › Web 已保存 › 启动时的 env/.env › 内置默认</span>
        </div>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="设置分组">
            {GROUPS.map((g) => (
              <button key={g.key} aria-current={g.key === group} onClick={() => setGroup(g.key)}>
                {g.label}
              </button>
            ))}
          </nav>

          <div className="stack" style={{ gap: 20 }}>
            {group === "models" && (
              <>
                <section className="panel">
                  <div className="panel-head">
                    <h3>主模型</h3>
                    <button className="btn btn-sm">测试连接</button>
                  </div>
                  <SettingRow name="模型提供方" machineKey="llm_provider" desc="快速层与深度层默认使用的 provider。" source="web">
                    <select className="select" defaultValue="openai">
                      {["openai", "chatgpt", "anthropic", "google", "deepseek", "qwen", "ollama", "openrouter", "bedrock"].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </SettingRow>
                  <SettingRow name="快速层模型" machineKey="quick_think_llm" desc="分析师与辩论使用。可输入目录外的自定义 model ID，由后端校验。" source="web">
                    <input className="input mono" defaultValue="gpt-5.4-mini" list="models" />
                  </SettingRow>
                  <SettingRow name="深度层模型" machineKey="deep_think_llm" desc="研究经理与投资组合经理使用。" source="env">
                    <input className="input mono" defaultValue="gpt-5.4" />
                    <span className="aux">.env 中的值与 Web 保存值不同时，这里会同时显示两者和实际生效值。</span>
                  </SettingRow>
                  <SettingRow name="深度层 provider" machineKey="deep_think_provider" desc="留空则继承主 provider。" source="inherit">
                    <select className="select" defaultValue="">
                      <option value="">继承（openai）</option>
                      <option>anthropic</option>
                      <option>deepseek</option>
                    </select>
                  </SettingRow>
                  <SettingRow name="temperature" machineKey="temperature" desc="留空使用模型默认值。" source="default" extra={<span className="badge">chatgpt 不支持</span>}>
                    <input className="input num" placeholder="使用默认" />
                  </SettingRow>
                </section>

                <section className="panel">
                  <div className="panel-head">
                    <h3>API Key</h3>
                    <span className="aux">只显示是否已配置，不会回传完整密钥</span>
                  </div>
                  <SettingRow name="OpenAI" machineKey="OPENAI_API_KEY" desc="openai provider 使用。" source="web" secret>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <span className="badge badge-pos">
                        <CheckCircle2 size={12} /> 已配置
                      </span>
                      <input className="input" type="password" placeholder="留空表示不修改" autoComplete="off" />
                      <button className="btn btn-ghost btn-sm">清除</button>
                    </div>
                  </SettingRow>
                  <SettingRow name="DeepSeek" machineKey="DEEPSEEK_API_KEY" desc="deepseek provider 使用。" source="default" secret>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <span className="badge">未配置</span>
                      <input className="input" type="password" placeholder="输入密钥" autoComplete="off" />
                    </div>
                  </SettingRow>
                  <SettingRow name="通义千问（中国区）" machineKey="DASHSCOPE_CN_API_KEY" desc="与国际区密钥和端点相互独立。" source="env" secret>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <span className="badge badge-blue">已配置 · 来自 .env</span>
                      <input className="input" type="password" placeholder="留空表示不修改" autoComplete="off" />
                    </div>
                  </SettingRow>
                </section>

                <section className="panel">
                  <div className="panel-head">
                    <h3>ChatGPT 订阅登录</h3>
                    <span className="badge">未登录</span>
                  </div>
                  <div className="panel-body stack">
                    <p className="muted" style={{ fontSize: 14 }}>
                      使用 ChatGPT 订阅而不是 API Key。登录会在浏览器中打开 OpenAI 授权页，完成后自动返回。
                    </p>
                    <div className="row">
                      <button className="btn">
                        <ExternalLink size={15} /> 登录 ChatGPT
                      </button>
                      <button className="btn btn-ghost btn-sm">无法自动返回？粘贴回调地址</button>
                    </div>
                  </div>
                </section>
              </>
            )}

            {group === "data" && (
              <section className="panel">
                <div className="panel-head">
                  <h3>数据来源</h3>
                  <button className="btn btn-sm">测试数据源</button>
                </div>
                <SettingRow
                  name="资产负债表来源链"
                  machineKey="tool_vendors.get_balance_sheet"
                  desc="按顺序尝试，只尝试列出的来源。优先于类别设置。"
                  source="web"
                >
                  <div className="chain">
                    {chain.map((v, i) => (
                      <div className="chain-item" key={v}>
                        <span className="idx">{i + 1}</span>
                        <span className="mono">{v}</span>
                        <span style={{ marginLeft: "auto" }} className="row">
                          <button className="btn btn-ghost icon-btn" style={{ width: 28, height: 28 }} aria-label="上移" disabled={i === 0} onClick={() => setChain((c) => swap(c, i, i - 1))}>
                            <ArrowUp size={14} />
                          </button>
                          <button className="btn btn-ghost icon-btn" style={{ width: 28, height: 28 }} aria-label="下移" disabled={i === chain.length - 1} onClick={() => setChain((c) => swap(c, i, i + 1))}>
                            <ArrowDown size={14} />
                          </button>
                          <button className="btn btn-ghost icon-btn" style={{ width: 28, height: 28 }} aria-label="移除" onClick={() => setChain((c) => c.filter((x) => x !== v))}>
                            <X size={14} />
                          </button>
                        </span>
                      </div>
                    ))}
                    <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}>
                      <Plus size={14} /> 添加来源
                    </button>
                  </div>
                  <span className="aux mono">保存为：{chain.join(",") || "（使用类别设置）"}</span>
                </SettingRow>
                <SettingRow name="FRED" machineKey="FRED_API_KEY" desc="宏观数据。可选：缺少时只影响宏观部分。" source="default" secret>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <span className="badge">未配置</span>
                    <input className="input" type="password" placeholder="输入密钥" />
                  </div>
                </SettingRow>
                <SettingRow name="SEC EDGAR User-Agent" machineKey="SEC_EDGAR_USER_AGENT" desc="SEC 要求的联系信息。SEC 提供部分 XBRL 数值，不等于阅读全文，缓存 24 小时。" source="env">
                  <input className="input" defaultValue="Example Name you@example.com" />
                </SettingRow>
              </section>
            )}

            {group !== "models" && group !== "data" && (
              <section className="panel panel-pad">
                <Banner kind="info">此分组在原型中省略；实现时按后端 schema 自动生成同样的设置行。</Banner>
              </section>
            )}

            <Banner kind="ok" title="已保存为 revision 4。">
              将用于新任务；正在运行的 1 个任务继续使用 revision 3。
            </Banner>
          </div>
        </div>
      </div>
    </>
  );
}

function swap<T>(arr: T[], i: number, j: number) {
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
