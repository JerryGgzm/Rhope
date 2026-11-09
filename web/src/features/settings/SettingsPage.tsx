import { Plus, RotateCcw, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { PageHead } from "../../app/Shell";
import { Disclosure } from "../../components/Disclosure";
import { useToast } from "../../components/Toast";
import { Button, Empty, Notice, Switch } from "../../components/ui";
import { ApiError, errorText } from "../../lib/api/client";
import { useCapabilities, useHealth, useSaveCredentials, useSaveSettings, useSettings } from "../../lib/api/hooks";
import type { Credential, SettingField, SettingsDoc } from "../../lib/api/types";
import { formatStamp } from "../../lib/labels";

const SOURCE_LABEL = { web: "已保存", env: "来自环境 / .env", default: "内置默认" } as const;

type Draft = Record<string, unknown>;

function fieldId(f: SettingField) {
  return `${f.kind}:${f.key}`;
}

function Setting({
  field,
  dirty,
  error,
  inapplicable,
  onReset,
  children,
}: {
  field: SettingField;
  dirty: boolean;
  error?: string;
  inapplicable?: string;
  onReset?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="setting">
      <div className="setting-meta">
        <span className="setting-name">{field.label}</span>
        {field.description && <span className="setting-desc">{field.description}</span>}
        <div className="setting-tags">
          <span className="tag tag-mono">{field.env && field.kind === "env" ? field.env : field.key}</span>
          <span className="tag">{dirty ? "未保存" : SOURCE_LABEL[field.source]}</span>
          {field.source === "env" && field.env && field.kind === "config" && <span className="tag tag-mono">{field.env}</span>}
          {inapplicable && <span className="tag">{inapplicable}</span>}
        </div>
      </div>
      <div className="setting-control">
        {children}
        {error ? (
          <div className="field-error" role="alert">
            <span>{error}</span>
          </div>
        ) : null}
        {field.source === "web" && onReset && !dirty && (
          <button className="text-link micro t2" style={{ alignSelf: "flex-start" }} onClick={onReset}>
            <RotateCcw size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
            恢复为{field.inherited == null ? "默认" : `继承值 ${display(field.inherited)}`}
          </button>
        )}
      </div>
    </div>
  );
}

function display(v: unknown): string {
  if (v == null) return "未设置";
  if (typeof v === "boolean") return v ? "开" : "关";
  if (Array.isArray(v)) return `${v.length} 项`;
  if (typeof v === "object") return `${Object.keys(v as object).length} 项`;
  return String(v);
}

function Control({ field, value, onChange }: { field: SettingField; value: unknown; onChange: (v: unknown) => void }) {
  const placeholder = field.nullable ? (field.inherited == null ? "留空使用默认" : `留空继承 ${display(field.inherited)}`) : undefined;
  switch (field.type) {
    case "boolean":
      return <Switch checked={Boolean(value)} onChange={onChange} label={field.label} />;
    case "enum":
      return (
        <select className="select" value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value || null)}>
          {field.nullable && <option value="">{field.inherited == null ? "默认" : `继承 · ${display(field.inherited)}`}</option>}
          {field.enum.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "integer":
    case "number":
      return (
        <input
          className="input num"
          type="number"
          step={field.type === "integer" ? 1 : "any"}
          min={field.minimum ?? undefined}
          max={field.maximum ?? undefined}
          placeholder={placeholder}
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "string_list":
      return (
        <textarea
          className="textarea"
          rows={Math.min(8, Math.max(3, ((value as string[]) ?? []).length + 1))}
          value={((value as string[]) ?? []).join("\n")}
          onChange={(e) => onChange(e.target.value.split("\n"))}
          placeholder="每行一项"
        />
      );
    case "map":
      return <MapEditor value={(value as Record<string, string>) ?? {}} onChange={onChange} fixedKeys={field.key === "data_vendors"} />;
    default:
      return (
        <input
          className={`input${field.type === "string" && !field.key.includes("language") ? " mono" : ""}`}
          placeholder={placeholder}
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" && field.nullable ? null : e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      );
  }
}

function MapEditor({
  value,
  onChange,
  fixedKeys,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  fixedKeys: boolean;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(value);
  return (
    <div className="chain">
      {entries.length === 0 && <span className="small t3">没有条目</span>}
      {entries.map(([k, v]) => (
        <div className="chain-item" key={k} style={{ gap: 10 }}>
          <span className="mono small" style={{ minWidth: 150 }}>
            {k || "（默认）"}
          </span>
          <input
            className="input input-bare mono small"
            value={v}
            onChange={(e) => onChange({ ...value, [k]: e.target.value })}
            aria-label={k}
            spellCheck={false}
          />
          {!fixedKeys && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`移除 ${k}`}
              icon={<X size={14} />}
              onClick={() => {
                const next = { ...value };
                delete next[k];
                onChange(next);
              }}
            />
          )}
        </div>
      ))}
      {!fixedKeys && (
        <div className="row" style={{ paddingTop: 8, flexWrap: "nowrap" }}>
          <input
            className="input input-bare mono small"
            placeholder="新键，例如 get_news"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            spellCheck={false}
          />
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus size={14} />}
            disabled={!newKey.trim() || newKey.trim() in value}
            onClick={() => {
              onChange({ ...value, [newKey.trim()]: "" });
              setNewKey("");
            }}
          >
            添加
          </Button>
        </div>
      )}
    </div>
  );
}

function SecretRow({ cred }: { cred: Credential }) {
  const [value, setValue] = useState("");
  const save = useSaveCredentials();
  const toast = useToast();
  const submit = (body: { set?: Record<string, string>; clear?: string[] }, done: string) =>
    save.mutate(body, {
      onSuccess: () => {
        setValue("");
        toast(done);
      },
      onError: (e) => toast(errorText(e)),
    });
  return (
    <div className="setting">
      <div className="setting-meta">
        <span className="setting-name">{cred.label}</span>
        <div className="setting-tags">
          <span className="tag tag-mono">{cred.name}</span>
          <span className="tag">敏感</span>
          {cred.optional && <span className="tag">可选</span>}
        </div>
      </div>
      <div className="setting-control">
        <form
          className="row"
          style={{ flexWrap: "nowrap" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) submit({ set: { [cred.name]: value } }, `${cred.name} 已保存`);
          }}
        >
          <input
            className="input"
            type="password"
            placeholder={cred.configured ? "••••••••  留空表示不修改" : "输入密钥"}
            autoComplete="new-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={cred.name}
          />
          <Button size="sm" type="submit" disabled={!value.trim()} loading={save.isPending}>
            保存
          </Button>
          {cred.source === "web" && (
            <Button size="sm" variant="ghost" onClick={() => submit({ clear: [cred.name] }, `${cred.name} 已清除`)}>
              清除
            </Button>
          )}
        </form>
        <span className="status micro">
          <span className="dot" data-tone={cred.configured ? "ok" : "hollow"} aria-hidden />
          {cred.configured
            ? cred.source === "web"
              ? "已配置 · 保存在本机凭证文件"
              : "已配置 · 来自环境 / .env（在此保存会优先使用）"
            : "未配置"}
        </span>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  if (settings.isError) return <Empty title="无法读取设置">{errorText(settings.error)}</Empty>;
  if (!settings.data) return <div className="skeleton" style={{ height: 320 }} aria-busy />;
  return <SettingsView doc={settings.data} refetch={() => settings.refetch()} />;
}

function SettingsView({ doc, refetch }: { doc: SettingsDoc; refetch: () => void }) {
  const toast = useToast();
  const health = useHealth();
  const caps = useCapabilities();
  const save = useSaveSettings();
  const groups = [...doc.groups, { id: "about", label: "关于" }];
  const [group, setGroup] = useState(groups[0].id);
  const [draft, setDraft] = useState<Draft>({});
  const [resets, setResets] = useState<Set<string>>(new Set());

  const byId = useMemo(() => new Map(doc.fields.map((f) => [fieldId(f), f])), [doc]);
  const value = (f: SettingField) => (fieldId(f) in draft ? draft[fieldId(f)] : f.value);
  const effective = (key: string) => {
    const f = byId.get(`config:${key}`);
    return f ? value(f) : undefined;
  };
  const provider = String(effective("llm_provider") ?? "");
  const inUse = new Set([provider, String(effective("quick_think_provider") ?? provider), String(effective("deep_think_provider") ?? provider)]);

  const dirtyCount = Object.keys(draft).length + resets.size;
  const serverError = save.error instanceof ApiError ? save.error : null;
  const fieldError = (f: SettingField) => serverError?.fieldError(f.key);

  const change = (f: SettingField, v: unknown) => {
    setDraft((d) => ({ ...d, [fieldId(f)]: v }));
    setResets((r) => {
      const next = new Set(r);
      next.delete(fieldId(f));
      return next;
    });
  };

  const discard = () => {
    setDraft({});
    setResets(new Set());
    save.reset();
  };

  const submit = () => {
    const config: Record<string, unknown> = {};
    const env: Record<string, unknown> = {};
    for (const [id, v] of Object.entries(draft)) {
      const f = byId.get(id)!;
      let out = v;
      if (f.type === "string_list") out = ((v as string[]) ?? []).map((s) => s.trim()).filter(Boolean);
      (f.kind === "config" ? config : env)[f.key] = out;
    }
    const reset = [...resets].filter((id) => id.startsWith("config:")).map((id) => id.slice(7));
    const env_reset = [...resets].filter((id) => id.startsWith("env:")).map((id) => id.slice(4));
    save.mutate(
      { base_revision: doc.revision, config, env, reset, env_reset },
      {
        onSuccess: (next) => {
          setDraft({});
          setResets(new Set());
          toast(`已保存为 revision ${next.revision}，用于新任务`);
        },
      },
    );
  };

  const fields = doc.fields.filter((f) => f.group === group);
  const llmCreds = doc.credentials.filter((c) => c.group === "llm");
  const activeCreds = llmCreds.filter((c) => c.providers.some((p) => inUse.has(p)));
  const otherCreds = llmCreds.filter((c) => !activeCreds.includes(c));

  return (
    <>
      <PageHead
        title="设置"
        sub={
          <>
            revision {doc.revision}
            {doc.saved_at ? ` · 保存于 ${formatStamp(doc.saved_at)}` : " · 尚未保存过"} · 保存后用于新任务，正在运行的任务不受影响
          </>
        }
        actions={
          <>
            {dirtyCount > 0 && (
              <Button size="sm" variant="ghost" onClick={discard}>
                放弃修改
              </Button>
            )}
            <Button variant="solid" size="sm" loading={save.isPending} disabled={dirtyCount === 0} onClick={submit}>
              保存{dirtyCount ? ` ${dirtyCount} 项` : ""}
            </Button>
          </>
        }
      />

      <div className="settings">
        <nav className="settings-nav" aria-label="设置分组">
          {groups.map((g) => (
            <button key={g.id} aria-current={g.id === group ? "true" : undefined} onClick={() => setGroup(g.id)}>
              {g.label}
            </button>
          ))}
        </nav>

        <div className="stack-xl" key={group} style={{ animation: "tab-in var(--d-base) var(--ease-out)" }}>
          {serverError?.body.code === "SETTINGS_REVISION_STALE" && (
            <Notice
              kind="warn"
              title="设置已在其他地方更新。"
              actions={
                <Button
                  size="sm"
                  onClick={() => {
                    save.reset();
                    refetch();
                  }}
                >
                  载入最新
                </Button>
              }
            >
              你的修改尚未保存；载入最新版本后可再次修改。
            </Notice>
          )}
          {serverError && serverError.body.code !== "SETTINGS_REVISION_STALE" && (
            <Notice kind="error" title={serverError.body.message}>
              {serverError.body.field_errors.map((e) => `${e.key}：${e.message}`).join("；")}
            </Notice>
          )}

          {group === "about" ? (
            <section className="stack">
              <dl className="kv">
                <dt>TradingAgents</dt>
                <dd className="mono">{health.data?.version ?? caps.data?.version ?? "—"}</dd>
                <dt>本地存储</dt>
                <dd>{health.data?.storage === "ok" ? "正常" : (health.data?.storage ?? "—")}</dd>
                <dt>设置版本</dt>
                <dd>revision {doc.revision}</dd>
                <dt>访问范围</dt>
                <dd>仅本机（127.0.0.1）。分析会调用你配置的外部模型与数据服务。</dd>
                <dt>密钥存放</dt>
                <dd>本机凭证文件（权限 0600），不会返回浏览器、写入报告或日志。</dd>
              </dl>
            </section>
          ) : (
            <>
              <section>
                {fields.map((f) => {
                  const id = fieldId(f);
                  const inapplicable =
                    f.providers.length && !f.providers.some((p) => inUse.has(p)) ? `仅 ${f.providers.join(" / ")}` : undefined;
                  return (
                    <Setting
                      key={id}
                      field={f}
                      dirty={id in draft || resets.has(id)}
                      error={fieldError(f)}
                      inapplicable={inapplicable}
                      onReset={() => setResets((r) => new Set(r).add(id))}
                    >
                      {resets.has(id) ? (
                        <span className="small t2">
                          保存后恢复为{f.inherited == null ? "默认" : `继承值 ${display(f.inherited)}`}{" "}
                          <button
                            className="text-link"
                            onClick={() =>
                              setResets((r) => {
                                const next = new Set(r);
                                next.delete(id);
                                return next;
                              })
                            }
                          >
                            撤销
                          </button>
                        </span>
                      ) : (
                        <Control field={f} value={value(f)} onChange={(v) => change(f, v)} />
                      )}
                    </Setting>
                  );
                })}
              </section>

              {group === "model" && (
                <>
                  <section>
                    <div className="row-between" style={{ marginBottom: 4 }}>
                      <h2 className="section-title">API Key</h2>
                      <span className="small t3">只显示是否已配置，不回传密钥；保存立即生效于新任务</span>
                    </div>
                    {activeCreds.length === 0 && <p className="small t3">当前 provider 不需要 API Key。</p>}
                    {activeCreds.map((c) => (
                      <SecretRow key={c.name} cred={c} />
                    ))}
                    {otherCreds.length > 0 && (
                      <Disclosure title="其他 provider" meta={<span className="small t3">{otherCreds.length} 项</span>}>
                        {otherCreds.map((c) => (
                          <SecretRow key={c.name} cred={c} />
                        ))}
                        {doc.credentials
                          .filter((c) => c.group === "aws")
                          .map((c) => (
                            <SecretRow key={c.name} cred={c} />
                          ))}
                      </Disclosure>
                    )}
                  </section>
                  <section className="stack">
                    <h2 className="section-title">ChatGPT 订阅</h2>
                    <p className="small t2" style={{ maxWidth: 560 }}>
                      使用 ChatGPT 订阅代替 API Key。网页登录流程尚未接入；目前可在终端运行{" "}
                      <span className="mono">tradingagents login chatgpt</span> 登录，之后选择 provider{" "}
                      <span className="mono">chatgpt</span> 即可在这里运行。
                    </p>
                  </section>
                </>
              )}

              {group === "data" && (
                <section>
                  <div className="row-between" style={{ marginBottom: 4 }}>
                    <h2 className="section-title">数据源密钥</h2>
                    <span className="small t3">可选；缺少时对应数据会缺失，并在运行记录中标出</span>
                  </div>
                  {doc.credentials
                    .filter((c) => c.group === "data")
                    .map((c) => (
                      <SecretRow key={c.name} cred={c} />
                    ))}
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {dirtyCount > 0 && (
        <div className="savebar" role="region" aria-label="未保存的修改">
          <span className="small t2">{dirtyCount} 项未保存</span>
          <div className="row" style={{ gap: 8 }}>
            <Button size="sm" variant="ghost" onClick={discard}>
              放弃
            </Button>
            <Button variant="solid" size="sm" loading={save.isPending} onClick={submit}>
              保存
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
