export type WorkflowMode = "plan" | "execute";

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string;
  workflows: Workflow[];
  createdAt: string;
}
