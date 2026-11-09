import { ArrowUpRight, ChevronDown, Plus, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHead } from "../../app/Shell";
import { Menu } from "../../components/Menu";
import { useToast } from "../../components/Toast";
import { Button, DemoMark, Field, Notice } from "../../components/ui";
import { demoPortfolio } from "../../demo/fixtures";
import { t, useLang } from "../../lib/i18n";

type Row = { key: number; ticker: string; quantity: string; avg: string; note: readonly [string, string] };

let nextKey = 100;
const toRow = (p: (typeof demoPortfolio.positions)[number], i: number): Row => ({
  key: i,
  ticker: p.ticker,
  quantity: String(p.quantity),
  avg: p.avg == null ? "" : String(p.avg),
  note: p.note,
});

const isBadNumber = (v: string) => v.trim() !== "" && !Number.isFinite(Number(v));

export function PortfolioPage() {
  useLang();
  const navigate = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(demoPortfolio.positions.map(toRow));
  const [cash, setCash] = useState(String(demoPortfolio.cash ?? ""));
  const [version, setVersion] = useState(demoPortfolio.version);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (key: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const invalid = rows.some((r) => !r.ticker.trim() || !r.quantity.trim() || isBadNumber(r.quantity) || isBadNumber(r.avg)) || isBadNumber(cash);

  const save = () => {
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      setDirty(false);
      setVersion((v) => v + 1);
      toast(t(`已保存为 v${version + 1}`, `Saved as v${version + 1}`));
    }, 700);
  };

  return (
    <>
      <PageHead
        title={t("持仓", "Portfolio")}
        sub={t("当前为手动持仓快照 · 不记录交易，不计算市值或盈亏", "A manual holdings snapshot · no trades recorded, no market value or P&L")}
        actions={
          <>
            <Menu
              trigger={({ toggle, ref, open }) => (
                <Button ref={ref} size="sm" variant="ghost" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
                  {t(...demoPortfolio.name)} · v{version} <ChevronDown size={14} />
                </Button>
              )}
            >
              {(close) => (
                <>
                  {[version, version - 1, version - 2].map((v) => (
                    <button key={v} className="menu-item" role="menuitem" onClick={close} aria-current={v === version ? "page" : undefined}>
                      v{v} <span className="t3">{v === version ? t("最新", "Latest") : t("历史版本", "Earlier")}</span>
                    </button>
                  ))}
                  <div className="menu-sep" />
                  <button className="menu-item" role="menuitem" onClick={() => { close(); toast(t("请选择 JSON 文件（演示）", "Choose a JSON file (demo)")); }}>
                    {t("导入 JSON", "Import JSON")}
                  </button>
                  <button className="menu-item" role="menuitem" onClick={() => { close(); toast(t("已开始下载（演示）", "Download started (demo)")); }}>
                    {t("导出 JSON", "Export JSON")}
                  </button>
                </>
              )}
            </Menu>
            <Button variant="solid" size="sm" disabled={!dirty || invalid} loading={saving} onClick={save}>
              {dirty ? t(`保存为 v${version + 1}`, `Save as v${version + 1}`) : t("已保存", "Saved")}
            </Button>
          </>
        }
      />

      <div className="stack-xl">
        <div className="row" style={{ gap: 48, alignItems: "flex-start" }}>
          <div style={{ width: 220 }}>
            <Field
              label={t("现金", "Cash")}
              machineKey="cash"
              hint={t("留空表示未知，不会当作 0。", "Empty means unknown, never 0.")}
              error={isBadNumber(cash) ? t("不是有效数字", "Not a valid number") : undefined}
            >
              <input
                className="input num"
                inputMode="decimal"
                value={cash}
                onChange={(e) => {
                  setCash(e.target.value);
                  setDirty(true);
                }}
                placeholder={t("未知", "Unknown")}
                aria-invalid={isBadNumber(cash)}
              />
            </Field>
          </div>
          <div style={{ width: 140 }}>
            <Field label={t("币种", "Currency")} machineKey="currency" hint={t("仅作标签。", "A label only.")}>
              <input className="input" defaultValue={demoPortfolio.currency} onChange={() => setDirty(true)} />
            </Field>
          </div>
          <div className="stack-sm small t3" style={{ paddingTop: 26 }}>
            <span>{t("快照时间", "As of")} {demoPortfolio.asOf}</span>
            <DemoMark />
          </div>
        </div>

        <section className="stack">
          <Notice kind="warn" title={t("可能重复：", "Possible duplicate:")}>
            <span className="mono">SAMPLE.HK</span> {t("与", "and")} <span className="mono">0001.HK</span>{" "}
            {t("归一后或指向同一标的。系统不会自动合并成本。", "may be the same instrument once normalized. Costs are never merged automatically.")}
          </Notice>

          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("代码", "Symbol")}</th>
                  <th className="num">{t("数量", "Quantity")}</th>
                  <th className="num">{t("平均每单位成本", "Average unit cost")}</th>
                  <th>{t("说明", "Note")}</th>
                  <th aria-label={t("操作", "Actions")} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="pf-row">
                    <td style={{ paddingLeft: 0 }}>
                      <input
                        className="input input-bare mono"
                        style={{ width: 130, fontWeight: 500 }}
                        value={r.ticker}
                        placeholder={t("代码", "Symbol")}
                        onChange={(e) => update(r.key, { ticker: e.target.value })}
                        aria-label={t("代码", "Symbol")}
                        aria-invalid={!r.ticker.trim()}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="input input-bare num"
                        style={{ width: 110, textAlign: "right" }}
                        value={r.quantity}
                        placeholder="0"
                        onChange={(e) => update(r.key, { quantity: e.target.value })}
                        aria-label={t("数量（负数为空头）", "Quantity (negative is short)")}
                        aria-invalid={isBadNumber(r.quantity) || !r.quantity.trim()}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="input input-bare num"
                        style={{ width: 130, textAlign: "right" }}
                        value={r.avg}
                        placeholder={t("未提供", "Not given")}
                        onChange={(e) => update(r.key, { avg: e.target.value })}
                        aria-label={t("平均成本", "Average cost")}
                        aria-invalid={isBadNumber(r.avg)}
                      />
                    </td>
                    <td className="t2 small">{t(...r.note)}</td>
                    <td>
                      <div className="row pf-actions" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
                        <Button size="sm" variant="ghost" icon={<ArrowUpRight size={14} />} onClick={() => navigate("/analysis")}>
                          {t("分析", "Analyze")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t(`删除 ${r.ticker || "此行"}`, `Delete ${r.ticker || "this row"}`)}
                          icon={<X size={15} />}
                          onClick={() => {
                            setRows((rs) => rs.filter((x) => x.key !== r.key));
                            setDirty(true);
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={15} />}
              onClick={() => {
                setRows((rs) => [...rs, { key: nextKey++, ticker: "", quantity: "", avg: "", note: ["", ""] }]);
                setDirty(true);
              }}
            >
              {t("添加一行", "Add row")}
            </Button>
          </div>
          <p className="small t3">
            {t(
              "数量为负表示空头。不同币种的持仓不会合并计算。保存会生成新版本，已关联到历史运行的版本保持不变。",
              "A negative quantity is short. Holdings in different currencies are never combined. Saving creates a new version; versions linked to past runs stay unchanged.",
            )}
          </p>
        </section>
      </div>
    </>
  );
}
