import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { StoreModule } from "./store/store.module";
import { ProjectsModule } from "./projects/projects.module";
import { CanvasModule } from "./canvas/canvas.module";
import { AgentsModule } from "./agents/agents.module";
import { McpModule } from "./mcp/mcp.module";
import { PlannerModule } from "./planner/planner.module";

@Module({
  imports: [
    StoreModule,
    ProjectsModule,
    CanvasModule,
    AgentsModule,
    McpModule,
    PlannerModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
