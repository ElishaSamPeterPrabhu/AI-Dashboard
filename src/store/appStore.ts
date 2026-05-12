import { create } from "zustand";
import type { Project, Workflow } from "@/types";
import { apiGet } from "@/api/http";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const SEED_WORKFLOWS_A: Workflow[] = [
  { id: "wf1", name: "Feature Cost Estimation", description: "Estimate effort + cost for Q3 roadmap items", updatedAt: "2026-04-18T10:00:00Z" },
  { id: "wf2", name: "Capacity Planning", description: "Sprint-by-sprint headcount model", updatedAt: "2026-04-17T14:30:00Z" },
];
const SEED_WORKFLOWS_B: Workflow[] = [
  { id: "wf3", name: "Budget Burn Simulation", description: "Monthly burn vs contingency reserve", updatedAt: "2026-04-15T09:00:00Z" },
];

const SEED_PROJECTS: Project[] = [
  { id: "p1", name: "Product Planning", description: "Software product roadmap simulations", color: "#0063a3", workflows: SEED_WORKFLOWS_A, createdAt: "2026-01-10T00:00:00Z" },
  { id: "p2", name: "Construction Ops", description: "Construction project risk and budgets", color: "#007d69", workflows: SEED_WORKFLOWS_B, createdAt: "2026-02-01T00:00:00Z" },
];

interface AppStore {
  projects: Project[];
  /** From GET /api/health — server has TRIMBLE_AGENT_* so BFF can call Trimble agents. */
  bffAgentConfigured: boolean | null;
  /** Merge server projects when API is up; no-op on failure. Also refreshes `bffAgentConfigured`. */
  fetchProjectsFromApi: () => Promise<void>;
  addProject: (name: string, description?: string) => Project;
  addWorkflow: (projectId: string, name: string, description?: string) => Workflow | null;
  deleteWorkflow: (projectId: string, workflowId: string) => void;
  deleteProject: (projectId: string) => void;
  renameProject: (projectId: string, name: string) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  projects: SEED_PROJECTS,
  bffAgentConfigured: null,

  fetchProjectsFromApi: async () => {
    try {
      const data = await apiGet<Project[]>("/api/projects");
      if (Array.isArray(data) && data.length > 0) set({ projects: data });
    } catch {
      /* offline or server down — keep seed */
    }
    try {
      const h = await apiGet<{ agentKeySet?: boolean }>("/api/health");
      set({ bffAgentConfigured: Boolean(h.agentKeySet) });
    } catch {
      set({ bffAgentConfigured: false });
    }
  },

  addProject: (name, description) => {
    const project: Project = {
      id: uid(),
      name,
      description,
      color: "#0063a3",
      workflows: [],
      createdAt: new Date().toISOString(),
    };
    set((s) => ({ projects: [...s.projects, project] }));
    return project;
  },

  addWorkflow: (projectId, name, description) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return null;
    const wf: Workflow = { id: uid(), name, description, updatedAt: new Date().toISOString() };
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, workflows: [...p.workflows, wf] } : p
      ),
    }));
    return wf;
  },

  deleteWorkflow: (projectId, workflowId) => {
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, workflows: p.workflows.filter((w) => w.id !== workflowId) } : p
      ),
    }));
  },

  deleteProject: (projectId) => {
    set((s) => ({ projects: s.projects.filter((p) => p.id !== projectId) }));
  },

  renameProject: (projectId, name) => {
    set((s) => ({
      projects: s.projects.map((p) => (p.id === projectId ? { ...p, name } : p)),
    }));
  },
}));
