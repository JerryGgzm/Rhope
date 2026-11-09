import { Menu as MenuIcon, Settings } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu } from "../components/Menu";
import { Button } from "../components/ui";
import { useSlidingIndicator } from "../lib/motion";

const NAV = [
  { to: "/analysis", label: "分析" },
  { to: "/runs", label: "历史" },
  { to: "/portfolio", label: "持仓" },
  { to: "/backtests", label: "回测" },
  { to: "/memory", label: "复盘" },
];

export function Shell({ status, note }: { status: ReactNode; note?: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement>(null);
  const rect = useSlidingIndicator(navRef, ".nav-link.active", [location.pathname]);
  const section = "/" + location.pathname.split("/")[1];

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
            {status}
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
      {note}
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
