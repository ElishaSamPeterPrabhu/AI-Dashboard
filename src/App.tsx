import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/shell/AppShell";
import HomePage from "@/pages/HomePage";
import ProjectPage from "@/pages/ProjectPage";
import CanvasPage from "@/pages/CanvasPage";
import NotFoundPage from "@/pages/NotFoundPage";

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
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

