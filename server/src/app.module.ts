import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { StoreModule } from "./store/store.module";
import { ProjectsModule } from "./projects/projects.module";
import { CanvasModule } from "./canvas/canvas.module";
import { AgentsModule } from "./agents/agents.module";
import { McpModule } from "./mcp/mcp.module";

@Module({
  imports: [StoreModule, ProjectsModule, CanvasModule, AgentsModule, McpModule],
  controllers: [AppController],
})
export class AppModule {}
