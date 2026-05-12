import {
  CHAT_UI_URLS,
  ChatUiVariants,
  ContentVariants,
  listenToChatUi,
  listenToChatUiEvents,
  type ChatUiConfiguration,
  type ChatUiEvent,
  type Environment,
  type LocalTools,
  type OnBeforeRunConfig,
  type OnBeforeRunProvider,
  type Tool,
} from "@trimble-agentic-external-npm-local/agentic-platform-sdk-iframe-typescript";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearAgenticChatToken,
  getStoredAgenticChatToken,
  openTrimbleIdLoginPopup,
} from "@/utils/agentic-chat-tid-auth";

/** Simplified tool shape from MCP `tools/list` (or similar). */
export type AgenticPlannerTool = {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
};

export type AgenticFullChatOnBeforeRun = {
  tools: AgenticPlannerTool[];
  onToolCall: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<unknown>;
};

export type AgenticFullChatProps = {
  agentId: string;
  /** Trimble embed hosts: `prod` | `development` | `stage` (`dev` is an alias for `development`). */
  environment: Environment | "dev";
  theme: "dark" | "light";
  onBeforeRun?: AgenticFullChatOnBeforeRun;
  /**
   * If set, the iframe mounts immediately and this supplies the JWT (e.g. a machine token from your BFF).
   * If omitted, users sign in with **Trimble ID (PKCE)** in the host page first — same pattern as
   * modus-wc-2.0 `.storybook/addons/ai-chat/ChatPanel`.
   */
  provideToken?: () => Promise<string>;
  /**
   * After PKCE login, PATCH the JWT to `/api/auth/token` so the Nest BFF uses it for `/api/agents/*` calls.
   */
  syncUserTokenToBff?: boolean;
};

function resolveEnvironment(environment: Environment | "dev"): Environment {
  switch (environment) {
    case "prod":
      return "prod";
    case "development":
      return "development";
    case "stage":
      return "stage";
    case "dev":
      return "development";
    default: {
      const _exhaustive: never = environment;
      return _exhaustive;
    }
  }
}

function mcpToolToSdkTool(t: AgenticPlannerTool): Tool {
  const parameters =
    t.parameters ??
    (t.inputSchema && typeof t.inputSchema === "object"
      ? (t.inputSchema as Record<string, unknown>)
      : undefined);
  return {
    name: t.name,
    description: t.description,
    parameters,
  };
}

function buildOnBeforeRunConfig(simple: AgenticFullChatOnBeforeRun): OnBeforeRunConfig {
  const runTime: LocalTools["runTime"] = {};
  for (const t of simple.tools) {
    const name = t.name;
    runTime[name] = {
      definition: mcpToolToSdkTool(t),
      callback: async (args) => {
        const result = await simple.onToolCall(name, args);
        if (typeof result === "string") return result;
        try {
          return JSON.stringify(result);
        } catch {
          return String(result);
        }
      },
    };
  }
  return {
    tools: { runTime, global: {} },
    runContext: { context: [] },
  };
}

/**
 * Full-height Trimble Assist chat embed (`ChatUiVariants.Full`) using the iframe SDK.
 *
 * - **Default:** Trimble ID PKCE in the parent (no iframe until a user JWT exists) — same pattern as
 *   modus-wc-2.0 `.storybook/addons/ai-chat/ChatPanel` (`openTidLogin` / `tid-callback.html`).
 * - **Optional `provideToken`:** supply a token yourself (e.g. server proxy); iframe shows immediately.
 */
export function AgenticFullChat({
  agentId,
  environment,
  theme,
  onBeforeRun,
  provideToken: provideTokenProp,
  syncUserTokenToBff = false,
}: AgenticFullChatProps) {
  const useExternalToken = typeof provideTokenProp === "function";
  const [sessionToken, setSessionToken] = useState(
    () => getStoredAgenticChatToken() || ""
  );
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  const hasToken = useExternalToken || sessionToken.length > 0;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const propsRef = useRef({
    agentId,
    provideTokenProp,
    theme,
    environment,
    onBeforeRun,
  });
  propsRef.current = { agentId, provideTokenProp, theme, environment, onBeforeRun };

  const env = resolveEnvironment(environment);
  const embedOrigin = CHAT_UI_URLS[env];
  const iframeSrc = useMemo(() => embedOrigin, [embedOrigin]);

  const handleChatUiEvent = useCallback((_event: ChatUiEvent) => {
    // Reserved — ChatPanel handles these silently; extend if product UX needs it.
  }, []);

  const handleSignIn = useCallback(async () => {
    setIsLoggingIn(true);
    setLoginError("");
    try {
      const newToken = await openTrimbleIdLoginPopup();
      setSessionToken(newToken);
      if (syncUserTokenToBff) {
        await fetch("/api/auth/token", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: newToken }),
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Sign-in failed";
      if (message !== "Login popup was closed") {
        setLoginError(message);
      }
    } finally {
      setIsLoggingIn(false);
    }
  }, [syncUserTokenToBff]);

  const handleSignOut = useCallback(() => {
    clearAgenticChatToken();
    setSessionToken("");
    setLoginError("");
  }, []);

  useEffect(() => {
    if (!hasToken || !iframeRef.current) return;

    const iframe = iframeRef.current;

    const onBeforeRunProvider: OnBeforeRunProvider = async () => {
      const simple = propsRef.current.onBeforeRun;
      if (!simple) {
        return {
          tools: { runTime: {}, global: {} },
          runContext: { context: [] },
        };
      }
      return buildOnBeforeRunConfig(simple);
    };

    const provideChatUiConfig = (): ChatUiConfiguration => {
      const p = propsRef.current;
      const e = resolveEnvironment(p.environment);
      return {
        environment: e,
        agentId: p.agentId,
        localization: {},
        uiConfig: {
          theme: p.theme,
          contentVariant: ContentVariants.Chat,
          variant: ChatUiVariants.Full,
          chatInput: {
            buttons: [],
            hideModelSelection: true,
          },
          showSignIn: false,
        },
      };
    };

    const getToken = async (): Promise<string> => {
      const ext = propsRef.current.provideTokenProp;
      if (ext) return ext();
      const stored = getStoredAgenticChatToken();
      if (!stored) {
        clearAgenticChatToken();
        return "";
      }
      return stored;
    };

    const stopChat = listenToChatUi(
      iframe,
      embedOrigin,
      provideChatUiConfig,
      getToken,
      onBeforeRunProvider
    );

    const stopEvents = listenToChatUiEvents(embedOrigin, handleChatUiEvent);

    return () => {
      stopChat();
      stopEvents();
    };
  }, [agentId, embedOrigin, environment, handleChatUiEvent, hasToken, theme]);

  if (!hasToken) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: theme === "dark" ? "#161b27" : "#f8fafc",
          color: theme === "dark" ? "#e2e8f0" : "#0f172a",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            maxWidth: 280,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600 }}>Trimble Assist</div>
          {loginError ? (
            <div style={{ fontSize: 13, color: "#dc2626" }}>{loginError}</div>
          ) : null}
          <button
            type="button"
            disabled={isLoggingIn}
            onClick={() => void handleSignIn()}
            style={{
              width: "100%",
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              fontWeight: 600,
              fontSize: 14,
              cursor: isLoggingIn ? "not-allowed" : "pointer",
              background: "#0063a3",
              color: "#fff",
            }}
          >
            {isLoggingIn ? "Signing in…" : "Sign in with Trimble ID"}
          </button>
          <p style={{ margin: 0, fontSize: 11, opacity: 0.75 }}>
            Redirect: <code style={{ fontSize: 10 }}>/tid-callback.html</code> (must be allowed for
            this app origin in the Trimble developer console).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {!useExternalToken ? (
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            justifyContent: "flex-end",
            padding: "6px 10px",
            borderBottom: theme === "dark" ? "1px solid #2d3748" : "1px solid #e2e8f0",
            background: theme === "dark" ? "#1a2235" : "#fff",
          }}
        >
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              fontSize: 12,
              border: "none",
              background: "transparent",
              color: theme === "dark" ? "#94a3b8" : "#64748b",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
      <iframe
        ref={iframeRef}
        title="Trimble Assist"
        src={iframeSrc}
        key={useExternalToken ? agentId : sessionToken}
        style={{
          flex: 1,
          width: "100%",
          border: "none",
          minHeight: 0,
        }}
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
