import { useCallback, useEffect, useRef, useState } from "react";
import {
  ModusWcAccordion,
  ModusWcBadge,
  ModusWcButton,
  ModusWcChip,
  ModusWcCollapse,
  ModusWcIcon,
  ModusWcLoader,
  ModusWcTextInput,
  ModusWcTypography,
} from "@trimble-oss/moduswebcomponents-react";
import { useAppStore } from "@/store/appStore";
import { apiBase } from "@/api/http";

const BASE = `${apiBase()}/api`;
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

/** Follow-up actions (Modus AI “Follow up” pattern) — short prompts after a reply. */
const FOLLOW_UP_CHIPS: { label: string; prompt: string }[] = [
  { label: "Summarize the plan", prompt: "Briefly summarize the workflow plan you just produced." },
  { label: "List assumptions", prompt: "What assumptions or risks should I double-check in this plan?" },
  { label: "Next steps", prompt: "What should I do next with this workflow on the canvas?" },
];

function modusDemoInitialMessages(): Msg[] {
  return [
    {
      role: "system",
      text:
        "Hi! I'm the AI Planner. How can I help you today?",
      ts: Date.now(),
    },
  ];
}

function stripBold(t: string) {
  return t.replace(/\*\*(.*?)\*\*/g, "$1");
}

function AssistantPlannerBubbleModus({
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
    <div className="max-w-[88%] flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <ModusWcBadge color="secondary" size="sm" variant="outlined" customClass="font-mono text-[10px]">
          AI
        </ModusWcBadge>
      </div>
      <div className="rounded-2xl rounded-tl-sm border border-solid border-[var(--modus-wc-color-base-200)] bg-[var(--modus-wc-color-base-100)] px-3.5 py-2.5">
        <ModusWcTypography
          hierarchy="p"
          size="sm"
          label={stripBold(text)}
          customClass="m-0 whitespace-pre-wrap text-[var(--modus-wc-color-base-content)]"
        />
      </div>
      <ModusWcTypography
        hierarchy="p"
        size="xs"
        label="AI-assisted response · verify before production use"
        customClass="m-0 pl-0.5 text-[var(--modus-wc-color-base-content-low-contrast)]"
      />
      {envelopeType ? (
        <ModusWcBadge color="tertiary" variant="outlined" size="sm" customClass="self-start">
          <span className="text-[11px] font-mono text-[var(--modus-wc-color-base-content-low-contrast)]">
            envelope: {envelopeType}
          </span>
        </ModusWcBadge>
      ) : null}
      {hasSteps ? (
        <ModusWcAccordion customClass="mt-1 w-full">
          <ModusWcCollapse
            bordered
            expanded={stepsOpen}
            onExpandedChange={(e) => setStepsOpen(Boolean(e.detail.expanded))}
            options={{
              title: `BFF steps (${steps!.length})`,
              size: "sm",
            }}
          >
            <div
              slot="content"
              className="max-h-[220px] overflow-y-auto space-y-1.5 px-1 pb-2 text-[11px] text-[var(--modus-wc-color-base-content-low-contrast)]"
            >
              {steps!.map((s, idx) => (
                <div key={`${idx}-${s.label}`} className="whitespace-pre-wrap">
                  <span className="text-[var(--modus-wc-color-base-content)]">• {s.label}</span>
                  {s.detail ? `\n   ${s.detail}` : ""}
                </div>
              ))}
            </div>
          </ModusWcCollapse>
        </ModusWcAccordion>
      ) : null}
    </div>
  );
}

function EmptyCanvasPlaceholderModus() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[var(--modus-wc-color-base-page)] px-6 text-center">
      <ModusWcIcon
        name="schema"
        size="xl"
        decorative
        customClass="text-[var(--modus-wc-color-base-300)]"
      />
      <ModusWcTypography
        hierarchy="h4"
        size="lg"
        weight="semibold"
        label="Canvas is empty"
        customClass="m-0 text-[var(--modus-wc-color-base-content)]"
      />
      <ModusWcTypography
        hierarchy="p"
        size="sm"
        label="Ask the AI Planner on the left. The BFF runs your Studio agent and executes planner tools locally; when execute_workflow finishes, the canvas appears here (?embed=1)."
        customClass="m-0 max-w-md text-[var(--modus-wc-color-base-content-low-contrast)]"
      />
    </div>
  );
}

export default function ModusDemoPage() {
  const fetchProjectsFromApi = useAppStore((s) => s.fetchProjectsFromApi);

  const [messages, setMessages] = useState<Msg[]>(() => modusDemoInitialMessages());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
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

        setMessages((prev) => prev.slice(0, -1));

        setThreadId(data.threadId ?? null);
        setRunId(data.runId ?? null);

        if (data.error) {
          push("assistant", `Error: ${data.error}\n\n_(agent id: \`${data.agentId}\`)_`);
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
    setMessages(modusDemoInitialMessages());
  }, []);

  return (
    <div className="flex h-screen min-h-0 w-full flex-col bg-[var(--modus-wc-color-base-page)] text-[var(--modus-wc-color-base-content)] sm:flex-row">
      <div className="mdp-sidebar flex min-h-0 w-full shrink-0 flex-col sm:w-[420px]">
        <div className="mdp-border-b bg-[var(--modus-wc-color-base-100)] px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="ai-ux-gradient-frame inline-flex shrink-0">
              <div className="ai-ux-gradient-frame__glow" aria-hidden />
              <div className="ai-ux-gradient-frame__inner flex size-8 items-center justify-center rounded-lg">
                <ModusWcIcon name="ai_stars" size="sm" decorative customClass="text-white" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <ModusWcTypography
                hierarchy="p"
                size="md"
                weight="bold"
                label="AI Planner"
                customClass="m-0 truncate text-[var(--modus-wc-color-base-content)]"
              />
              <ModusWcTypography
                hierarchy="p"
                size="xs"
                label={`Direct agent · BFF MCP · thread ${threadId && runId ? "on" : "new"}`}
                customClass="m-0 text-[var(--modus-wc-color-base-content-low-contrast)]"
              />
            </div>
            <ModusWcButton
              variant="outlined"
              color="tertiary"
              size="sm"
              disabled={busy}
              title="Clears this chat and starts a new Studio thread on next Send. Canvas workflow id is unchanged."
              onButtonClick={() => startNewChat()}
              customClass="shrink-0"
            >
              New chat
            </ModusWcButton>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          <ModusWcTypography
            hierarchy="p"
            size="xs"
            weight="semibold"
            label="Assistant"
            customClass="m-0 uppercase tracking-wide text-[var(--modus-wc-color-base-content-low-contrast)]"
          />
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
            >
              {m.role !== "system" && m.role !== "assistant" ? (
                <ModusWcTypography
                  hierarchy="p"
                  size="xs"
                  label="You"
                  customClass="m-0 mb-1 pr-1 text-[var(--modus-wc-color-base-content-low-contrast)]"
                />
              ) : null}
              {m.role === "assistant" ? (
                <AssistantPlannerBubbleModus
                  text={m.text}
                  steps={m.steps}
                  envelopeType={m.envelopeType}
                />
              ) : (
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${
                    m.role === "user"
                      ? "rounded-tr-sm bg-[var(--modus-wc-color-primary)]"
                      : m.role === "system"
                        ? "rounded-tl-sm border border-solid border-[var(--modus-wc-color-base-300)] bg-[var(--modus-wc-color-base-100)]"
                        : "rounded-tl-sm border border-solid border-[var(--modus-wc-color-base-200)] bg-[var(--modus-wc-color-base-100)]"
                  }`}
                >
                  <ModusWcTypography
                    hierarchy="p"
                    size="sm"
                    label={stripBold(m.text)}
                    customClass={`m-0 whitespace-pre-wrap ${
                      m.role === "user"
                        ? "text-[var(--modus-wc-color-primary-content)]"
                        : "text-[var(--modus-wc-color-base-content)]"
                    }`}
                  />
                </div>
              )}
            </div>
          ))}
          {busy ? (
            <div
              className="mdp-border-b flex items-center gap-2 rounded-lg bg-[var(--modus-wc-color-base-100)] px-3 py-2 text-[var(--modus-wc-color-base-content-low-contrast)]"
              role="status"
              aria-live="polite"
            >
              <ModusWcLoader variant="spinner" size="sm" />
              <ModusWcTypography hierarchy="p" size="sm" label="Processing request…" customClass="m-0" />
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        {!busy && messages.length < 4 ? (
          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {SUGGESTED.map((s) => (
                <ModusWcChip
                  key={s}
                  label={s}
                  size="sm"
                  variant="outline"
                  onChipClick={() => void handleSend(s)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {!busy &&
        messages.length > 2 &&
        messages[messages.length - 1]?.role === "assistant" ? (
          <div className="mdp-border-t flex flex-col gap-2 px-4 py-3">
            <ModusWcTypography
              hierarchy="p"
              size="xs"
              weight="semibold"
              label="Follow up"
              customClass="m-0 text-[var(--modus-wc-color-base-content-low-contrast)]"
            />
            <div className="flex flex-wrap gap-2">
              {FOLLOW_UP_CHIPS.map((c) => (
                <ModusWcChip
                  key={c.prompt}
                  label={c.label}
                  size="sm"
                  variant="outline"
                  onChipClick={() => void handleSend(c.prompt)}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1 px-4 pt-3">
          <div className="flex gap-2 pb-3">
            <ModusWcTextInput
              className="min-w-0 flex-1"
              label=""
              autoComplete="off"
              placeholder="Plan a sprint for team of 8, velocity 42…"
              value={input}
              disabled={busy}
              onInputChange={(e) => setInput(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
            />
            <ModusWcButton
              variant="filled"
              color="primary"
              size="md"
              disabled={busy || !input.trim()}
              aria-disabled={busy || !input.trim()}
              onButtonClick={() => void handleSend()}
              customClass="self-end shrink-0"
            >
              Send
            </ModusWcButton>
          </div>
        </div>

        <div className="mdp-border-t px-4 pb-3 pt-3">
          <ModusWcTypography
            hierarchy="p"
            size="xs"
            label="AI can make mistakes. Verify workflow outputs and critical estimates independently before relying on them."
            customClass="m-0 leading-snug text-[var(--modus-wc-color-base-content-low-contrast)]"
          />
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mdp-border-b flex shrink-0 flex-wrap items-center gap-2 bg-[var(--modus-wc-color-base-100)] px-3 py-2">
          <ModusWcTypography
            hierarchy="p"
            size="xs"
            label="Load workflow"
            customClass="m-0 shrink-0 whitespace-nowrap text-[var(--modus-wc-color-base-content-low-contrast)]"
          />
          <ModusWcTextInput
            className="min-w-[120px] flex-1"
            label=""
            placeholder="Paste a workflow ID, e.g. wf-abc123…"
            value={loadIdInput}
            onInputChange={(e) => setLoadIdInput(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter") loadWorkflowById();
            }}
          />
          <ModusWcButton
            variant="outlined"
            color="secondary"
            size="sm"
            disabled={!loadIdInput.trim()}
            onButtonClick={() => loadWorkflowById()}
          >
            Load
          </ModusWcButton>
          {workflowId ? (
            <ModusWcButton variant="outlined" color="primary" size="sm" onButtonClick={() => setCanvasLoadKey((k) => k + 1)}>
              Reload canvas
            </ModusWcButton>
          ) : null}
        </div>
        {workflowId ? (
          <iframe
            key={`${workflowId}:${canvasLoadKey}`}
            src={`/projects/${PROJECT_ID}/workflows/${workflowId}?embed=1`}
            className="h-full min-h-0 w-full flex-1 border-0"
            title="AI Planner canvas"
          />
        ) : (
          <EmptyCanvasPlaceholderModus />
        )}
      </div>
    </div>
  );
}
