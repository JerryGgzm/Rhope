import { ArrowDown, ArrowUp, ExternalLink, Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { PageHead } from "../../app/Shell";
import { useToast } from "../../components/Toast";
import { Button, DemoMark, Notice } from "../../components/ui";

const GROUPS = [
  { key: "models", label: "模型与认证" },
  { key: "data", label: "数据来源" },
  { key: "research", label: "研究参数" },
  { key: "output", label: "输出与存储" },
  { key: "network", label: "网络与高级" },
  { key: "about", label: "关于" },
] as const;

type Source = "default" | "env" | "web" | "inherit";
const SOURCE_LABEL: Record<Source, string> = {
  default: "内置默认",
  env: "来自 .env",
  web: "已保存",
  inherit: "继承",
};

function Setting({
  name,
  machineKey,
  desc,
  source,
  secret,
  note,
  children,
}: {
  name: string;
  machineKey: string;
  desc: string;
  source: Source;
  secret?: boolean;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting">
      <div className="setting-meta">
        <span className="setting-name">{name}</span>
        <span className="setting-desc">{desc}</span>
        <div className="setting-tags">
          <span className="tag tag-mono">{machineKey}</span>
          <span className="tag">{SOURCE_LABEL[source]}</span>
          {secret && <span className="tag">敏感</span>}
          {note && <span className="tag tag-caution">{note}</span>}
        </div>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function SecretInput({ configured, source }: { configured: boolean; source?: string }) {
  const [value, setValue] = useState("");
  return (
    <div className="stack-sm">
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input
          className="input"
          type="password"
          placeholder={configured ? "••••••••  留空表示不修改" : "输入密钥"}
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {configured && (
          <Button size="sm" variant="ghost">
            清除
          </Button>
        )}
      </div>
      <span className="status micro">
        <span className="dot" data-tone={configured ? "ok" : "hollow"} aria-hidden />
        {configured ? `已配置${source ? ` · ${source}` : ""}` : "未配置"}
      </span>
    </div>
  );
}

export function SettingsPage() {
  const toast = useToast();
  const [group, setGroup] = useState<(typeof GROUPS)[number]["key"]>("models");
  const [chain, setChain] = useState(["sec_edgar", "yfinance"]);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(3);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      setRevision((r) => r + 1);
      setSaved(true);
      toast(`已保存 · revision ${revision + 1}`);
    }, 700);
  };

  return (
    <>
      <PageHead
        title="设置"
        sub={
          <>
            revision {revision} · 保存后用于新任务，正在运行的任务不受影响 <DemoMark />
          </>
        }
        actions={
          <Button variant="solid" size="sm" loading={saving} onClick={save}>
            保存
          </Button>
        }
      />

      <div className="settings">
        <nav className="settings-nav" aria-label="设置分组">
          {GROUPS.map((g) => (
            <button key={g.key} aria-current={g.key === group} onClick={() => setGroup(g.key)}>
              {g.label}
            </button>
          ))}
        </nav>

        <div className="stack-xl" key={group} style={{ animation: "tab-in var(--d-base) var(--ease-out)" }}>
          {saved && (
            <Notice kind="ok" title={`已保存为 revision ${revision}。`}>
              将用于新任务；正在运行的 1 个任务继续使用 revision {revision - 1}。
            </Notice>
          )}

          {group === "models" && (
            <>
              <section>
                <div className="row-between" style={{ marginBottom: 4 }}>
                  <h2 className="section-title">主模型</h2>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={testing}
                    onClick={() => {
                      setTesting(true);
                      window.setTimeout(() => {
                        setTesting(false);
                        toast("配置完整 · 未调用模型（演示）");
                      }, 900);
                    }}
                  >
                    测试连接
                  </Button>
                </div>
                <Setting name="模型提供方" machineKey="llm_provider" desc="快速层与深度层默认使用的 provider。" source="web">
                  <select className="select" defaultValue="openai">
                    {["openai", "chatgpt", "anthropic", "google", "deepseek", "qwen", "ollama", "openrouter", "bedrock"].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </Setting>
                <Setting name="快速层模型" machineKey="quick_think_llm" desc="分析师与辩论使用。可填目录外的模型 ID，由后端校验。" source="web">
                  <input className="input mono" defaultValue="gpt-5.4-mini" />
                </Setting>
                <Setting name="深度层模型" machineKey="deep_think_llm" desc="研究经理与投资组合经理使用。" source="env">
                  <input className="input mono" defaultValue="gpt-5.4" />
                  <span className="field-hint">.env 与已保存值不同时，这里会同时显示两者和实际生效值。</span>
                </Setting>
                <Setting name="深度层 provider" machineKey="deep_think_provider" desc="留空则继承主 provider。" source="inherit">
                  <select className="select" defaultValue="">
                    <option value="">继承 · openai</option>
                    <option>anthropic</option>
                    <option>deepseek</option>
                  </select>
                </Setting>
                <Setting name="temperature" machineKey="temperature" desc="留空使用模型默认值。" source="default" note="chatgpt 不支持">
                  <input className="input num" placeholder="默认" />
                </Setting>
              </section>

              <section>
                <div className="row-between" style={{ marginBottom: 4 }}>
                  <h2 className="section-title">API Key</h2>
                  <span className="small t3">只显示是否已配置，不回传密钥</span>
                </div>
                <Setting name="OpenAI" machineKey="OPENAI_API_KEY" desc="openai provider 使用。" source="web" secret>
                  <SecretInput configured />
                </Setting>
                <Setting name="DeepSeek" machineKey="DEEPSEEK_API_KEY" desc="deepseek provider 使用。" source="default" secret>
                  <SecretInput configured={false} />
                </Setting>
                <Setting name="通义千问 · 中国区" machineKey="DASHSCOPE_CN_API_KEY" desc="与国际区的密钥和端点相互独立。" source="env" secret>
                  <SecretInput configured source="来自 .env" />
                </Setting>
              </section>

              <section className="stack">
                <div className="row-between">
                  <h2 className="section-title">ChatGPT 订阅</h2>
                  <span className="status">
                    <span className="dot" data-tone="hollow" aria-hidden />
                    未登录
                  </span>
                </div>
                <p className="small t2" style={{ maxWidth: 560 }}>
                  使用 ChatGPT 订阅代替 API Key。登录会在浏览器打开 OpenAI 授权页，完成后自动返回此页。
                </p>
                <div className="row">
                  <Button icon={<ExternalLink size={15} />}>登录 ChatGPT</Button>
                  <button className="text-link small t2">无法自动返回？粘贴回调地址</button>
                </div>
              </section>
            </>
          )}

          {group === "data" && (
            <section>
              <div className="row-between" style={{ marginBottom: 4 }}>
                <h2 className="section-title">数据来源</h2>
                <Button size="sm" variant="ghost">
                  测试数据源
                </Button>
              </div>
              <Setting
                name="资产负债表来源"
                machineKey="tool_vendors.get_balance_sheet"
                desc="按顺序尝试，只尝试列出的来源；优先于类别设置。"
                source="web"
              >
                <div className="chain">
                  {chain.map((v, i) => (
                    <div className="chain-item" key={v}>
                      <span className="idx">{i + 1}</span>
                      <span className="mono">{v}</span>
                      <span style={{ marginLeft: "auto" }} className="row">
                        <Button size="sm" variant="ghost" aria-label="上移" disabled={i === 0} onClick={() => setChain((c) => swap(c, i, i - 1))} icon={<ArrowUp size={14} />} />
                        <Button size="sm" variant="ghost" aria-label="下移" disabled={i === chain.length - 1} onClick={() => setChain((c) => swap(c, i, i + 1))} icon={<ArrowDown size={14} />} />
                        <Button size="sm" variant="ghost" aria-label="移除" onClick={() => setChain((c) => c.filter((x) => x !== v))} icon={<X size={14} />} />
                      </span>
                    </div>
                  ))}
                  <div style={{ paddingTop: 8 }}>
                    <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => !chain.includes("alpha_vantage") && setChain((c) => [...c, "alpha_vantage"])}>
                      添加来源
                    </Button>
                  </div>
                </div>
                <span className="field-hint mono">保存为 {chain.join(",") || "（使用类别设置）"}</span>
              </Setting>
              <Setting name="FRED" machineKey="FRED_API_KEY" desc="宏观数据。可选，缺少时只影响宏观部分。" source="default" secret>
                <SecretInput configured={false} />
              </Setting>
              <Setting name="SEC EDGAR User-Agent" machineKey="SEC_EDGAR_USER_AGENT" desc="SEC 要求的联系信息。提供部分 XBRL 数值，缓存 24 小时。" source="env">
                <input className="input" defaultValue="Example Name you@example.com" />
              </Setting>
            </section>
          )}

          {group !== "models" && group !== "data" && (
            <p className="small t3">此分组在原型中省略；实现时按后端 schema 生成同样的设置行。</p>
          )}
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
