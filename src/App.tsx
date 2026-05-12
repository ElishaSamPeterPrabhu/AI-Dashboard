import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/shell/AppShell";
import HomePage from "@/pages/HomePage";
import ProjectPage from "@/pages/ProjectPage";
import CanvasPage from "@/pages/CanvasPage";
import DemoPage from "@/pages/DemoPage";
import ModusDemoPage from "@/pages/ModusDemoPage";
import NotFoundPage from "@/pages/NotFoundPage";

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* Standalone demo — no AppShell wrapper */}
        <Route path="/demo/modus" element={<ModusDemoPage />} />
        <Route path="/demo" element={<DemoPage />} />

        <Route path="/" element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="projects/:projectId" element={<ProjectPage />} />
          <Route path="projects/:projectId/workflows/:workflowId" element={<CanvasPage />} />
          <Route path="404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

