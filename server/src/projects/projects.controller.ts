import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { StoreService } from "../store/store.service";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly store: StoreService) {}

  @Get()
  list() {
    return this.store.getProjects();
  }

  @Get(":id")
  getOne(@Param("id") id: string) {
    return this.store.getProject(id) ?? { error: "not_found" };
  }

  @Post()
  create(@Body() body: { name: string; description?: string }) {
    return this.store.addProject(body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return { ok: this.store.deleteProject(id) };
  }

  @Post(":projectId/workflows")
  addWorkflow(
    @Param("projectId") projectId: string,
    @Body() body: { name: string; description?: string }
  ) {
    const wf = this.store.addWorkflow(projectId, body);
    if (!wf) return { error: "project_not_found" };
    return wf;
  }
}
