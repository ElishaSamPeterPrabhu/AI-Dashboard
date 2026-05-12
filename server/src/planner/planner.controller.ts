import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { PlannerService } from "./planner.service";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  method?: string;
  params?: unknown;
  id?: JsonRpcId;
}

@Controller("planner")
export class PlannerController {
  constructor(private readonly planner: PlannerService) {}

  /**
   * JSON-RPC 2.0 entry for MCP-style clients (`initialize`, `tools/list`, `tools/call`).
   * POST /api/planner/mcp
   */
  @Post("mcp")
  @HttpCode(200)
  async mcp(@Body() body: JsonRpcRequest): Promise<Record<string, unknown> | null> {
    if (body?.method?.startsWith("notifications/")) {
      return null;
    }

    const id: JsonRpcId = body?.id !== undefined ? body.id : null;

    const reply = (result: unknown) => ({
      jsonrpc: "2.0" as const,
      id,
      result,
    });

    const replyErr = (code: number, message: string) => ({
      jsonrpc: "2.0" as const,
      id,
      error: { code, message },
    });

    try {
      switch (body.method) {
        case "initialize":
          return reply({
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "ai-dashboard-planner", version: "0.1.0" },
          });

        case "tools/list":
          return reply({ tools: this.planner.listTools() });

        case "tools/call": {
          const params = (body.params ?? {}) as {
            name?: string;
            arguments?: Record<string, unknown>;
          };
          if (!params.name) {
            return replyErr(-32602, "tools/call requires params.name");
          }
          const out = await this.planner.callTool(params.name, params.arguments ?? {});
          return reply({
            content: [{ type: "text", text: JSON.stringify(out) }],
            isError: false,
          });
        }

        default:
          return replyErr(-32601, `Method not found: ${String(body.method)}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply({
        content: [{ type: "text", text: JSON.stringify({ error: msg }) }],
        isError: true,
      });
    }
  }
}
