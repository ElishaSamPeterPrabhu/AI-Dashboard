import {
  Body,
  Controller,
  Delete,
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
import { mcpSessionStore, readMcpSessionId } from "./mcp-session.store";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  method?: string;
  params?: unknown;
  id?: JsonRpcId;
}

/**
 * MCP Streamable HTTP endpoint at /mcp (no global "api" prefix).
 * Implements session headers required by Trimble Assist (Mcp-Session-Id).
 *
 * Register in Trimble Assist as: https://<host>/mcp
 */
@Controller()
export class McpStandaloneController {
  constructor(private readonly planner: PlannerService) {}

  @Post("mcp")
  @HttpCode(200)
  async mcpPost(
    @Body() body: JsonRpcRequest,
    @Headers("accept") acceptHeader: string,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    await this.handleMcpMessage(body, acceptHeader, req, res);
  }

  /** Some MCP clients open a long-lived GET stream after initialize. */
  @Get("mcp")
  @HttpCode(200)
  mcpGet(@Req() req: Request, @Res() res: Response): void {
    const sessionId = readMcpSessionId(req.headers);
    if (!sessionId || !mcpSessionStore.touch(sessionId)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID" },
        id: null,
      });
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Mcp-Session-Id", sessionId);
    res.flushHeaders?.();
    res.write(": keepalive\n\n");
    req.on("close", () => res.end());
  }

  @Delete("mcp")
  @HttpCode(200)
  mcpDelete(@Req() req: Request, @Res() res: Response): void {
    const sessionId = readMcpSessionId(req.headers);
    mcpSessionStore.delete(sessionId);
    res.status(200).end();
  }

  private async handleMcpMessage(
    body: JsonRpcRequest,
    acceptHeader: string,
    req: Request,
    res: Response
  ): Promise<void> {
    const useSse = (acceptHeader ?? "").includes("text/event-stream");
    const method = body?.method ?? "";
    const sessionId = readMcpSessionId(req.headers);
    const id: JsonRpcId = body?.id !== undefined ? body.id : null;

    const reply = (result: unknown) => ({ jsonrpc: "2.0" as const, id, result });
    const replyErr = (code: number, message: string) => ({
      jsonrpc: "2.0" as const,
      id,
      error: { code, message },
    });

    const sendJson = (status: number, envelope: Record<string, unknown>, headerSession?: string) => {
      res.status(status);
      if (headerSession) res.setHeader("Mcp-Session-Id", headerSession);
      res.setHeader("Content-Type", "application/json");
      res.json(envelope);
    };

    const sendSse = (envelope: Record<string, unknown>, headerSession?: string) => {
      res.status(200);
      if (headerSession) res.setHeader("Mcp-Session-Id", headerSession);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.write(`event: message\ndata: ${JSON.stringify(envelope)}\n\n`);
      res.end();
    };

    const send = (status: number, envelope: Record<string, unknown>, headerSession?: string) => {
      if (useSse && status === 200) sendSse(envelope, headerSession);
      else sendJson(status, envelope, headerSession);
    };

    const rejectSession = () => {
      send(400, {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID" },
        id: null,
      });
    };

    // Notifications are one-way (no JSON-RPC id, no response body needed).
    // Touch the session if present but don't reject — some clients send
    // notifications/initialized before they've stored the session ID.
    if (method.startsWith("notifications/")) {
      if (sessionId) mcpSessionStore.touch(sessionId);
      res.status(202);
      if (sessionId) res.setHeader("Mcp-Session-Id", sessionId);
      res.end();
      return;
    }

    let activeSession = sessionId;

    if (method === "initialize") {
      activeSession = mcpSessionStore.create();
    } else if (!sessionId || !mcpSessionStore.touch(sessionId)) {
      rejectSession();
      return;
    }

    let envelope: Record<string, unknown>;

    try {
      switch (method) {
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
          envelope = replyErr(-32601, `Method not found: ${String(method)}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      envelope = reply({
        content: [{ type: "text", text: JSON.stringify({ error: msg }) }],
        isError: true,
      });
    }

    send(200, envelope, activeSession);
  }

  /**
   * GET /canvas/:workflowId
   * Serves the canvas MCP App HTML directly in a browser for local testing.
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
<iframe src="${uiOrigin}/projects/p1/workflows/${safeId}?embed=1&amp;apiBase=${encodeURIComponent(bffOrigin)}"
  allow="clipboard-write" title="Workflow Canvas"></iframe>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  }
}
