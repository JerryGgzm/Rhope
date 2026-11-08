import {
  BookOpenCheck,
  Briefcase,
  FlaskConical,
  History,
  LineChart,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const MobileNavContext = createContext<() => void>(() => {});

const NAV = [
  { to: "/analysis", label: "分析工作台", icon: LineChart },
  { to: "/runs", label: "运行历史", icon: History },
  { to: "/portfolio", label: "持仓", icon: Briefcase },
  { to: "/backtests", label: "回测", icon: FlaskConical },
  { to: "/memory", label: "决策复盘", icon: BookOpenCheck },
];

export function Shell({ ribbon, footer }: { ribbon?: ReactNode; footer?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("ta.rail.collapsed") === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const openMobileNav = useCallback(() => setMobileOpen(true), []);

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => localStorage.setItem("ta.rail.collapsed", collapsed ? "1" : "0"), [collapsed]);

  const navItem = (item: (typeof NAV)[number] | { to: string; label: string; icon: typeof Settings }) => (
    <NavLink
      key={item.to}
      to={item.to}
      className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
      title={collapsed ? item.label : undefined}
    >
      <item.icon size={18} aria-hidden />
      <span className="nav-label">{item.label}</span>
    </NavLink>
  );

  return (
    <div className="shell" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
      {mobileOpen && <div className="rail-scrim" onClick={() => setMobileOpen(false)} aria-hidden />}
      <aside className="rail" aria-label="主导航">
        <nav className="rail-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              TA
            </span>
            <span className="brand-text">
              <strong>TradingAgents</strong>
              <span>本地研究工作台</span>
            </span>
          </div>
          {NAV.map(navItem)}
          <div className="nav-spacer" />
          {navItem({ to: "/settings", label: "设置", icon: Settings })}
          <div className="rail-foot">
            {footer}
            <button
              className="btn btn-ghost btn-sm collapse-toggle"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
              style={{ justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? 0 : undefined }}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              <span className="rail-foot-text">收起侧栏</span>
            </button>
          </div>
        </nav>
      </aside>
      <div className="main">
        {ribbon}
        <MobileNavContext.Provider value={openMobileNav}>
          <Outlet />
        </MobileNavContext.Provider>
      </div>
    </div>
  );
}

export function Topbar({ title, crumb, actions }: { title: string; crumb?: ReactNode; actions?: ReactNode }) {
  const openNav = useContext(MobileNavContext);
  return (
    <header className="topbar">
      <button className="btn btn-ghost icon-btn mobile-menu" onClick={openNav} aria-label="打开导航">
        <Menu size={18} />
      </button>
      <div className="topbar-title">
        <h1>{title}</h1>
        {crumb && <span className="crumb">{crumb}</span>}
      </div>
      {actions && <div className="topbar-actions">{actions}</div>}
    </header>
  );
}
