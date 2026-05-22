// Ported from server/src/store/store.service.ts — NestJS decorators removed.

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

export interface CanvasStateDto {
  nodes: unknown[];
  edges: unknown[];
}

const SEED_PROJECTS: ProjectDto[] = [
  {
    id: 'p1',
    name: 'Product Planning',
    description: 'Software product roadmap simulations',
    color: '#0063a3',
    createdAt: '2026-01-10T00:00:00Z',
    workflows: [
      { id: 'wf1', name: 'Feature Cost Estimation', updatedAt: '2026-04-18T10:00:00Z' },
      { id: 'wf2', name: 'Capacity Planning', updatedAt: '2026-04-17T14:30:00Z' },
    ],
  },
];

export class StoreService {
  private projects: ProjectDto[] = structuredClone(SEED_PROJECTS);
  private canvases = new Map<string, CanvasStateDto>();

  getProject(id: string) { return this.projects.find(p => p.id === id); }

  addWorkflow(projectId: string, body: { name: string; description?: string }): WorkflowDto | null {
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

  findWorkflowById(workflowId: string): { projectId: string; workflow: WorkflowDto } | null {
    for (const p of this.projects) {
      const wf = p.workflows.find(w => w.id === workflowId);
      if (wf) return { projectId: p.id, workflow: wf };
    }
    return null;
  }

  touchWorkflow(projectId: string, workflowId: string): void {
    const wf = this.getProject(projectId)?.workflows.find(w => w.id === workflowId);
    if (wf) wf.updatedAt = new Date().toISOString();
  }

  getLatestWorkflow(): { workflowId: string; projectId: string } | null {
    let latest: WorkflowDto | null = null;
    let latestProjectId = '';
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
}

export const store = new StoreService();
