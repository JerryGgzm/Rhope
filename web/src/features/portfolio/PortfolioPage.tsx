import { ArrowUpRight, ChevronDown, Plus, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHead } from "../../app/Shell";
import { Menu } from "../../components/Menu";
import { useToast } from "../../components/Toast";
import { Button, DemoMark, Field, Notice } from "../../components/ui";
import { demoPortfolio } from "../../demo/fixtures";

type Row = { key: number; ticker: string; quantity: string; avg: string; note: string };

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
      toast(`已保存为 v${version + 1}`);
    }, 700);
  };

  return (
    <>
      <PageHead
        title="持仓"
        sub="当前为手动持仓快照 · 不记录交易，不计算市值或盈亏"
        actions={
          <>
            <Menu
              trigger={({ toggle, ref, open }) => (
                <Button ref={ref} size="sm" variant="ghost" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
                  {demoPortfolio.name} · v{version} <ChevronDown size={14} />
                </Button>
              )}
            >
              {(close) => (
                <>
                  {[version, version - 1, version - 2].map((v) => (
                    <button key={v} className="menu-item" role="menuitem" onClick={close} aria-current={v === version ? "page" : undefined}>
                      v{v} <span className="t3">{v === version ? "最新" : "历史版本"}</span>
                    </button>
                  ))}
                  <div className="menu-sep" />
                  <button className="menu-item" role="menuitem" onClick={() => { close(); toast("请选择 JSON 文件（演示）"); }}>
                    导入 JSON
                  </button>
                  <button className="menu-item" role="menuitem" onClick={() => { close(); toast("已开始下载（演示）"); }}>
                    导出 JSON
                  </button>
                </>
              )}
            </Menu>
            <Button variant="solid" size="sm" disabled={!dirty || invalid} loading={saving} onClick={save}>
              {dirty ? `保存为 v${version + 1}` : "已保存"}
            </Button>
          </>
        }
      />

      <div className="stack-xl">
        <div className="row" style={{ gap: 48, alignItems: "flex-start" }}>
          <div style={{ width: 220 }}>
            <Field label="现金" machineKey="cash" hint="留空表示未知，不会当作 0。" error={isBadNumber(cash) ? "不是有效数字" : undefined}>
              <input
                className="input num"
                inputMode="decimal"
                value={cash}
                onChange={(e) => {
                  setCash(e.target.value);
                  setDirty(true);
                }}
                placeholder="未知"
                aria-invalid={isBadNumber(cash)}
              />
            </Field>
          </div>
          <div style={{ width: 140 }}>
            <Field label="币种" machineKey="currency" hint="仅作标签。">
              <input className="input" defaultValue={demoPortfolio.currency} onChange={() => setDirty(true)} />
            </Field>
          </div>
          <div className="stack-sm small t3" style={{ paddingTop: 26 }}>
            <span>快照时间 {demoPortfolio.asOf}</span>
            <DemoMark />
          </div>
        </div>

        <section className="stack">
          <Notice kind="warn" title="可能重复：">
            <span className="mono">SAMPLE.HK</span> 与 <span className="mono">0001.HK</span> 归一后或指向同一标的。系统不会自动合并成本。
          </Notice>

          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>代码</th>
                  <th className="num">数量</th>
                  <th className="num">平均每单位成本</th>
                  <th>说明</th>
                  <th aria-label="操作" />
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
                        placeholder="代码"
                        onChange={(e) => update(r.key, { ticker: e.target.value })}
                        aria-label="代码"
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
                        aria-label="数量（负数为空头）"
                        aria-invalid={isBadNumber(r.quantity) || !r.quantity.trim()}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="input input-bare num"
                        style={{ width: 130, textAlign: "right" }}
                        value={r.avg}
                        placeholder="未提供"
                        onChange={(e) => update(r.key, { avg: e.target.value })}
                        aria-label="平均成本"
                        aria-invalid={isBadNumber(r.avg)}
                      />
                    </td>
                    <td className="t2 small">{r.note}</td>
                    <td>
                      <div className="row pf-actions" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
                        <Button size="sm" variant="ghost" icon={<ArrowUpRight size={14} />} onClick={() => navigate("/analysis")}>
                          分析
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`删除 ${r.ticker || "此行"}`}
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
                setRows((rs) => [...rs, { key: nextKey++, ticker: "", quantity: "", avg: "", note: "" }]);
                setDirty(true);
              }}
            >
              添加一行
            </Button>
          </div>
          <p className="small t3">数量为负表示空头。不同币种的持仓不会合并计算。保存会生成新版本，已关联到历史运行的版本保持不变。</p>
        </section>
      </div>
    </>
  );
}
