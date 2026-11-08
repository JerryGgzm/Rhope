import { Download, LineChart, Plus, Save, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Topbar } from "../../app/Shell";
import { Banner, Field } from "../../components/ui";
import { demoPortfolio } from "../../demo/fixtures";

type Row = { ticker: string; quantity: string; avg: string; note: string };

const toRow = (p: (typeof demoPortfolio.positions)[number]): Row => ({
  ticker: p.ticker,
  quantity: String(p.quantity),
  avg: p.avg == null ? "" : String(p.avg),
  note: p.note,
});

function numError(v: string, required: boolean) {
  if (!v.trim()) return required ? "必填" : null;
  const n = Number(v);
  return Number.isFinite(n) ? null : "不是有效数字";
}

export function PortfolioPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>(demoPortfolio.positions.map(toRow));
  const [cash, setCash] = useState(String(demoPortfolio.cash ?? ""));
  const [dirty, setDirty] = useState(false);

  const update = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  return (
    <>
      <Topbar
        title="持仓"
        crumb="当前为手动持仓快照"
        actions={
          <>
            <button className="btn btn-sm">
              <Upload size={15} /> 导入 JSON
            </button>
            <button className="btn btn-sm">
              <Download size={15} /> 导出 JSON
            </button>
          </>
        }
      />
      <div className="page">
        <div className="page-head">
          <div>
            <div className="row">
              <h2>{demoPortfolio.name}</h2>
              <span className="badge badge-blue">v{demoPortfolio.version}</span>
              <span className="demo-tag">演示数据</span>
            </div>
            <p>
              快照时间 {demoPortfolio.asOf} · 保存后生成新版本，已关联到历史运行的旧版本不会被改变。
            </p>
          </div>
          <div className="row">
            <select className="select" style={{ width: 200 }} aria-label="选择快照">
              <option>主账户 · v3（最新）</option>
              <option>主账户 · v2</option>
              <option>主账户 · v1</option>
            </select>
            <button className="btn btn-primary" disabled={!dirty}>
              <Save size={15} /> 保存为 v{demoPortfolio.version + 1}
            </button>
          </div>
        </div>

        <Banner kind="info">
          这里编辑的是“当前持仓快照”，不是交易记录。不会根据买卖自动计算成本，也不会显示市值或实时盈亏。
        </Banner>

        <div className="grid-2" style={{ maxWidth: 640 }}>
          <Field label="现金" machineKey="cash" hint="留空表示现金未知，不会被当作 0。">
            <input
              className="input num"
              inputMode="decimal"
              value={cash}
              onChange={(e) => {
                setCash(e.target.value);
                setDirty(true);
              }}
              placeholder="未知"
              aria-invalid={!!numError(cash, false)}
            />
          </Field>
          <Field label="现金币种" machineKey="currency" hint="仅作标签；不同币种不会合并计算。">
            <input className="input" defaultValue={demoPortfolio.currency} />
          </Field>
        </div>

        <Banner kind="warn" title="发现重复代码：">
          <span className="mono">SAMPLE.HK</span> 与 <span className="mono">0001.HK</span> 归一后可能指向同一标的（演示）。系统不会自动合并成本，请确认后手动处理。
        </Banner>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="sticky-col">代码</th>
                <th className="num">数量</th>
                <th className="num">平均每单位成本</th>
                <th>币种说明</th>
                <th>更新时间</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const qErr = numError(r.quantity, true);
                const aErr = numError(r.avg, false);
                return (
                  <tr key={i}>
                    <td className="sticky-col">
                      <input
                        className="input mono"
                        style={{ width: 130 }}
                        value={r.ticker}
                        onChange={(e) => update(i, { ticker: e.target.value })}
                        aria-label="代码"
                      />
                    </td>
                    <td className="num">
                      <input
                        className="input num"
                        style={{ width: 110, textAlign: "right" }}
                        value={r.quantity}
                        onChange={(e) => update(i, { quantity: e.target.value })}
                        aria-label="数量"
                        aria-invalid={!!qErr}
                        title={qErr ?? "负数表示空头"}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="input num"
                        style={{ width: 130, textAlign: "right" }}
                        value={r.avg}
                        placeholder="未提供"
                        onChange={(e) => update(i, { avg: e.target.value })}
                        aria-label="平均成本"
                        aria-invalid={!!aErr}
                      />
                    </td>
                    <td className="muted">{r.note}</td>
                    <td className="num faint">{demoPortfolio.asOf}</td>
                    <td>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/analysis")}>
                          <LineChart size={14} /> 分析这只股票
                        </button>
                        <button
                          className="btn btn-ghost icon-btn"
                          aria-label={`删除 ${r.ticker}`}
                          onClick={() => {
                            setRows((rs) => rs.filter((_, j) => j !== i));
                            setDirty(true);
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <button
            className="btn btn-sm"
            onClick={() => {
              setRows((rs) => [...rs, { ticker: "", quantity: "", avg: "", note: "" }]);
              setDirty(true);
            }}
          >
            <Plus size={15} /> 编辑持仓 · 新增一行
          </button>
        </div>
      </div>
    </>
  );
}
