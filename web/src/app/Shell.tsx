import { Menu as MenuIcon, Settings } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu } from "../components/Menu";
import { Button } from "../components/ui";
import { useHealth } from "../lib/api/hooks";
import { useSlidingIndicator } from "../lib/motion";

const NAV = [
  { to: "/analysis", label: "分析" },
  { to: "/runs", label: "历史" },
  { to: "/portfolio", label: "持仓" },
  { to: "/backtests", label: "回测" },
  { to: "/memory", label: "复盘" },
];

// Pages still showing prototype data until their part of the API lands.
const DEMO_SECTIONS = new Set(["/portfolio", "/backtests", "/memory"]);

function Connection() {
  const health = useHealth();
  const tone = health.isSuccess ? (health.data.worker.busy ? "active" : "ok") : health.isError ? "danger" : "hollow";
  const label = health.isSuccess
    ? health.data.worker.busy
      ? `分析进行中${health.data.worker.queued ? ` · 排队 ${health.data.worker.queued}` : ""}`
      : "本地服务"
    : health.isError
      ? "未连接"
      : "连接中";
  const title = health.isSuccess
    ? `TradingAgents ${health.data.version} · 存储 ${health.data.storage === "ok" ? "正常" : "不可用"}`
    : health.isError
      ? "无法连接本地服务：运行 python -m tradingagents.web"
      : undefined;
  return (
    <span className="conn" title={title} role="status">
      <span className="dot" data-tone={tone} aria-hidden />
      <span className="conn-label">{label}</span>
    </span>
  );
}

export function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement>(null);
  const rect = useSlidingIndicator(navRef, ".nav-link.active", [location.pathname]);
  const section = "/" + location.pathname.split("/")[1];
  const health = useHealth();

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <Link to="/analysis" className="wordmark" aria-label="TradingAgents 首页">
            <span className="serif">Trading</span>Agents
          </Link>
          <nav className="nav" ref={navRef} aria-label="主导航">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
                {n.label}
              </NavLink>
            ))}
            {rect && (
              <span className="nav-indicator" style={{ width: rect.w - 24, transform: `translateX(${rect.x + 12}px)` }} aria-hidden />
            )}
          </nav>
          <div className="header-end">
            <Connection />
            <NavLink
              to="/settings"
              className={({ isActive }) => `btn btn-ghost btn-icon${isActive ? " is-active" : ""}`}
              aria-label="设置"
              title="设置"
              style={section === "/settings" ? { color: "var(--text)", background: "var(--fill-2)" } : undefined}
            >
              <Settings size={18} />
            </NavLink>
            <Menu
              width={200}
              trigger={({ toggle, ref, open }) => (
                <Button
                  ref={ref}
                  variant="ghost"
                  className="menu-trigger"
                  aria-label="打开导航"
                  aria-expanded={open}
                  aria-haspopup="menu"
                  onClick={toggle}
                  icon={<MenuIcon size={18} />}
                />
              )}
            >
              {(close) =>
                [...NAV, { to: "/settings", label: "设置" }].map((n) => (
                  <button
                    key={n.to}
                    className="menu-item"
                    role="menuitem"
                    aria-current={section === n.to ? "page" : undefined}
                    onClick={() => {
                      close();
                      navigate(n.to);
                    }}
                  >
                    {n.label}
                  </button>
                ))
              }
            </Menu>
          </div>
        </div>
      </header>
      {health.isError && (
        <div className="demo-note" role="alert">
          无法连接本地服务。表单内容会保留；服务恢复后自动重连。启动方式：
          <span className="mono"> python -m tradingagents.web</span>
        </div>
      )}
      {DEMO_SECTIONS.has(section) && (
        <div className="demo-note" role="note">
          此页仍是视觉原型：数据为演示，操作尚未连接后端。
        </div>
      )}
      <main className="main" key={section}>
        <Outlet />
      </main>
    </div>
  );
}

export function PageHead({
  title,
  sub,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
