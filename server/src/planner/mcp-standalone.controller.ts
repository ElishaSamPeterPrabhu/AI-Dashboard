import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { PlannerService } from "./planner.service";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  method?: string;
  params?: unknown;
  id?: JsonRpcId;
}

/**
 * MCP Streamable HTTP endpoint at /mcp (no global "api" prefix).
 * Supports both plain JSON and SSE (text/event-stream) responses per the
 * MCP Streamable HTTP transport spec.
 *
 * Register in Trimble Assist as: https://<host>/mcp
 */
@Controller()
export class McpStandaloneController {
  constructor(private readonly planner: PlannerService) {}

  @Post("mcp")
  @HttpCode(200)
  async mcp(
    @Body() body: JsonRpcRequest,
    @Headers("accept") acceptHeader: string,
    @Req() _req: Request,
    @Res() res: Response
  ): Promise<void> {
    const useSse = (acceptHeader ?? "").includes("text/event-stream");

    if (body?.method?.startsWith("notifications/")) {
      res.status(200).end();
      return;
    }

    const id: JsonRpcId = body?.id !== undefined ? body.id : null;
    const reply = (result: unknown) => ({ jsonrpc: "2.0" as const, id, result });
    const replyErr = (code: number, message: string) => ({
      jsonrpc: "2.0" as const,
      id,
      error: { code, message },
    });

    let envelope: Record<string, unknown>;

    try {
      switch (body?.method) {
        case "initialize":
          envelope = reply({
            protocolVersion: "2024-11-05",
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: "ai-dashboard", version: "0.1.0" },
          });
          break;

        case "tools/list":
          envelope = reply({ tools: this.planner.listTools() });
          break;

        case "tools/call": {
          const params = (body.params ?? {}) as {
            name?: string;
            arguments?: Record<string, unknown>;
          };
          if (!params.name) {
            envelope = replyErr(-32602, "tools/call requires params.name");
            break;
          }
          const out = await this.planner.callTool(params.name, params.arguments ?? {});
          envelope = reply({
            content: [{ type: "text", text: JSON.stringify(out) }],
            isError: false,
          });
          break;
        }

        case "resources/list":
          envelope = reply({
            resources: [
              {
                uri: "ui://workflow-canvas",
                name: "Workflow Canvas",
                description:
                  "Interactive SVG canvas showing workflow nodes, types, and execution results.",
                mimeType: "text/html",
              },
            ],
          });
          break;

        case "resources/read": {
          const params = (body.params ?? {}) as { uri?: string };
          if (params.uri !== "ui://workflow-canvas") {
            envelope = replyErr(-32602, `Unknown resource URI: ${params.uri ?? "(none)"}`);
            break;
          }
          const bffOrigin =
            (process.env.BFF_PUBLIC_URL ?? "").replace(/\/$/, "") || "http://localhost:3000";
          envelope = reply({
            contents: [
              {
                uri: "ui://workflow-canvas",
                mimeType: "text/html",
                text: this.planner.getCanvasAppHtml(bffOrigin),
              },
            ],
          });
          break;
        }

        default:
          envelope = replyErr(-32601, `Method not found: ${String(body?.method)}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      envelope = reply({
        content: [{ type: "text", text: JSON.stringify({ error: msg }) }],
        isError: true,
      });
    }

    if (useSse) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.write(`data: ${JSON.stringify(envelope)}\n\n`);
      res.end();
    } else {
      res.setHeader("Content-Type", "application/json");
      res.json(envelope);
    }
  }

  /**
   * GET /canvas/:workflowId
   * Serves the canvas MCP App HTML directly in a browser for local testing.
   * Open http://localhost:3000/canvas/<workflowId> to preview the workflow viewer.
   */
  @Get("canvas/:workflowId")
  serveCanvas(@Param("workflowId") workflowId: string, @Res() res: Response): void {
    const bffOrigin = (process.env.BFF_PUBLIC_URL ?? "").replace(/\/$/, "") || "http://localhost:3000";
    const uiOrigin = (process.env.UI_PUBLIC_URL ?? "").replace(/\/$/, "") || "http://localhost:5173";
    const safeId = workflowId.replace(/[^a-zA-Z0-9_-]/g, "");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Canvas — ${safeId}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f172a;overflow:hidden}
  iframe{width:100vw;height:100vh;border:none}
</style>
</head>
<body>
<iframe src="${uiOrigin}/projects/p1/workflows/${safeId}?embed=1"
  allow="clipboard-write" title="Workflow Canvas"></iframe>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
    void bffOrigin; // suppress unused warning
  }
}
