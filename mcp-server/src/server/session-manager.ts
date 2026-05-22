import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export class SessionManager {
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();

  get(sessionId: string) { return this.transports.get(sessionId); }
  set(sessionId: string, transport: StreamableHTTPServerTransport) { this.transports.set(sessionId, transport); }
  delete(sessionId: string) { return this.transports.delete(sessionId); }
  has(sessionId: string) { return this.transports.has(sessionId); }

  async closeAll() {
    for (const [id, transport] of this.transports) {
      try { await transport.close(); }
      catch (e) { console.error(`Error closing session ${id}:`, e); }
    }
    this.transports.clear();
  }
}
