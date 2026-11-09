import { Plus, RotateCcw, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { PageHead } from "../../app/Shell";
import { Disclosure } from "../../components/Disclosure";
import { useToast } from "../../components/Toast";
import { Button, Empty, Notice, Switch } from "../../components/ui";
import { ApiError, errorText } from "../../lib/api/client";
import { useCapabilities, useHealth, useSaveCredentials, useSaveSettings, useSettings } from "../../lib/api/hooks";
import type { Credential, SettingField, SettingsDoc } from "../../lib/api/types";
import { t, useLang } from "../../lib/i18n";
import { formatStamp } from "../../lib/labels";

const sourceLabel = (s: SettingField["source"]) =>
  s === "web" ? t("已保存", "Saved") : s === "env" ? t("来自环境 / .env", "From env / .env") : t("内置默认", "Built-in default");

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
          <span className="tag">{dirty ? t("未保存", "Unsaved") : sourceLabel(field.source)}</span>
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
            {restoreText(field.inherited)}
          </button>
        )}
      </div>
    </div>
  );
}

function display(v: unknown): string {
  if (v == null) return t("未设置", "unset");
  if (typeof v === "boolean") return v ? t("开", "on") : t("关", "off");
  if (Array.isArray(v)) return t(`${v.length} 项`, `${v.length} items`);
  if (typeof v === "object") return t(`${Object.keys(v as object).length} 项`, `${Object.keys(v as object).length} entries`);
  return String(v);
}

function restoreText(inherited: unknown, onSave = false): string {
  const target = inherited == null ? t("默认", "the default") : t(`继承值 ${display(inherited)}`, `inherited value ${display(inherited)}`);
  return onSave ? t(`保存后恢复为${target}`, `Reverts to ${target} on save`) : t(`恢复为${target}`, `Revert to ${target}`);
}

function Control({ field, value, onChange }: { field: SettingField; value: unknown; onChange: (v: unknown) => void }) {
  const placeholder = field.nullable
    ? field.inherited == null
      ? t("留空使用默认", "Empty uses the default")
      : t(`留空继承 ${display(field.inherited)}`, `Empty inherits ${display(field.inherited)}`)
    : undefined;
  switch (field.type) {
    case "boolean":
      return <Switch checked={Boolean(value)} onChange={onChange} label={field.label} />;
    case "enum":
      return (
        <select className="select" value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value || null)}>
          {field.nullable && <option value="">{field.inherited == null ? t("默认", "Default") : `${t("继承", "Inherit")} · ${display(field.inherited)}`}</option>}
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
          placeholder={t("每行一项", "One per line")}
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
      {entries.length === 0 && <span className="small t3">{t("没有条目", "No entries")}</span>}
      {entries.map(([k, v]) => (
        <div className="chain-item" key={k} style={{ gap: 10 }}>
          <span className="mono small" style={{ minWidth: 150 }}>
            {k || t("（默认）", "(default)")}
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
              aria-label={t(`移除 ${k}`, `Remove ${k}`)}
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
            placeholder={t("新键，例如 get_news", "New key, e.g. get_news")}
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
            {t("添加", "Add")}
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
          <span className="tag">{t("敏感", "Secret")}</span>
          {cred.optional && <span className="tag">{t("可选", "Optional")}</span>}
        </div>
      </div>
      <div className="setting-control">
        <form
          className="row"
          style={{ flexWrap: "nowrap" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) submit({ set: { [cred.name]: value } }, t(`${cred.name} 已保存`, `${cred.name} saved`));
          }}
        >
          <input
            className="input"
            type="password"
            placeholder={cred.configured ? t("••••••••  留空表示不修改", "••••••••  leave empty to keep") : t("输入密钥", "Enter key")}
            autoComplete="new-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={cred.name}
          />
          <Button size="sm" type="submit" disabled={!value.trim()} loading={save.isPending}>
            {t("保存", "Save")}
          </Button>
          {cred.source === "web" && (
            <Button size="sm" variant="ghost" onClick={() => submit({ clear: [cred.name] }, t(`${cred.name} 已清除`, `${cred.name} cleared`))}>
              {t("清除", "Clear")}
            </Button>
          )}
        </form>
        <span className="status micro">
          <span className="dot" data-tone={cred.configured ? "ok" : "hollow"} aria-hidden />
          {cred.configured
            ? cred.source === "web"
              ? t("已配置 · 保存在本机凭证文件", "Configured · in the local credentials file")
              : t("已配置 · 来自环境 / .env（在此保存会优先使用）", "Configured · from env / .env (a key saved here takes precedence)")
            : t("未配置", "Not configured")}
        </span>
      </div>
    </div>
  );
}

export function SettingsPage() {
  useLang();
  const settings = useSettings();
  if (settings.isError) return <Empty title={t("无法读取设置", "Could not load settings")}>{errorText(settings.error)}</Empty>;
  if (!settings.data) return <div className="skeleton" style={{ height: 320 }} aria-busy />;
  return <SettingsView doc={settings.data} refetch={() => settings.refetch()} />;
}

function SettingsView({ doc, refetch }: { doc: SettingsDoc; refetch: () => void }) {
  const toast = useToast();
  const health = useHealth();
  const caps = useCapabilities();
  const save = useSaveSettings();
  const groups = [...doc.groups, { id: "about", label: t("关于", "About") }];
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
          toast(t(`已保存为 revision ${next.revision}，用于新任务`, `Saved as revision ${next.revision} for new runs`));
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
        title={t("设置", "Settings")}
        sub={
          <>
            revision {doc.revision}
            {doc.saved_at ? ` · ${t("保存于", "saved")} ${formatStamp(doc.saved_at)}` : t(" · 尚未保存过", " · never saved")} ·{" "}
            {t("保存后用于新任务，正在运行的任务不受影响", "applies to new runs; running ones are unaffected")}
          </>
        }
        actions={
          <>
            {dirtyCount > 0 && (
              <Button size="sm" variant="ghost" onClick={discard}>
                {t("放弃修改", "Discard changes")}
              </Button>
            )}
            <Button variant="solid" size="sm" loading={save.isPending} disabled={dirtyCount === 0} onClick={submit}>
              {dirtyCount ? t(`保存 ${dirtyCount} 项`, `Save ${dirtyCount}`) : t("保存", "Save")}
            </Button>
          </>
        }
      />

      <div className="settings">
        <nav className="settings-nav" aria-label={t("设置分组", "Settings groups")}>
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
              title={t("设置已在其他地方更新。", "Settings were updated elsewhere.")}
              actions={
                <Button
                  size="sm"
                  onClick={() => {
                    save.reset();
                    refetch();
                  }}
                >
                  {t("载入最新", "Load latest")}
                </Button>
              }
            >
              {t("你的修改尚未保存；载入最新版本后可再次修改。", "Your changes were not saved; load the latest version and change it again.")}
            </Notice>
          )}
          {serverError && serverError.body.code !== "SETTINGS_REVISION_STALE" && (
            <Notice kind="error" title={serverError.body.message}>
              {serverError.body.field_errors.map((e) => `${e.key}: ${e.message}`).join(t("；", "; "))}
            </Notice>
          )}

          {group === "about" ? (
            <section className="stack">
              <dl className="kv">
                <dt>Rhope</dt>
                <dd className="mono">{health.data?.version ?? caps.data?.version ?? "—"}</dd>
                <dt>{t("本地存储", "Local storage")}</dt>
                <dd>{health.data?.storage === "ok" ? t("正常", "OK") : (health.data?.storage ?? "—")}</dd>
                <dt>{t("设置版本", "Settings")}</dt>
                <dd>revision {doc.revision}</dd>
                <dt>{t("访问范围", "Access")}</dt>
                <dd>
                  {t(
                    "仅本机（127.0.0.1）。分析会调用你配置的外部模型与数据服务。",
                    "This machine only (127.0.0.1). Analyses call the model and data services you configure.",
                  )}
                </dd>
                <dt>{t("密钥存放", "Keys")}</dt>
                <dd>
                  {t(
                    "本机凭证文件（权限 0600），不会返回浏览器、写入报告或日志。",
                    "A local credentials file (mode 0600); never sent to the browser or written to reports or logs.",
                  )}
                </dd>
              </dl>
            </section>
          ) : (
            <>
              <section>
                {fields.map((f) => {
                  const id = fieldId(f);
                  const inapplicable =
                    f.providers.length && !f.providers.some((p) => inUse.has(p)) ? t(`仅 ${f.providers.join(" / ")}`, `${f.providers.join(" / ")} only`) : undefined;
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
                          {restoreText(f.inherited, true)}{" "}
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
                            {t("撤销", "Undo")}
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
                      <span className="small t3">
                        {t("只显示是否已配置，不回传密钥；保存立即生效于新任务", "Shows only whether a key is set, never the key; saving applies to new runs at once")}
                      </span>
                    </div>
                    {activeCreds.length === 0 && <p className="small t3">{t("当前 provider 不需要 API Key。", "The current provider needs no API key.")}</p>}
                    {activeCreds.map((c) => (
                      <SecretRow key={c.name} cred={c} />
                    ))}
                    {otherCreds.length > 0 && (
                      <Disclosure title={t("其他 provider", "Other providers")} meta={<span className="small t3">{otherCreds.length}</span>}>
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
                    <h2 className="section-title">{t("ChatGPT 订阅", "ChatGPT subscription")}</h2>
                    <p className="small t2" style={{ maxWidth: 560 }}>
                      {t(
                        "使用 ChatGPT 订阅代替 API Key。网页登录流程尚未接入；目前可在终端运行",
                        "Use a ChatGPT subscription instead of an API key. Web sign-in isn't connected yet; for now run",
                      )}{" "}
                      <span className="mono">tradingagents login chatgpt</span>{" "}
                      {t("登录，之后选择 provider", "in a terminal, then choose the provider")}{" "}
                      <span className="mono">chatgpt</span> {t("即可在这里运行。", "to run here.")}
                    </p>
                  </section>
                </>
              )}

              {group === "data" && (
                <section>
                  <div className="row-between" style={{ marginBottom: 4 }}>
                    <h2 className="section-title">{t("数据源密钥", "Data source keys")}</h2>
                    <span className="small t3">
                      {t("可选；缺少时对应数据会缺失，并在运行记录中标出", "Optional; without one that data is missing and flagged in the run log")}
                    </span>
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
        <div className="savebar" role="region" aria-label={t("未保存的修改", "Unsaved changes")}>
          <span className="small t2">{t(`${dirtyCount} 项未保存`, `${dirtyCount} unsaved`)}</span>
          <div className="row" style={{ gap: 8 }}>
            <Button size="sm" variant="ghost" onClick={discard}>
              {t("放弃", "Discard")}
            </Button>
            <Button variant="solid" size="sm" loading={save.isPending} onClick={submit}>
              {t("保存", "Save")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
