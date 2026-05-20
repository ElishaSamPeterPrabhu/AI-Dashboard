import React, { useEffect, useState } from "react";
import { type Node } from "@xyflow/react";
import {
  ModusWcTypography,
  ModusWcTextInput,
  ModusWcTextarea,
  ModusWcButton,
  ModusWcIcon,
  ModusWcSelect,
} from "@trimble-oss/moduswebcomponents-react";
import { useCanvasStore } from "@/store/canvasStore";
import { apiGet, apiPost } from "@/api/http";

// ── Agent binding widget ──────────────────────────────────────────────────────

interface AgentBindingWidgetProps {
  agentId: string;
  agentName: string;
  systemPrompt: string;
  nodeLabel: string;
  onBound: (id: string, name: string) => void;
  onUnbound: () => void;
}

function AgentBindingWidget({
  agentId, agentName, systemPrompt, nodeLabel, onBound, onUnbound,
}: AgentBindingWidgetProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [agents, setAgents] = useState<Array<{ id: string; name: string; description?: string }>>([]);
  const [pickLoading, setPickLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [pasteId, setPasteId] = useState("");
  const [pasteLoading, setPasteLoading] = useState(false);

  const provision = async () => {
    setLoading(true);
    setError("");
    try {
      const json = await apiPost<{ agentId?: string; agentName?: string }>(
        "/api/agents/provision",
        { name: nodeLabel || "AI Node", systemPrompt }
      );
      onBound(json.agentId!, json.agentName!);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async (search?: string) => {
    setPickLoading(true);
    try {
      const url = search?.trim() ? `/api/agents?search=${encodeURIComponent(search)}` : "/api/agents";
      const list = await apiGet<Array<{ id: string; name: string; description?: string }>>(url);
      setAgents(list);
    } catch {
      setAgents([]);
    } finally {
      setPickLoading(false);
    }
  };

  const openPicker = async () => {
    setShowPicker(true);
    setSearchTerm("");
    setPasteId("");
    await fetchAgents();
  };

  /** Look up a known agent ID directly (for agents not in the list) */
  const bindById = async () => {
    const id = pasteId.trim();
    if (!id) return;
    setPasteLoading(true);
    setError("");
    try {
      // Try to resolve the name from the server
      const agent = await apiGet<{ id: string; name: string } | null>(`/api/agents/${encodeURIComponent(id)}/info`);
      if (agent?.id) {
        onBound(agent.id, agent.name);
      } else {
        // Bind anyway — name will be updated when user JWT is active
        onBound(id, nodeLabel || id.slice(0, 8));
      }
      setShowPicker(false);
    } catch {
      // Network error — bind with ID, name resolves later
      onBound(id, nodeLabel || id.slice(0, 8));
      setShowPicker(false);
    } finally {
      setPasteLoading(false);
    }
  };

  const isBound = Boolean(agentId);

  // Auto-resolve name when bound but name is a placeholder
  useEffect(() => {
    if (!agentId || (agentName && agentName.length > 12 && agentName !== agentId)) return;
    void apiGet<{ id: string; name: string } | null>(`/api/agents/${encodeURIComponent(agentId)}/info`)
      .then((a) => { if (a?.name && a.name !== agentId) onBound(agentId, a.name); })
      .catch(() => {});
  }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-2">
      {/* Bound state */}
      {isBound && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: "rgba(8,145,178,0.08)", border: "1px solid #0891b2" }}>
          <i className="modus-icons" style={{ fontSize: 13, color: "#0891b2" }}>check_circle</i>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 11, fontWeight: 600, color: "#0891b2", fontFamily: "system-ui", display: "flex", alignItems: "center", gap: 4 }}>
              {agentName || agentId}
              {/* If name looks like a placeholder, offer to resolve it */}
              {(!agentName || agentName === agentId || agentName.length <= 12) && (
                <button
                  onClick={async () => {
                    try {
                      const a = await apiGet<{ id: string; name: string } | null>(`/api/agents/${encodeURIComponent(agentId)}/info`);
                      if (a?.name) onBound(agentId, a.name);
                    } catch { /* ignore */ }
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#0891b2", fontSize: 9, padding: 0, textDecoration: "underline", fontFamily: "system-ui" }}
                  title="Fetch agent name from server"
                >
                  resolve
                </button>
              )}
            </div>
            <div style={{ fontSize: 9, color: "var(--modus-wc-color-base-content-low-contrast)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agentId}</div>
          </div>
          <button
            onClick={onUnbound}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--modus-wc-color-base-content-low-contrast)", fontSize: 12, padding: 2 }}
            title="Unbind agent"
          >
            <i className="modus-icons" style={{ fontSize: 13 }}>close</i>
          </button>
        </div>
      )}

      {/* Unbound state — action buttons */}
      {!isBound && !showPicker && (
        <div className="flex flex-col gap-2">
          <ModusWcButton
            variant="filled" color="primary" size="sm"
            disabled={!systemPrompt.trim() || loading}
            onButtonClick={() => void provision()}
          >
            <ModusWcIcon slot="start" name="ai_stars" size="sm" decorative />
            {loading ? "Creating…" : "Auto-create agent"}
          </ModusWcButton>
          <ModusWcButton variant="outlined" color="tertiary" size="sm" onButtonClick={() => void openPicker()}>
            <ModusWcIcon slot="start" name="link" size="sm" decorative />
            Bind existing agent
          </ModusWcButton>
          {!systemPrompt.trim() && (
            <p className="m-0 text-xs text-[var(--modus-wc-color-base-content-low-contrast)]" style={{ fontFamily: "system-ui" }}>
              Add a description above before auto-creating.
            </p>
          )}
        </div>
      )}

      {/* Picker dropdown */}
      {!isBound && showPicker && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="m-0 text-xs font-semibold text-[var(--modus-wc-color-base-content-low-contrast)] uppercase tracking-wider" style={{ fontFamily: "system-ui" }}>
              Your agents
            </p>
            <button onClick={() => setShowPicker(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--modus-wc-color-base-content-low-contrast)", padding: 2 }}>
              <i className="modus-icons" style={{ fontSize: 13 }}>close</i>
            </button>
          </div>

          {/* Search box */}
          <div className="flex gap-1">
            <input
              type="text"
              value={searchTerm}
              placeholder="Search by name…"
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void fetchAgents(searchTerm); }}
              style={{
                flex: 1, padding: "4px 8px", borderRadius: 6, fontSize: 11,
                border: "1px solid var(--modus-wc-color-base-300)",
                background: "var(--modus-wc-color-base-100)",
                color: "var(--modus-wc-color-base-content)",
                fontFamily: "system-ui", outline: "none",
              }}
            />
            <button
              onClick={() => void fetchAgents(searchTerm)}
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--modus-wc-color-base-300)", background: "var(--modus-wc-color-base-200)", cursor: "pointer" }}
              title="Search"
            >
              <i className="modus-icons" style={{ fontSize: 12, color: "var(--modus-wc-color-base-content)" }}>search</i>
            </button>
          </div>

          {/* Agent list */}
          {pickLoading && <p className="m-0 text-xs text-[var(--modus-wc-color-base-content-low-contrast)]" style={{ fontFamily: "system-ui" }}>Loading…</p>}
          {!pickLoading && agents.length === 0 && (
            <p className="m-0 text-xs text-[var(--modus-wc-color-base-content-low-contrast)]" style={{ fontFamily: "system-ui" }}>No agents found. Try searching, or paste an agent ID below.</p>
          )}
          <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
            {agents.map((a) => (
              <button
                key={a.id}
                onClick={() => { onBound(a.id, a.name); setShowPicker(false); }}
                style={{
                  textAlign: "left", padding: "6px 8px", borderRadius: 6, cursor: "pointer",
                  border: "1px solid var(--modus-wc-color-base-300)",
                  background: "var(--modus-wc-color-base-100)",
                  fontFamily: "system-ui", fontSize: 12,
                  color: "var(--modus-wc-color-base-content)",
                }}
              >
                <div style={{ fontWeight: 600 }}>{a.name}</div>
                <div style={{ fontSize: 9, opacity: 0.5, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.id.slice(0, 8)}…{a.id.slice(-4)}
                </div>
                {a.description && <div style={{ fontSize: 10, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{a.description}</div>}
              </button>
            ))}
          </div>

          {/* Paste ID directly */}
          <div className="flex flex-col gap-1 pt-1 border-t border-[var(--modus-wc-color-base-300)]">
            <p className="m-0 text-xs text-[var(--modus-wc-color-base-content-low-contrast)]" style={{ fontFamily: "system-ui" }}>Or paste an agent ID directly:</p>
            <input
              type="text"
              value={pasteId}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              onChange={(e) => setPasteId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void bindById(); }}
              style={{
                padding: "4px 8px", borderRadius: 6, fontSize: 10, width: "100%", boxSizing: "border-box" as const,
                border: "1px solid var(--modus-wc-color-base-300)",
                background: "var(--modus-wc-color-base-100)",
                color: "var(--modus-wc-color-base-content)",
                fontFamily: "monospace", outline: "none",
              }}
            />
            <button
              onClick={() => void bindById()}
              disabled={!pasteId.trim() || pasteLoading}
              style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #0891b2", background: "rgba(8,145,178,0.1)", cursor: "pointer", color: "#0891b2", fontSize: 11, fontFamily: "system-ui", fontWeight: 600, alignSelf: "flex-start" }}
            >
              {pasteLoading ? "Looking up…" : "Bind this ID"}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="m-0 text-xs" style={{ color: "var(--modus-wc-color-danger)", fontFamily: "system-ui" }}>{error}</p>
      )}
    </div>
  );
}

interface Props {
  node: Node;
  onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  sticky:     "Sticky Note",
  process:    "Process",
  input:      "Input",
  calculator: "Calculator",
  output:     "Result",
  ai:         "AI Node",
  chart:      "Chart",
  decision:   "Decision",
  database:   "Database",
  trigger:    "Trigger",
  group:      "Frame",
  assumption: "Assumption",
  loop:       "Loop",
  connector:  "Connector",
};

/**
 * Extract the string value from a Modus WC inputChange event.
 * The event detail is an InputEvent whose target is the native input.
 */
function inputVal(e: CustomEvent): string {
  return (e.detail as InputEvent & { target: HTMLInputElement })?.target?.value ?? "";
}

export default function NodeConfigPanel({ node, onClose }: Props) {
  const { updateNodeConfig } = useCanvasStore();
  const d = node.data as Record<string, unknown>;
  const update = (key: string, value: unknown) => updateNodeConfig(node.id, { [key]: value });

  // Database entry local state
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [dbKeyError, setDbKeyError] = useState(false);

  const addEntry = () => {
    if (!newKey.trim()) { setDbKeyError(true); return; }
    setDbKeyError(false);
    const entries = [...((d.entries as { key: string; value: string }[]) ?? [])];
    entries.push({ key: newKey.trim(), value: newVal.trim() });
    update("entries", entries);
    setNewKey("");
    setNewVal("");
  };

  const removeEntry = (idx: number) => {
    const entries = [...((d.entries as { key: string; value: string }[]) ?? [])];
    entries.splice(idx, 1);
    update("entries", entries);
  };

  const typeLabel = TYPE_LABELS[node.type ?? ""] ?? node.type ?? "Node";

  return (
    <div className="flex flex-col h-full bg-[var(--modus-wc-color-base-page)] border-l border-[var(--modus-wc-color-base-300)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--modus-wc-color-base-300)] flex-shrink-0">
        <ModusWcTypography
          hierarchy="p" size="sm" weight="semibold"
          label={`Configure: ${typeLabel}`}
          customClass="m-0 text-[var(--modus-wc-color-base-content)]"
        />
        <ModusWcButton size="sm" variant="borderless" color="tertiary" shape="square" aria-label="Close" onButtonClick={onClose}>
          <ModusWcIcon name="close" size="sm" decorative />
        </ModusWcButton>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">

        {/* Common label */}
        {!["sticky", "group"].includes(node.type ?? "") && (
          <ModusWcTextInput
            label="Label"
            value={(d.label as string) ?? ""}
            onInputChange={(e: CustomEvent) => update("label", inputVal(e))}
          />
        )}

        {/* ── Sticky ─────────────────────────────────────── */}
        {node.type === "sticky" && (
          <>
            <ModusWcTextarea
              label="Note text"
              value={(d.text as string) ?? ""}
              rows={4}
              onInputChange={(e: CustomEvent) => update("text", inputVal(e))}
            />
            <ModusWcSelect
              label="Color"
              value={(d.color as string) ?? "yellow"}
              options={JSON.stringify([
                { label: "Yellow", value: "yellow" },
                { label: "Blue",   value: "blue" },
                { label: "Pink",   value: "pink" },
                { label: "Green",  value: "green" },
                { label: "Purple", value: "purple" },
              ])}
              onInputChange={(e: CustomEvent) => update("color", inputVal(e))}
            />
          </>
        )}

        {/* ── Group / Frame ───────────────────────────────── */}
        {node.type === "group" && (
          <ModusWcTextInput
            label="Frame label"
            value={(d.label as string) ?? ""}
            onInputChange={(e: CustomEvent) => update("label", inputVal(e))}
          />
        )}

        {/* ── Process ─────────────────────────────────────── */}
        {node.type === "process" && (
          <ModusWcTextarea
            label="Description"
            value={(d.description as string) ?? ""}
            rows={3}
            onInputChange={(e: CustomEvent) => update("description", inputVal(e))}
          />
        )}

        {/* ── Input ───────────────────────────────────────── */}
        {node.type === "input" && (
          <>
            <ModusWcTextInput
              label="Context key (unique)"
              value={(d.description as string) ?? ""}
              placeholder="e.g. teamSize"
              onInputChange={(e: CustomEvent) => update("description", inputVal(e))}
            />
            <ModusWcSelect
              label="Data type"
              value={(d.dataType as string) ?? "string"}
              options={JSON.stringify([
                { label: "String",  value: "string" },
                { label: "Number",  value: "number" },
                { label: "Boolean", value: "boolean" },
              ])}
              onInputChange={(e: CustomEvent) => update("dataType", inputVal(e))}
            />
            <ModusWcTextInput
              label="Value"
              value={(d.value as string) ?? ""}
              placeholder="Enter a value"
              onInputChange={(e: CustomEvent) => update("value", inputVal(e))}
            />
          </>
        )}

        {/* ── Calculator ──────────────────────────────────── */}
        {node.type === "calculator" && (
          <ModusWcTextarea
            label="Formula (JS expression)"
            value={(d.formula as string) ?? ""}
            rows={4}
            placeholder="e.g. teamSize * velocity * 800"
            onInputChange={(e: CustomEvent) => update("formula", inputVal(e))}
          />
        )}

        {/* ── Output ──────────────────────────────────────── */}
        {node.type === "output" && (
          <ModusWcSelect
            label="Format"
            value={(d.format as string) ?? "text"}
            options={JSON.stringify([
              { label: "Text",       value: "text" },
              { label: "Number",     value: "number" },
              { label: "Currency",   value: "currency" },
              { label: "Percentage", value: "percentage" },
            ])}
            onInputChange={(e: CustomEvent) => update("format", inputVal(e))}
          />
        )}

        {/* ── AI Node ─────────────────────────────────────── */}
        {node.type === "ai" && (
          <>
            <ModusWcTextarea
              label="What should this agent do?"
              value={(d.description as string) ?? ""}
              rows={4}
              placeholder="Describe the agent's role…"
              onInputChange={(e: CustomEvent) => update("description", inputVal(e))}
            />
            <div className="ai-ux-gradient-frame">
              <div className="ai-ux-gradient-frame__glow" aria-hidden />
              <div className="ai-ux-gradient-frame__inner p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="ai-ux-agent-mark-static !w-5 !h-5 !rounded flex-shrink-0" aria-hidden>
                    <span className="text-white" style={{ fontSize: 9 }}>AI</span>
                  </div>
                  <ModusWcTypography hierarchy="p" size="xs" weight="semibold" label="Trimble Agent" customClass="m-0 text-[var(--modus-wc-color-base-content)]" />
                </div>
                <AgentBindingWidget
                  agentId={(d.agentId as string) ?? ""}
                  agentName={(d.agentName as string) ?? ""}
                  systemPrompt={(d.description as string) ?? ""}
                  nodeLabel={(d.label as string) ?? "AI Node"}
                  onBound={(id, name) => { update("agentId", id); update("agentName", name); }}
                  onUnbound={() => { update("agentId", ""); update("agentName", ""); }}
                />
              </div>
            </div>
          </>
        )}

        {/* ── Decision ────────────────────────────────────── */}
        {node.type === "decision" && (
          <>
            <ModusWcTextInput
              label="True branch label"
              value={(d.trueLabel as string) ?? "Yes"}
              onInputChange={(e: CustomEvent) => update("trueLabel", inputVal(e))}
            />
            <ModusWcTextInput
              label="False branch label"
              value={(d.falseLabel as string) ?? "No"}
              onInputChange={(e: CustomEvent) => update("falseLabel", inputVal(e))}
            />
            <p className="m-0 text-xs text-[var(--modus-wc-color-base-content-low-contrast)]" style={{ fontFamily: "system-ui" }}>
              Left = False · Right = True · Bottom = default
            </p>
          </>
        )}

        {/* ── Database ────────────────────────────────────── */}
        {node.type === "database" && (
          <>
            <ModusWcTextarea
              label="Description"
              value={(d.description as string) ?? ""}
              rows={2}
              placeholder="What data does this store represent?"
              onInputChange={(e: CustomEvent) => update("description", inputVal(e))}
            />

            {/* Existing entries */}
            {((d.entries as { key: string; value: string }[]) ?? []).map((entry, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="flex-1 flex gap-2 min-w-0">
                  <span className="flex-1 px-2 py-1 rounded text-xs font-mono truncate" style={{ background: "var(--modus-wc-color-base-200)", color: "#a78bfa" }}>
                    {entry.key}
                  </span>
                  <span className="flex-1 px-2 py-1 rounded text-xs font-mono truncate" style={{ background: "var(--modus-wc-color-base-200)", color: "var(--modus-wc-color-base-content)" }}>
                    {entry.value || "—"}
                  </span>
                </div>
                <ModusWcButton size="sm" variant="borderless" color="tertiary" shape="square" onButtonClick={() => removeEntry(idx)}>
                  <ModusWcIcon name="close" size="sm" decorative />
                </ModusWcButton>
              </div>
            ))}

            {/* Add new entry */}
            <div className="flex flex-col gap-2 pt-1 border-t border-[var(--modus-wc-color-base-300)]">
              <p className="m-0 text-xs font-semibold text-[var(--modus-wc-color-base-content-low-contrast)]" style={{ fontFamily: "system-ui" }}>Add entry</p>
              <ModusWcTextInput
                label="Key"
                placeholder="e.g. engineerDailyRate"
                value={newKey}
                onInputChange={(e: CustomEvent) => { setNewKey(inputVal(e)); setDbKeyError(false); }}
              />
              {dbKeyError && (
                <p className="m-0 text-xs" style={{ color: "var(--modus-wc-color-danger, #da212c)", fontFamily: "system-ui" }}>
                  Key is required
                </p>
              )}
              <ModusWcTextInput
                label="Value"
                placeholder="e.g. 800"
                value={newVal}
                onInputChange={(e: CustomEvent) => setNewVal(inputVal(e))}
              />
              <ModusWcButton variant="outlined" color="primary" size="sm" onButtonClick={addEntry}>
                <ModusWcIcon slot="start" name="add" size="sm" decorative />
                Add
              </ModusWcButton>
            </div>
          </>
        )}

        {/* ── Trigger ─────────────────────────────────────── */}
        {node.type === "trigger" && (
          <ModusWcSelect
            label="Trigger type"
            value={(d.triggerType as string) ?? "manual"}
            options={JSON.stringify([
              { label: "Manual (click to start)", value: "manual" },
              { label: "Scheduled (cron)",         value: "scheduled" },
              { label: "On Event (data change)",   value: "event" },
            ])}
            onInputChange={(e: CustomEvent) => update("triggerType", inputVal(e))}
          />
        )}

        {/* ── Assumption ──────────────────────────────────── */}
        {node.type === "assumption" && (
          <>
            <ModusWcSelect
              label="Distribution"
              value={(d.distribution as string) ?? "triangular"}
              options={JSON.stringify([
                { label: "Triangular (min / most likely / max)", value: "triangular" },
                { label: "Uniform (min / max)",                  value: "uniform" },
                { label: "Normal (mean / std dev)",              value: "normal" },
              ])}
              onInputChange={(e: CustomEvent) => update("distribution", inputVal(e))}
            />
            <ModusWcTextInput
              label="Minimum"
              value={String(d.min ?? "")}
              onInputChange={(e: CustomEvent) => update("min", Number(inputVal(e)))}
            />
            {["triangular", undefined].includes(d.distribution as string | undefined) && (
              <ModusWcTextInput
                label="Most likely"
                value={String(d.mostLikely ?? "")}
                onInputChange={(e: CustomEvent) => update("mostLikely", Number(inputVal(e)))}
              />
            )}
            {d.distribution === "normal" && (
              <ModusWcTextInput
                label="Mean"
                value={String(d.mostLikely ?? "")}
                onInputChange={(e: CustomEvent) => update("mostLikely", Number(inputVal(e)))}
              />
            )}
            <ModusWcTextInput
              label={(d.distribution as string) === "normal" ? "Std dev" : "Maximum"}
              value={String(d.max ?? "")}
              onInputChange={(e: CustomEvent) => update("max", Number(inputVal(e)))}
            />
            <p className="m-0 text-xs text-[var(--modus-wc-color-base-content-low-contrast)]" style={{ fontFamily: "system-ui" }}>
              Single-shot uses most-likely. Monte Carlo samples the distribution.
            </p>
          </>
        )}

        {/* ── Loop ────────────────────────────────────────── */}
        {node.type === "loop" && (
          <ModusWcTextInput
            label="Max iterations"
            value={String(d.maxIterations ?? 10)}
            onInputChange={(e: CustomEvent) => update("maxIterations", Number(inputVal(e)))}
          />
        )}

        {/* ── Chart ───────────────────────────────────────── */}
        {node.type === "chart" && (
          <ModusWcSelect
            label="Chart type"
            value={(d.chartType as string) ?? "bar"}
            options={JSON.stringify([
              { label: "Bar",          value: "bar" },
              { label: "Line",         value: "line" },
              { label: "Area",         value: "area" },
              { label: "Distribution", value: "distribution" },
            ])}
            onInputChange={(e: CustomEvent) => update("chartType", inputVal(e))}
          />
        )}

        {/* ── Connector ────────────────────────────────────── */}
        {node.type === "connector" && (
          <>
            <ModusWcTextInput
              label="Label"
              value={(d.label as string) ?? ""}
              placeholder="e.g. Phase 2: Capacity Planning"
              onInputChange={(e: CustomEvent) => update("label", inputVal(e))}
            />
            <ModusWcTextInput
              label="Section name (optional)"
              value={(d.sectionName as string) ?? ""}
              placeholder="e.g. Capacity Planning"
              onInputChange={(e: CustomEvent) => update("sectionName", inputVal(e))}
            />
            <ModusWcTextarea
              label="Description (optional)"
              value={(d.description as string) ?? ""}
              rows={2}
              placeholder="What data is being passed on?"
              onInputChange={(e: CustomEvent) => update("description", inputVal(e))}
            />
            <div className="flex flex-col gap-1 pt-1 border-t border-[var(--modus-wc-color-base-300)]">
              <p className="m-0 text-xs font-semibold text-[var(--modus-wc-color-base-content-low-contrast)] uppercase tracking-wider" style={{ fontFamily: "system-ui" }}>
                AI enrichment (optional)
              </p>
              <p className="m-0 text-xs text-[var(--modus-wc-color-base-content-low-contrast)]" style={{ fontFamily: "system-ui" }}>
                If set, the agent runs here and its output is stored as shared context — all downstream AI nodes can read it.
              </p>
              <AgentBindingWidget
                agentId={(d.agentId as string) ?? ""}
                agentName={(d.agentName as string) ?? ""}
                systemPrompt={(d.description as string) ?? (d.label as string) ?? "Summarise and enrich the incoming data for downstream AI nodes."}
                nodeLabel={(d.label as string) ?? "Connector"}
                onBound={(id, name) => { update("agentId", id); update("agentName", name); }}
                onUnbound={() => { update("agentId", ""); update("agentName", ""); }}
              />
            </div>
          </>
        )}

        {/* ── Execution metadata ──────────────────────────── */}
        {!["sticky", "group"].includes(node.type ?? "") && (
          <div className="flex flex-col gap-3 pt-2 border-t border-[var(--modus-wc-color-base-300)]">
            <p className="m-0 text-xs font-semibold text-[var(--modus-wc-color-base-content-low-contrast)] uppercase tracking-wider" style={{ fontFamily: "system-ui" }}>
              Execution
            </p>
            <ModusWcTextInput
              label="Est. duration (seconds)"
              value={String(d.estimatedDuration ?? "")}
              placeholder="e.g. 2"
              onInputChange={(e: CustomEvent) => { const v = inputVal(e); update("estimatedDuration", v ? Number(v) : 0); }}
            />
          </div>
        )}

      </div>
    </div>
  );
}
