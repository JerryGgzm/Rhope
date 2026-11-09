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

export function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<Shell />}>
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
