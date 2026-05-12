import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { McpModule } from "../mcp/mcp.module";
import { DemoRunController } from "./demo-run.controller";
import { DemoRunService } from "./demo-run.service";
import { PlannerController } from "./planner.controller";
import { PlannerService } from "./planner.service";

@Module({
  imports: [AgentsModule, McpModule],
  controllers: [PlannerController, DemoRunController],
  providers: [PlannerService, DemoRunService],
})
export class PlannerModule {}
