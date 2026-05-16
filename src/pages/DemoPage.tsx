import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/appStore";

const BASE = "/api";
const PROJECT_ID = "p1";

type Role = "user" | "assistant" | "system";
interface Msg {
  role: Role;
  text: string;
  ts: number;
  steps?: Array<{ label: string; detail?: string }>;
  envelopeType?: string;
}

interface DemoRunResponse {
  steps: { label: string; detail?: string }[];
  workflowId: string | null;
  finalText: string;
  threadId: string | null;
  runId: string | null;
  envelopeType?: "chat" | "workflow" | "edit";
  error?: string;
  agentId: string;
}

const SUGGESTED = [
  "Plan a sprint for team of 8, velocity 42",
  "Plan a sprint for team of 5, velocity 30",
  "Plan a sprint for team of 12, velocity 60",
];

function demoPageInitialMessages(): Msg[] {
  return [
    {
      role: "system",
      text:
        "**AI Planner (direct)** — `POST /api/demo/run` keeps threadId/runId across turns; the agent returns a JSON envelope (`chat` / `workflow` / `edit`). BFF applies graph + execution; sign-in not required.",
      ts: Date.now(),
    },
  ];
}

function AssistantPlannerBubble({
  text,
  steps,
  envelopeType,
}: {
  text: string;
  steps?: Array<{ label: string; detail?: string }>;
  envelopeType?: string;
}) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const hasSteps = Boolean(steps && steps.length > 0);

  return (
    <div style={{ maxWidth: "88%" }}>
      <div
        style={{
          padding: "10px 14px",
          borderRadius: "4px 16px 16px 16px",
          background: "#1a2235",
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
        }}
      >
        {text.replace(/\*\*(.*?)\*\*/g, "$1")}
      </div>
      {envelopeType && (
        <div style={{ fontSize: 10, color: "#64748b", marginTop: 6, paddingLeft: 4 }}>
          envelope: <code style={{ color: "#94a3b8" }}>{envelopeType}</code>
        </div>
      )}
      {hasSteps && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setStepsOpen((o) => !o)}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              color: "#94a3b8",
              background: "#212838",
              border: "1px solid #334155",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {stepsOpen ? "▼" : "▶"} BFF steps ({steps!.length})
          </button>
          {stepsOpen && (
            <div
              style={{
                marginTop: 8,
                padding: "10px 12px",
                background: "#161b27",
                borderRadius: 8,
                border: "1px solid #2d3748",
                fontSize: 11,
                color: "#94a3b8",
                whiteSpace: "pre-wrap",
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {steps!.map((s, idx) => {
                const d = s.detail ? `\n   ${s.detail}` : "";
                return (
                  <div key={`${idx}-${s.label}`} style={{ marginBottom: 6 }}>
                    • {s.label}
                    {d}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyCanvasPlaceholder() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        color: "#4a5568",
        background: "#0f1117",
      }}
    >
      <div style={{ fontSize: 48 }}>✦</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "#64748b" }}>Canvas is empty</div>
      <div style={{ fontSize: 13, color: "#4a5568", textAlign: "center", maxWidth: 360 }}>
        Ask the AI Planner on the left. The BFF runs your Studio agent and executes planner tools
        locally; when <code style={{ color: "#94a3b8" }}>execute_workflow</code> finishes, the
        canvas appears here (<code style={{ color: "#94a3b8" }}>?embed=1</code>).
      </div>
    </div>
  );
}

export default function DemoPage() {
  const fetchProjectsFromApi = useAppStore((s) => s.fetchProjectsFromApi);

  const [messages, setMessages] = useState<Msg[]>(() => demoPageInitialMessages());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  /** Trimble Agent Service session — persisted for multi-turn Planner chat. */
  const [threadId, setThreadId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  /** Bumps when we need the canvas iframe to remount and GET canvas again. */
  const [canvasLoadKey, setCanvasLoadKey] = useState(0);
  const [loadIdInput, setLoadIdInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function push(
    role: Role,
    text: string,
    extra?: Partial<Pick<Msg, "steps" | "envelopeType">>
  ) {
    setMessages((prev) => [...prev, { role, text, ts: Date.now(), ...extra }]);
  }

  const handleSend = useCallback(
    async (text?: string) => {
      const q = (text ?? input).trim();
      if (!q || busy) return;
      setInput("");
      push("user", q);
      setBusy(true);
      push("assistant", "Running planner agent on the BFF (MCP tools execute locally)…");

      try {
        const res = await fetch(`${BASE}/demo/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: q,
            threadId,
            runId,
            workflowId,
          }),
        });
        const raw = await res.text();
        let data: DemoRunResponse;
        try {
          data = JSON.parse(raw) as DemoRunResponse;
        } catch {
          throw new Error(raw || `${res.status} ${res.statusText}`);
        }

        setMessages((prev) => {
          const withoutPending = prev.slice(0, -1);
          return withoutPending;
        });

        setThreadId(data.threadId ?? null);
        setRunId(data.runId ?? null);

        if (data.error) {
          push(
            "assistant",
            `Error: ${data.error}\n\n_(agent id: \`${data.agentId}\`)_`
          );
        } else {
          const summary =
            data.finalText?.trim() ||
            (data.workflowId ? `Workflow **${data.workflowId}** updated.` : "Done.");
          push("assistant", summary, {
            steps: data.steps,
            envelopeType: data.envelopeType,
          });
        }

        if (data.workflowId) {
          setWorkflowId(data.workflowId);
          setCanvasLoadKey((k) => k + 1);
          void fetchProjectsFromApi();
        }
      } catch (e) {
        setMessages((prev) => prev.slice(0, -1));
        push("assistant", `**Error:** ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [busy, fetchProjectsFromApi, input, threadId, runId, workflowId]
  );

  const loadWorkflowById = useCallback(() => {
    const id = loadIdInput.trim();
    if (!id) return;
    setWorkflowId(id);
    setCanvasLoadKey((k) => k + 1);
    void fetchProjectsFromApi();
  }, [fetchProjectsFromApi, loadIdInput]);

  const startNewChat = useCallback(() => {
    setThreadId(null);
    setRunId(null);
    setInput("");
    setBusy(false);
    setMessages(demoPageInitialMessages());
  }, []);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        background: "#0f1117",
        color: "#e2e8f0",
      }}
    >
      <div
        style={{
          width: 420,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #2d3748",
          flexShrink: 0,
          minHeight: 0,
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #2d3748", background: "#161b27" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "linear-gradient(135deg,#0063a3,#00a9e0)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
              }}
            >
              ✦
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>AI Planner</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                Direct agent · BFF MCP · thread {threadId && runId ? "on" : "new"}
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => startNewChat()}
              title="Clears this chat and starts a new Studio thread on next Send. Canvas workflow id is unchanged."
              style={{
                flexShrink: 0,
                fontSize: 10,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #475569",
                background: "#1a2235",
                color: "#94a3b8",
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.5 : 1,
              }}
            >
              New chat
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minHeight: 0,
          }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: m.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              {m.role !== "system" && (
                <div
                  style={{
                    fontSize: 10,
                    color: "#64748b",
                    marginBottom: 3,
                    paddingLeft: m.role === "user" ? 0 : 4,
                    paddingRight: m.role === "user" ? 4 : 0,
                  }}
                >
                  {m.role === "user" ? "You" : "Planner"}
                </div>
              )}
              {m.role === "assistant" ? (
                <AssistantPlannerBubble
                  text={m.text}
                  steps={m.steps}
                  envelopeType={m.envelopeType}
                />
              ) : (
              <div
                style={{
                  maxWidth: "88%",
                  padding: m.role === "system" ? "12px 16px" : "10px 14px",
                  borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                  background:
                    m.role === "user" ? "#0063a3" : m.role === "system" ? "#1e2940" : "#1a2235",
                  fontSize: 13,
                  lineHeight: 1.6,
                  border: m.role === "system" ? "1px solid #2d3748" : "none",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.text.replace(/\*\*(.*?)\*\*/g, "$1")}
              </div>
              )}
            </div>
          ))}
          {busy && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: 12 }}>
              <span style={{ animation: "pulse 1s infinite" }}>●</span> Working…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {!busy && messages.length < 4 && (
          <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            {SUGGESTED.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void handleSend(s)}
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  background: "#1a2235",
                  border: "1px solid #2d3748",
                  borderRadius: 8,
                  color: "#94a3b8",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: "12px 16px", borderTop: "1px solid #2d3748", display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void handleSend()}
            placeholder="Plan a sprint for team of 8, velocity 42…"
            disabled={busy}
            style={{
              flex: 1,
              padding: "10px 14px",
              background: "#1a2235",
              border: "1px solid #2d3748",
              borderRadius: 10,
              color: "#e2e8f0",
              fontSize: 13,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={busy || !input.trim()}
            style={{
              padding: "10px 18px",
              background: "#0063a3",
              border: "none",
              borderRadius: 10,
              color: "white",
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy || !input.trim() ? 0.5 : 1,
            }}
          >
            Send
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "8px 12px",
            borderBottom: "1px solid #2d3748",
            background: "#161b27",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>Load workflow</span>
          <input
            value={loadIdInput}
            onChange={(e) => setLoadIdInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadWorkflowById()}
            placeholder="wf-…"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "6px 10px",
              background: "#1a2235",
              border: "1px solid #2d3748",
              borderRadius: 8,
              color: "#e2e8f0",
              fontSize: 12,
            }}
          />
          <button
            type="button"
            onClick={() => loadWorkflowById()}
            disabled={!loadIdInput.trim()}
            style={{
              padding: "6px 12px",
              background: "#334155",
              border: "1px solid #475569",
              borderRadius: 8,
              color: "#e2e8f0",
              fontSize: 12,
              cursor: loadIdInput.trim() ? "pointer" : "not-allowed",
              opacity: loadIdInput.trim() ? 1 : 0.5,
            }}
          >
            Load
          </button>
          {workflowId ? (
            <button
              type="button"
              onClick={() => setCanvasLoadKey((k) => k + 1)}
              style={{
                padding: "6px 12px",
                background: "#1e3a5f",
                border: "1px solid #0063a3",
                borderRadius: 8,
                color: "#93c5fd",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Reload canvas
            </button>
          ) : null}
          {workflowId ? (
            <a
              href={`http://localhost:3000/canvas/${workflowId}`}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "6px 12px",
                background: "#1a2235",
                border: "1px solid #475569",
                borderRadius: 8,
                color: "#94a3b8",
                fontSize: 12,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              MCP canvas ↗
            </a>
          ) : null}
        </div>
        {workflowId ? (
          <iframe
            key={`${workflowId}:${canvasLoadKey}`}
            src={`/projects/${PROJECT_ID}/workflows/${workflowId}?embed=1`}
            style={{ width: "100%", height: "100%", border: "none", flex: 1, minHeight: 0 }}
            title="AI Planner canvas"
          />
        ) : (
          <EmptyCanvasPlaceholder />
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.3 } }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
