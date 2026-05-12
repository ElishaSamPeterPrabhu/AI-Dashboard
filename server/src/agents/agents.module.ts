import { Module } from "@nestjs/common";
import { AgentsController } from "./agents.controller";
import { TrimbleAgentsService } from "./agents.service";
import { McpModule } from "../mcp/mcp.module";

@Module({
  imports: [McpModule],
  controllers: [AgentsController],
  providers: [TrimbleAgentsService],
  exports: [TrimbleAgentsService],
})
export class AgentsModule {}
