import { Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "../components/Toast";
import { AnalysisPage } from "../features/analysis/AnalysisPage";
import { BacktestsPage } from "../features/backtests/BacktestsPage";
import { MemoryPage } from "../features/memory/MemoryPage";
import { PortfolioPage } from "../features/portfolio/PortfolioPage";
import { RunDetailPage } from "../features/runs/RunDetailPage";
import { RunsPage } from "../features/runs/RunsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { Shell } from "./Shell";

const status = (
  <span className="conn" title="视觉原型尚未连接本地服务">
    <span className="dot" data-tone="hollow" aria-hidden />
    <span className="conn-label">原型 · 未连接</span>
  </span>
);

const note = (
  <div className="demo-note" role="note">
    视觉原型 —— 页面中的代码、报告、持仓与统计均为演示数据，操作尚未连接后端。
  </div>
);

export function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<Shell status={status} note={note} />}>
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
    </ToastProvider>
  );
}
