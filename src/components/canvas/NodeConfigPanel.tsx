import React, { useState } from "react";
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

interface Props {
  node: Node;
  onClose: () => void;
}

/** Small helper to render a readable node type label in the header */
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
};

export default function NodeConfigPanel({ node, onClose }: Props) {
  const { updateNodeConfig } = useCanvasStore();
  const d = node.data as Record<string, unknown>;

  const update = (key: string, value: unknown) => updateNodeConfig(node.id, { [key]: value });

  // ── Database key-value entry state ────────────────────────
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const addEntry = () => {
    if (!newKey.trim()) return;
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
        <ModusWcButton size="sm" variant="borderless" color="secondary" shape="square" aria-label="Close" onButtonClick={onClose}>
          <ModusWcIcon name="close" size="sm" decorative />
        </ModusWcButton>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">

        {/* Common label — most nodes have it */}
        {!["sticky", "group"].includes(node.type ?? "") && (
          <ModusWcTextInput
            label="Label"
            value={(d.label as string) ?? ""}
            onValueChange={(e: CustomEvent<string>) => update("label", e.detail)}
          />
        )}

        {/* ── Sticky ─────────────────────────────────────── */}
        {node.type === "sticky" && (
          <>
            <ModusWcTextarea
              label="Note text"
              value={(d.text as string) ?? ""}
              rows={4}
              onValueChange={(e: CustomEvent<string>) => update("text", e.detail)}
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
              onValueChange={(e: CustomEvent<string>) => update("color", e.detail)}
            />
          </>
        )}

        {/* ── Group / Frame ───────────────────────────────── */}
        {node.type === "group" && (
          <ModusWcTextInput
            label="Frame label"
            value={(d.label as string) ?? ""}
            onValueChange={(e: CustomEvent<string>) => update("label", e.detail)}
          />
        )}

        {/* ── Process ─────────────────────────────────────── */}
        {node.type === "process" && (
          <ModusWcTextarea
            label="Description"
            value={(d.description as string) ?? ""}
            rows={3}
            onValueChange={(e: CustomEvent<string>) => update("description", e.detail)}
          />
        )}

        {/* ── Input ───────────────────────────────────────── */}
        {node.type === "input" && (
          <>
            <ModusWcTextInput
              label="Context key (unique)"
              value={(d.description as string) ?? ""}
              onValueChange={(e: CustomEvent<string>) => update("description", e.detail)}
            />
            <ModusWcSelect
              label="Data type"
              value={(d.dataType as string) ?? "string"}
              options={JSON.stringify([
                { label: "String",  value: "string" },
                { label: "Number",  value: "number" },
                { label: "Boolean", value: "boolean" },
              ])}
              onValueChange={(e: CustomEvent<string>) => update("dataType", e.detail)}
            />
            <ModusWcTextInput
              label="Default value"
              value={(d.value as string) ?? ""}
              onValueChange={(e: CustomEvent<string>) => update("value", e.detail)}
            />
          </>
        )}

        {/* ── Calculator ──────────────────────────────────── */}
        {node.type === "calculator" && (
          <ModusWcTextarea
            label="Formula (JS expression)"
            value={(d.formula as string) ?? ""}
            rows={4}
            onValueChange={(e: CustomEvent<string>) => update("formula", e.detail)}
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
            onValueChange={(e: CustomEvent<string>) => update("format", e.detail)}
          />
        )}

        {/* ── AI Node ─────────────────────────────────────── */}
        {node.type === "ai" && (
          <>
            <ModusWcTextarea
              label="What should this agent do?"
              value={(d.description as string) ?? ""}
              rows={4}
              onValueChange={(e: CustomEvent<string>) => update("description", e.detail)}
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
                <ModusWcTypography
                  hierarchy="p" size="xs"
                  label={d.agentName ? `Bound to: ${d.agentName as string}` : "No agent bound yet."}
                  customClass="m-0 text-[var(--modus-wc-color-base-content-low-contrast)]"
                />
                <ModusWcButton variant="outlined" color="primary" size="sm" onButtonClick={() => {}}>
                  <ModusWcIcon slot="start" name="link" size="sm" decorative />
                  {d.agentName ? "Change agent" : "Bind existing agent"}
                </ModusWcButton>
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
              onValueChange={(e: CustomEvent<string>) => update("trueLabel", e.detail)}
            />
            <ModusWcTextInput
              label="False branch label"
              value={(d.falseLabel as string) ?? "No"}
              onValueChange={(e: CustomEvent<string>) => update("falseLabel", e.detail)}
            />
            <p className="m-0 text-xs text-[var(--modus-wc-color-base-content-low-contrast)]" style={{ fontFamily: "system-ui" }}>
              Left handle = False, Right handle = True, Bottom = default pass-through
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
              onValueChange={(e: CustomEvent<string>) => update("description", e.detail)}
            />

            {/* Existing entries */}
            {((d.entries as { key: string; value: string }[]) ?? []).map((entry, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="flex-1 flex gap-2 min-w-0">
                  <span
                    className="flex-1 px-2 py-1 rounded text-xs font-mono truncate"
                    style={{ background: "var(--modus-wc-color-base-200)", color: "#a78bfa" }}
                  >
                    {entry.key}
                  </span>
                  <span
                    className="flex-1 px-2 py-1 rounded text-xs font-mono truncate"
                    style={{ background: "var(--modus-wc-color-base-200)", color: "var(--modus-wc-color-base-content)" }}
                  >
                    {entry.value || "—"}
                  </span>
                </div>
                <ModusWcButton size="sm" variant="borderless" color="secondary" shape="square" onButtonClick={() => removeEntry(idx)}>
                  <ModusWcIcon name="close" size="sm" decorative />
                </ModusWcButton>
              </div>
            ))}

            {/* Add new entry */}
            <div className="flex flex-col gap-2 pt-1 border-t border-[var(--modus-wc-color-base-300)]">
              <p className="m-0 text-xs font-semibold text-[var(--modus-wc-color-base-content-low-contrast)]" style={{ fontFamily: "system-ui" }}>
                Add entry
              </p>
              <ModusWcTextInput
                label="Key"
                placeholder="e.g. projectBudget"
                value={newKey}
                onValueChange={(e: CustomEvent<string>) => setNewKey(e.detail)}
              />
              <ModusWcTextInput
                label="Value"
                placeholder="e.g. 500000"
                value={newVal}
                onValueChange={(e: CustomEvent<string>) => setNewVal(e.detail)}
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
              { label: "Manual (click to start)",  value: "manual" },
              { label: "Scheduled (cron)",          value: "scheduled" },
              { label: "On Event (data change)",    value: "event" },
            ])}
            onValueChange={(e: CustomEvent<string>) => update("triggerType", e.detail)}
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
              onValueChange={(e: CustomEvent<string>) => update("distribution", e.detail)}
            />
            <ModusWcTextInput
              label="Minimum"
              value={String(d.min ?? "")}
              onValueChange={(e: CustomEvent<string>) => update("min", Number(e.detail))}
            />
            {(d.distribution ?? "triangular") === "triangular" && (
              <ModusWcTextInput
                label="Most likely"
                value={String(d.mostLikely ?? "")}
                onValueChange={(e: CustomEvent<string>) => update("mostLikely", Number(e.detail))}
              />
            )}
            {(d.distribution ?? "triangular") === "normal" && (
              <ModusWcTextInput
                label="Mean"
                value={String(d.mostLikely ?? "")}
                onValueChange={(e: CustomEvent<string>) => update("mostLikely", Number(e.detail))}
              />
            )}
            <ModusWcTextInput
              label={(d.distribution ?? "triangular") === "normal" ? "Std dev" : "Maximum"}
              value={String(d.max ?? "")}
              onValueChange={(e: CustomEvent<string>) => update("max", Number(e.detail))}
            />
            <p className="m-0 text-xs text-[var(--modus-wc-color-base-content-low-contrast)]" style={{ fontFamily: "system-ui" }}>
              Single-shot runs use the most-likely value. Monte Carlo samples the full distribution.
            </p>
          </>
        )}

        {/* ── Loop ────────────────────────────────────────── */}
        {node.type === "loop" && (
          <ModusWcTextInput
            label="Max iterations"
            value={String(d.maxIterations ?? 10)}
            onValueChange={(e: CustomEvent<string>) => update("maxIterations", Number(e.detail))}
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
            onValueChange={(e: CustomEvent<string>) => update("chartType", e.detail)}
          />
        )}

      </div>
    </div>
  );
}
