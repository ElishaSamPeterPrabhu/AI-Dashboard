# Auth and Security

## Authentication Flow

AI Dashboard uses TID OAuth 2.0 with the Authorization Code + PKCE flow. This is identical to `ModusAssistant.tsx` in `modus-blueprint` — the same logic is reused.

### Flow

```
1. User visits AI Dashboard → no token in sessionStorage
2. App calls openAgenticLogin()
   → generates code_verifier + code_challenge (PKCE)
   → stores code_verifier in sessionStorage
   → redirects to https://id.trimble.com/oauth/authorize
       ?response_type=code
       &client_id=<AGENTIC_CLIENT_ID>
       &redirect_uri=<origin>/tid-callback.html
       &scope=openid agents
       &code_challenge=<SHA-256 hash of verifier, base64url>
       &state=<random nonce>

3. User authenticates with Trimble ID
4. TID redirects to /tid-callback.html?code=<auth_code>&state=<nonce>
5. tid-callback.html posts the code to the parent window
6. Parent window exchanges code for token:
   POST https://id.trimble.com/oauth/token
   { grant_type: authorization_code, code, redirect_uri, code_verifier, client_id }
7. Response: { access_token, expires_in }
8. Stored in sessionStorage under TOKEN_KEY + TOKEN_EXPIRY_KEY
9. AgentServiceClient reads token via getToken() on every request
10. Token is refreshed (steps 2–8 again) when expires_at - 60s < now
```

### Key constants (must be set per environment)

```typescript
const AGENTIC_CLIENT_ID = "61abccab-10ea-47bf-a616-b1b9c48bfa7b";  // same as modus-blueprint
const AGENTIC_SCOPES    = "openid agents";
const TID_AUTH_URL      = "https://id.trimble.com";
```

The backend never handles TID tokens directly. All Agent Service calls are made from the browser with the user's token. The backend only handles workflow persistence and simulation orchestration.

---

## Token Storage

| Key | Storage | Contents |
|---|---|---|
| `modus_assistant_access_token` | sessionStorage | Bearer token string |
| `modus_assistant_token_expires_at` | sessionStorage | Unix timestamp (ms) |
| `modus_assistant_pkce_verifier` | sessionStorage | PKCE code verifier (cleared after exchange) |
| `modus_assistant_oauth_state` | sessionStorage | CSRF nonce (cleared after callback) |

All keys are cleared on logout. sessionStorage is tab-scoped — each tab re-auths independently.

---

## Account ID Requirement

The Agent Service requires the TID JWT to carry an `account_id` claim. This is set by the user selecting a default account in their Trimble My Profile.

Detection on app init:
```typescript
const payload = decodeJwt(token);
if (!payload.account_id) {
  showAccountSetupBanner(); // Modus Alert with link to My Profile
}
```

The dashboard cannot proceed with any Agent Service write operations until this is resolved. The chatbot and Execute Mode are disabled until the banner is dismissed with a valid token.

---

## RBAC Model

The Agent Service enforces RBAC. The dashboard respects it:

| Role | Who has it | What they can do in AI Dashboard |
|---|---|---|
| `AgentCreator` | Trimble employees + AAIP license holders | Auto-provision new agents for AI nodes |
| `Admin` | Agent owner | Edit agent config, delete agent, share agent |
| `Analyst` | Invited collaborators with edit rights | Edit non-ACL agent config, run validations |
| `User` | Anyone with access to the agent | Run the agent (Execute Mode) |

### AgentCreator gating

The dashboard detects whether the current user has `AgentCreator` by attempting a `POST /v1/agents` and checking for a 403 response. On 403:
- The "Auto-provision" option in the AI node binding panel is hidden
- A tooltip explains: "Creating new agents requires an Agentic Platform license. Contact your Trimble administrator."
- Only "Bind existing agent" is available

### Shared workflow import

When a workflow is shared with a user who doesn't have access to all its bound agents:
- On open, a "Rebind agents" modal lists all AI nodes the user cannot access
- Each entry shows the original agent name and a "Bind a different agent" picker
- Workflow cannot be run until all AI nodes are bound to accessible agents

---

## Backend Security

The dashboard backend is a thin orchestration layer. It:
- Never stores TID tokens (all Agent Service calls flow through the browser)
- Validates that every workflow mutation request carries a valid session cookie (HTTP-only, same-site strict)
- The Workflow API MCP endpoint validates the `{actorToken}` substitution against TID before executing tool calls
- Calculator node formulas run in QuickJS — a Wasm sandbox with no filesystem, network, or process access

### QuickJS sandbox constraints

```typescript
const sandbox = new QuickJSWasm();
// Disallowed:
// - require / import
// - fetch / XMLHttpRequest
// - fs, os, process
// - eval of arbitrary code (the formula itself is the eval target)
// Timeout: 5 seconds per formula execution (prevents infinite loops)
// Memory limit: 16 MB
```

---

## MCP Authentication

MCP tool calls use the `{actorToken?scopes=...}` substitution in MCP headers. This means:

1. The dashboard passes the user's TID token to the Agent Service as the actor token
2. The Agent Service derives a scoped sub-token for the specified scopes
3. The sub-token is placed in the MCP call header
4. The MCP server validates the sub-token against TID

The dashboard never directly calls MCP servers — all MCP calls flow through the Agent Service. This means the user's permissions are enforced at the Agent Service + MCP level, not in the dashboard.

---

## Data Privacy

- Workflow JSON (nodes, configs, edges) is stored only on the dashboard backend (no platform storage of workflow structure)
- Input/Assumption node values are passed as run context on every agent run and are stored in the Agent Service's thread/run history (accessible to the user and agents they share with)
- The chatbot's conversation history (threads) is stored in the Agent Service, accessible only to the conversation creator
- No user behavior telemetry is collected beyond what the Agent Service tracks (run count, token usage)

---

## Content Safety

Before any AI node runs, the Agent Service's built-in responsible AI / safety controls apply (same as Studio and Assist). The dashboard additionally:
- Shows the **AI Data Consent** Modus pattern before first execution against a real (non-Test) MCP
- Shows the **AI Disclaimer** Modus pattern in the bottom bar of Execute Mode: "AI-generated simulation results may contain errors. Verify critical estimates independently."
- Applies the **AI Safety Controls** Modus pattern for any operation that writes back to an external system (future: when MCP nodes support write operations)
