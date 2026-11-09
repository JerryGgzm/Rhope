import { Menu as MenuIcon, Settings } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu } from "../components/Menu";
import { Button } from "../components/ui";
import { useHealth } from "../lib/api/hooks";
import { setLang, t, useLang } from "../lib/i18n";
import { useSlidingIndicator } from "../lib/motion";

const nav = () => [
  { to: "/analysis", label: t("分析", "Analyze") },
  { to: "/runs", label: t("历史", "History") },
  { to: "/portfolio", label: t("持仓", "Portfolio") },
  { to: "/backtests", label: t("回测", "Backtests") },
  { to: "/memory", label: t("复盘", "Review") },
];

// Pages still showing prototype data until their part of the API lands.
const DEMO_SECTIONS = new Set(["/portfolio", "/backtests", "/memory"]);

function Connection() {
  useLang();
  const health = useHealth();
  const tone = health.isSuccess ? (health.data.worker.busy ? "active" : "ok") : health.isError ? "danger" : "hollow";
  const label = health.isSuccess
    ? health.data.worker.busy
      ? t("分析进行中", "Analysis running") + (health.data.worker.queued ? t(` · 排队 ${health.data.worker.queued}`, ` · ${health.data.worker.queued} queued`) : "")
      : t("本地服务", "Local service")
    : health.isError
      ? t("未连接", "Disconnected")
      : t("连接中", "Connecting");
  const title = health.isSuccess
    ? `Rhope ${health.data.version} · ${t("存储", "storage")} ${health.data.storage === "ok" ? t("正常", "OK") : t("不可用", "unavailable")}`
    : health.isError
      ? t("无法连接本地服务：运行 python -m tradingagents.web", "Cannot reach the local service: run python -m tradingagents.web")
      : undefined;
  return (
    <span className="conn" title={title} role="status">
      <span className="dot" data-tone={tone} aria-hidden />
      <span className="conn-label">{label}</span>
    </span>
  );
}

function LangSwitch() {
  const lang = useLang();
  const next = lang === "zh" ? "en" : "zh";
  return (
    <button
      type="button"
      className="lang-switch"
      onClick={() => setLang(next)}
      aria-label={lang === "zh" ? "Switch to English" : "切换到中文"}
      title={lang === "zh" ? "Switch to English" : "切换到中文"}
    >
      <span data-on={lang === "zh"}>中</span>
      <span className="lang-sep" aria-hidden>/</span>
      <span data-on={lang === "en"}>EN</span>
    </button>
  );
}

export function Shell() {
  const lang = useLang();
  const NAV = nav();
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement>(null);
  const rect = useSlidingIndicator(navRef, ".nav-link.active", [location.pathname, lang]);
  const section = "/" + location.pathname.split("/")[1];
  const health = useHealth();

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <Link to="/analysis" className="wordmark" aria-label={t("Rhope 首页", "Rhope home")}>
            Rhope
          </Link>
          <nav className="nav" ref={navRef} aria-label={t("主导航", "Main navigation")}>
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
            <LangSwitch />
            <NavLink
              to="/settings"
              className={({ isActive }) => `btn btn-ghost btn-icon${isActive ? " is-active" : ""}`}
              aria-label={t("设置", "Settings")}
              title={t("设置", "Settings")}
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
                  aria-label={t("打开导航", "Open navigation")}
                  aria-expanded={open}
                  aria-haspopup="menu"
                  onClick={toggle}
                  icon={<MenuIcon size={18} />}
                />
              )}
            >
              {(close) =>
                [...NAV, { to: "/settings", label: t("设置", "Settings") }].map((n) => (
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
          {t(
            "无法连接本地服务。表单内容会保留；服务恢复后自动重连。启动方式：",
            "Cannot reach the local service. Your form is kept and reconnects when it is back. Start it with:",
          )}
          <span className="mono"> python -m tradingagents.web</span>
        </div>
      )}
      {DEMO_SECTIONS.has(section) && (
        <div className="demo-note" role="note">
          {t(
            "此页仍是视觉原型：数据为演示，操作尚未连接后端。",
            "This page is still a prototype: the data is a demo and actions are not connected yet.",
          )}
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
