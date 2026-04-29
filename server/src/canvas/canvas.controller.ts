import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { StoreService } from "../store/store.service";

@Controller("workflows")
export class CanvasController {
  constructor(private readonly store: StoreService) {}

  @Get(":workflowId/canvas")
  getCanvas(@Param("workflowId") workflowId: string) {
    return this.store.getCanvas(workflowId);
  }

  @Patch(":workflowId/canvas")
  saveCanvas(
    @Param("workflowId") workflowId: string,
    @Body() body: { nodes?: unknown[]; edges?: unknown[] }
  ) {
    this.store.saveCanvas(workflowId, {
      nodes: body.nodes ?? [],
      edges: body.edges ?? [],
    });
    return { ok: true };
  }

  /** Called by Connector nodes to seed the target workflow with upstream context. */
  @Patch(":workflowId/pending-input")
  setPendingInput(
    @Param("workflowId") workflowId: string,
    @Body() body: { context: Record<string, unknown>; sourceWorkflowId?: string; sourceNodeLabel?: string }
  ) {
    this.store.setPendingInput(workflowId, {
      context: body.context ?? {},
      sourceWorkflowId: body.sourceWorkflowId,
      sourceNodeLabel: body.sourceNodeLabel,
    });
    return { ok: true };
  }

  @Get(":workflowId/pending-input")
  getPendingInput(@Param("workflowId") workflowId: string) {
    return this.store.getPendingInput(workflowId) ?? null;
  }

  @Delete(":workflowId/pending-input")
  clearPendingInput(@Param("workflowId") workflowId: string) {
    this.store.clearPendingInput(workflowId);
    return { ok: true };
  }
}
