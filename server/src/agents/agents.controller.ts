import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Query } from "@nestjs/common";
import {
  TrimbleAgentsService,
  type AgentRunRequestDto,
} from "./agents.service";

@Controller("agents")
export class AgentsController {
  constructor(private readonly agents: TrimbleAgentsService) {}

  /** List agents the current user owns (GET /api/agents?search=Risk) */
  @Get()
  list(@Query("search") search?: string) {
    return this.agents.listAgents(search);
  }

  /** Look up a single agent by ID (GET /api/agents/:agentId/info) */
  @Get(":agentId/info")
  async getAgent(@Param("agentId") agentId: string) {
    const agent = await this.agents.getAgent(agentId);
    if (!agent) throw new HttpException({ error: "Agent not found" }, HttpStatus.NOT_FOUND);
    return agent;
  }

  /** Auto-provision a new agent from a node description (POST /api/agents/provision) */
  @Post("provision")
  async provision(
    @Body() body: { name: string; systemPrompt: string; modelId?: string }
  ) {
    try {
      return await this.agents.provisionAgent(body);
    } catch (err) {
      const msg = (err as Error).message ?? "Provisioning failed";
      // Surface 403 (AgentCreator role) and 400 (account_id) clearly
      if (msg.includes("403")) {
        throw new HttpException(
          {
            error:
              "Your account doesn't have the AgentCreator role — ask a Trimble employee to create an agent, then use 'Bind existing'.",
          },
          HttpStatus.FORBIDDEN
        );
      }
      if (!process.env.TRIMBLE_AGENT_BASE_URL || !process.env.TRIMBLE_AGENT_API_KEY) {
        throw new HttpException(
          {
            error:
              "Agent provisioning requires TRIMBLE_AGENT_BASE_URL and TRIMBLE_AGENT_API_KEY in server/.env",
          },
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }
      throw new HttpException({ error: msg }, HttpStatus.BAD_GATEWAY);
    }
  }

  /** Run an agent (POST /api/agents/:agentId/runs) */
  @Post(":agentId/runs")
  run(@Param("agentId") agentId: string, @Body() body: AgentRunRequestDto) {
    return this.agents.run(agentId, body);
  }
}
