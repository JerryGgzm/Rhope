import { Eye } from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AnalysisPage } from "../features/analysis/AnalysisPage";
import { BacktestsPage } from "../features/backtests/BacktestsPage";
import { MemoryPage } from "../features/memory/MemoryPage";
import { PortfolioPage } from "../features/portfolio/PortfolioPage";
import { RunDetailPage } from "../features/runs/RunDetailPage";
import { RunsPage } from "../features/runs/RunsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { Shell } from "./Shell";

const ribbon = (
  <div className="demo-ribbon" role="note">
    <Eye size={14} aria-hidden />
    视觉原型：页面中的代码、报告、持仓和统计全部是演示数据，按钮尚未连接后端。
  </div>
);

const footer = (
  <div className="row rail-foot-text" style={{ gap: 6 }}>
    <span className="status-dot" style={{ color: "var(--text-3)" }} aria-hidden />
    <span>原型 · 未连接服务</span>
  </div>
);

export function App() {
  return (
    <Routes>
      <Route element={<Shell ribbon={ribbon} footer={footer} />}>
        <Route index element={<Navigate to="/analysis" replace />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/runs" element={<RunsPage />} />
        <Route path="/runs/:id" element={<RunDetailPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/backtests" element={<BacktestsPage />} />
        <Route path="/memory" element={<MemoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/analysis" replace />} />
      </Route>
    </Routes>
  );
}
