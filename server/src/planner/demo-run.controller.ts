import { Body, Controller, Post } from "@nestjs/common";
import { DemoRunService, DemoRunSessionInput } from "./demo-run.service";

@Controller("demo")
export class DemoRunController {
  constructor(private readonly demoRun: DemoRunService) {}

  /** POST /api/demo/run — planner agent + local MCP tool execution + multi-turn thread (see DemoRunService). */
  @Post("run")
  run(
    @Body()
    body: {
      prompt?: string;
      threadId?: string | null;
      runId?: string | null;
      workflowId?: string | null;
    }
  ) {
    const input: DemoRunSessionInput = {
      prompt: body?.prompt ?? "",
      threadId: body?.threadId ?? null,
      runId: body?.runId ?? null,
      workflowId: body?.workflowId ?? null,
    };
    return this.demoRun.run(input);
  }
}
