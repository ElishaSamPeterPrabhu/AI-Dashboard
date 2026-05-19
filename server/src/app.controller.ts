import { Body, Controller, Get, Logger, Patch } from "@nestjs/common";
import { StoreService } from "./store/store.service";

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly store: StoreService) {}

  @Get("health")
  health() {
    return {
      ok: true,
      service: "ai-dashboard-server",
      agentKeySet: Boolean(process.env.TRIMBLE_AGENT_API_KEY),
      agentKeyExpiry: (() => {
        const key = process.env.TRIMBLE_AGENT_API_KEY;
        if (!key) return null;
        try {
          const p = JSON.parse(Buffer.from(key.split(".")[1], "base64").toString()) as {
            exp?: number;
          };
          return p.exp ? new Date(p.exp * 1000).toISOString() : null;
        } catch {
          return null;
        }
      })(),
    };
  }

  /**
   * Returns the most recently touched workflow — used by the MCP App HTML as a
   * fallback when Assist does not yet send the ui/initialize postMessage.
   * GET /api/latest-workflow
   */
  @Get("latest-workflow")
  latestWorkflow() {
    return this.store.getLatestWorkflow() ?? { workflowId: null, projectId: null };
  }

  /**
   * Expose Trimble API token for optional UI tooling (e.g. local dev).
   * GET /api/auth/token-for-ui
   */
  @Get("auth/token-for-ui")
  getTokenForUi() {
    return { token: process.env.TRIMBLE_AGENT_API_KEY ?? "" };
  }

  /**
   * Hot-reload the Trimble API token without restarting the server.
   * POST /api/auth/token  { "token": "<bearer token>" }
   * Call this from the browser console after a fresh login:
   *   fetch('/api/auth/token', { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ token: '<paste token>' }) })
   */
  @Patch("auth/token")
  setToken(@Body() body: { token: string }) {
    if (!body?.token?.trim()) {
      return { ok: false, error: "token field is required" };
    }
    process.env.TRIMBLE_AGENT_API_KEY = body.token.trim();
    this.logger.log("Trimble API token updated via /api/auth/token");
    try {
      const p = JSON.parse(
        Buffer.from(body.token.split(".")[1], "base64").toString()
      ) as { exp?: number; scope?: string };
      const expiry = p.exp ? new Date(p.exp * 1000).toISOString() : "unknown";
      return { ok: true, scope: p.scope, expiry };
    } catch {
      return { ok: true };
    }
  }
}
