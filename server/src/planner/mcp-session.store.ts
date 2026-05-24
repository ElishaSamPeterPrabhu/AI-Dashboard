import { randomUUID } from "node:crypto";

const SESSION_TTL_MS = 60 * 60 * 1000;

interface McpSession {
  id: string;
  createdAt: number;
  lastSeenAt: number;
}

/** In-memory MCP Streamable HTTP sessions (one replica — see agentic-mcp-config maxReplicas). */
export class McpSessionStore {
  private readonly sessions = new Map<string, McpSession>();

  create(): string {
    this.prune();
    const id = randomUUID();
    const now = Date.now();
    this.sessions.set(id, { id, createdAt: now, lastSeenAt: now });
    return id;
  }

  touch(sessionId: string | undefined): boolean {
    if (!sessionId?.trim()) return false;
    this.prune();
    const session = this.sessions.get(sessionId.trim());
    if (!session) return false;
    session.lastSeenAt = Date.now();
    return true;
  }

  delete(sessionId: string | undefined): void {
    if (!sessionId?.trim()) return;
    this.sessions.delete(sessionId.trim());
  }

  private prune(): void {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [id, session] of this.sessions) {
      if (session.lastSeenAt < cutoff) this.sessions.delete(id);
    }
  }
}

export const mcpSessionStore = new McpSessionStore();

export function readMcpSessionId(headers: Record<string, string | string[] | undefined>): string | undefined {
  // Express normalises all incoming headers to lowercase.
  const raw = headers["mcp-session-id"];
  if (Array.isArray(raw)) return raw[0]?.trim() || undefined;
  return raw?.trim() || undefined;
}
