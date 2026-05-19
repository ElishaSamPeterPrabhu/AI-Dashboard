import { Injectable } from "@nestjs/common";

export interface WorkflowDto {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
}

export interface ProjectDto {
  id: string;
  name: string;
  description?: string;
  color?: string;
  workflows: WorkflowDto[];
  createdAt: string;
}

const SEED_PROJECTS: ProjectDto[] = [
  {
    id: "p1",
    name: "Product Planning",
    description: "Software product roadmap simulations",
    color: "#0063a3",
    createdAt: "2026-01-10T00:00:00Z",
    workflows: [
      {
        id: "wf1",
        name: "Feature Cost Estimation",
        description: "Estimate effort + cost for Q3 roadmap items",
        updatedAt: "2026-04-18T10:00:00Z",
      },
      {
        id: "wf2",
        name: "Capacity Planning",
        description: "Sprint-by-sprint headcount model",
        updatedAt: "2026-04-17T14:30:00Z",
      },
    ],
  },
  {
    id: "p2",
    name: "Construction Ops",
    description: "Construction project risk and budgets",
    color: "#007d69",
    createdAt: "2026-02-01T00:00:00Z",
    workflows: [
      {
        id: "wf3",
        name: "Budget Burn Simulation",
        description: "Monthly burn vs contingency reserve",
        updatedAt: "2026-04-15T09:00:00Z",
      },
    ],
  },
];

export interface CanvasStateDto {
  nodes: unknown[];
  edges: unknown[];
}

export interface PendingInputDto {
  context: Record<string, unknown>;
  sourceWorkflowId?: string;
  sourceNodeLabel?: string;
  receivedAt: string;
}

@Injectable()
export class StoreService {
  private projects: ProjectDto[] = structuredClone(SEED_PROJECTS);
  private canvases = new Map<string, CanvasStateDto>();
  private pendingInputs = new Map<string, PendingInputDto>();

  getProjects(): ProjectDto[] {
    return this.projects;
  }

  getProject(id: string): ProjectDto | undefined {
    return this.projects.find((p) => p.id === id);
  }

  addProject(body: { name: string; description?: string }): ProjectDto {
    const p: ProjectDto = {
      id: `p-${Math.random().toString(36).slice(2, 10)}`,
      name: body.name,
      description: body.description,
      color: "#0063a3",
      workflows: [],
      createdAt: new Date().toISOString(),
    };
    this.projects.push(p);
    return p;
  }

  deleteProject(id: string): boolean {
    const i = this.projects.findIndex((p) => p.id === id);
    if (i < 0) return false;
    this.projects.splice(i, 1);
    return true;
  }

  addWorkflow(
    projectId: string,
    body: { name: string; description?: string }
  ): WorkflowDto | null {
    const p = this.getProject(projectId);
    if (!p) return null;
    const wf: WorkflowDto = {
      id: `wf-${Math.random().toString(36).slice(2, 10)}`,
      name: body.name,
      description: body.description,
      updatedAt: new Date().toISOString(),
    };
    p.workflows.push(wf);
    return wf;
  }

  /** Resolve a workflow by id across all projects (demo store is flat per workflow canvas). */
  findWorkflowById(workflowId: string): { projectId: string; workflow: WorkflowDto } | null {
    for (const p of this.projects) {
      const wf = p.workflows.find((w) => w.id === workflowId);
      if (wf) return { projectId: p.id, workflow: wf };
    }
    return null;
  }

  touchWorkflow(projectId: string, workflowId: string): void {
    const p = this.getProject(projectId);
    const wf = p?.workflows.find((w) => w.id === workflowId);
    if (wf) wf.updatedAt = new Date().toISOString();
  }

  /** Return the most recently touched workflow across all projects (for MCP App fallback). */
  getLatestWorkflow(): { workflowId: string; projectId: string } | null {
    let latest: WorkflowDto | null = null;
    let latestProjectId = "";
    for (const p of this.projects) {
      for (const wf of p.workflows) {
        if (!latest || wf.updatedAt > latest.updatedAt) {
          latest = wf;
          latestProjectId = p.id;
        }
      }
    }
    return latest ? { workflowId: latest.id, projectId: latestProjectId } : null;
  }

  getCanvas(workflowId: string): CanvasStateDto {
    return this.canvases.get(workflowId) ?? { nodes: [], edges: [] };
  }

  saveCanvas(workflowId: string, body: CanvasStateDto): void {
    this.canvases.set(workflowId, { nodes: body.nodes ?? [], edges: body.edges ?? [] });
  }

  setPendingInput(workflowId: string, input: Omit<PendingInputDto, "receivedAt">): void {
    this.pendingInputs.set(workflowId, {
      ...input,
      receivedAt: new Date().toISOString(),
    });
  }

  getPendingInput(workflowId: string): PendingInputDto | undefined {
    return this.pendingInputs.get(workflowId);
  }

  clearPendingInput(workflowId: string): void {
    this.pendingInputs.delete(workflowId);
  }
}
