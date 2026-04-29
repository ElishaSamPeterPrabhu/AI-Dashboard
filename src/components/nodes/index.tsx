import React from "react";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import type { ExecState } from "@/store/canvasStore";

// ─── Node width — set on the RF node object so the wrapper matches ───
export const NODE_W = 160;

/** Map used by CanvasPage to stamp width (and height for resizable) onto every new node */
export const NODE_DIMENSIONS: Record<string, { width: number; height?: number }> = {
  sticky:     { width: NODE_W },
  process:    { width: NODE_W },
  input:      { width: NODE_W },
  calculator: { width: NODE_W },
  output:     { width: NODE_W },
  ai:         { width: NODE_W },
  chart:      { width: NODE_W },
  decision:   { width: 110, height: 110 },
  database:   { width: NODE_W },
  trigger:    { width: NODE_W },
  group:      { width: 300, height: 200 },
  assumption: { width: NODE_W },
  loop:       { width: 350, height: 250 },
  connector:  { width: NODE_W },
};

/** No visual selection ring — selection is handled purely by the config panel opening */
function ring(_selected: boolean): React.CSSProperties {
  return {};
}

/** CSS class added to the node root based on execution state */
function execClass(data: Record<string, unknown>) {
  const s = (data.executionState as ExecState) ?? "idle";
  return s === "idle" ? "" : `nf-state-${s}`;
}

/** Small bar rendered ABOVE the node: duration + state dot */
function StatusBar({ data }: { data: Record<string, unknown> }) {
  const duration = data.estimatedDuration as number | undefined;
  const state = (data.executionState as ExecState) ?? "idle";

  const hasMeta = duration != null && duration > 0;
  const hasState = state !== "idle";
  if (!hasMeta && !hasState) return null;

  return (
    <div className="nf-status-bar">
      {duration != null && duration > 0 && (
        <span className="nf-duration">⏱{duration}s</span>
      )}
      {state === "queued"  && <span className="nf-exec-badge nf-exec-badge--queued">•</span>}
      {state === "running" && <span className="nf-exec-badge nf-exec-badge--running">▶</span>}
      {state === "done"    && <span className="nf-exec-badge nf-exec-badge--done">✓</span>}
    </div>
  );
}

/** Result line shown at the bottom of a node once execution finishes */
function ResultLine({ data }: { data: Record<string, unknown> }) {
  const state = (data.executionState as ExecState) ?? "idle";
  const result = data._result as string | undefined;
  if (state !== "done" || !result) return null;
  return <div className="nf-result" title={result}>{result}</div>;
}

// ─── Sticky / Note ───────────────────────────────────────────────
const STICKY_COLORS: Record<string, { bg: string; border: string }> = {
  yellow: { bg: "#fef9c3", border: "#fde047" },
  blue:   { bg: "#dbeafe", border: "#93c5fd" },
  pink:   { bg: "#fce7f3", border: "#f9a8d4" },
  green:  { bg: "#dcfce7", border: "#86efac" },
  purple: { bg: "#ede9fe", border: "#c4b5fd" },
};

export function StickyNode({ data, selected }: NodeProps) {
  const d = data as { text?: string; color?: string };
  const c = STICKY_COLORS[d.color ?? "yellow"] ?? STICKY_COLORS.yellow;
  return (
    <div className={`relative ${execClass(d as Record<string,unknown>)}`}>
      <StatusBar data={d as Record<string,unknown>} />
      <div
        style={{
          width: "100%",
          minHeight: 56,
          background: c.bg,
          border: `1.5px solid ${c.border}`,
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 12,
          color: "#1e293b",
          lineHeight: 1.45,
          boxSizing: "border-box",
          ...ring(!!selected),
        }}
      >
        {d.text || <em style={{ opacity: 0.45 }}>Note…</em>}
      </div>
    </div>
  );
}

// ─── Process ─────────────────────────────────────────────────────
export function ProcessNode({ data, selected }: NodeProps) {
  const d = data as { label?: string; description?: string } & Record<string,unknown>;
  return (
    <div className={`relative ${execClass(d)}`}>
      <StatusBar data={d} />
      <div className="nf-node" style={{ ...ring(!!selected) }}>
        <Handle type="target" position={Position.Top} className="node-handle" />
        <div className="nf-node__icon-row">
          <span className="nf-node__icon nf-node__icon--neutral">
            <i className="modus-icons modus-wc-icon--sm" aria-hidden>settings</i>
          </span>
          <span className="nf-node__label">{d.label || "Process"}</span>
        </div>
        {d.description && <div className="nf-node__sub">{d.description}</div>}
        <ResultLine data={d} />
        <Handle type="source" position={Position.Bottom} className="node-handle" />
      </div>
    </div>
  );
}

// ─── Input ───────────────────────────────────────────────────────
export function InputNode({ data, selected }: NodeProps) {
  const d = data as { label?: string; value?: string } & Record<string,unknown>;
  return (
    <div className={`relative ${execClass(d)}`}>
      <StatusBar data={d} />
      <div className="nf-node nf-node--input" style={{ ...ring(!!selected) }}>
        <Handle type="source" position={Position.Bottom} className="node-handle" />
        <div className="nf-node__icon-row">
          <span className="nf-node__type-badge nf-node__type-badge--blue">IN</span>
          <span className="nf-node__label">{d.label || "Input"}</span>
        </div>
        {d.value ? (
          <div className="nf-node__value">{d.value}</div>
        ) : (
          <div className="nf-node__placeholder">No value set</div>
        )}
        <ResultLine data={d} />
      </div>
    </div>
  );
}

// ─── Calculator ──────────────────────────────────────────────────
export function CalculatorNode({ data, selected }: NodeProps) {
  const d = data as { label?: string; formula?: string } & Record<string,unknown>;
  return (
    <div className={`relative ${execClass(d)}`}>
      <StatusBar data={d} />
      <div className="nf-node" style={{ ...ring(!!selected) }}>
        <Handle type="target" position={Position.Top} className="node-handle" />
        <div className="nf-node__icon-row">
          <span className="nf-node__icon nf-node__icon--amber" aria-hidden>
            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>fx</span>
          </span>
          <span className="nf-node__label">{d.label || "Calculator"}</span>
        </div>
        {d.formula && <div className="nf-node__mono">{d.formula}</div>}
        <ResultLine data={d} />
        <Handle type="source" position={Position.Bottom} className="node-handle" />
      </div>
    </div>
  );
}

// ─── Output / Result ─────────────────────────────────────────────
export function OutputNode({ data, selected }: NodeProps) {
  const d = data as { label?: string; value?: unknown } & Record<string,unknown>;
  const val = d.value != null ? String(d.value) : null;
  return (
    <div className={`relative ${execClass(d)}`}>
      <StatusBar data={d} />
      <div className="nf-node nf-node--output" style={{ ...ring(!!selected) }}>
        <Handle type="target" position={Position.Top} className="node-handle" />
        <div className="nf-node__icon-row">
          <span className="nf-node__type-badge nf-node__type-badge--green">OUT</span>
          <span className="nf-node__label">{d.label || "Result"}</span>
        </div>
        {val ? (
          <div className="nf-node__value nf-node__value--large">{val}</div>
        ) : (
          <div className="nf-node__placeholder">Awaiting value</div>
        )}
        <ResultLine data={d} />
      </div>
    </div>
  );
}

// ─── Chart ───────────────────────────────────────────────────────
export function ChartNode({ data, selected }: NodeProps) {
  const d = data as { label?: string; chartType?: string } & Record<string,unknown>;
  return (
    <div className={`relative ${execClass(d)}`}>
      <StatusBar data={d} />
      <div className="nf-node" style={{ ...ring(!!selected) }}>
        <Handle type="target" position={Position.Top} className="node-handle" />
        <div className="nf-node__icon-row">
          <span className="nf-node__icon nf-node__icon--neutral">
            <i className="modus-icons modus-wc-icon--sm" aria-hidden>bar_chart</i>
          </span>
          <span className="nf-node__label">{d.label || "Chart"}</span>
          {d.chartType && (
            <span className="nf-node__sub" style={{ marginLeft: "auto" }}>{d.chartType}</span>
          )}
        </div>
        <ResultLine data={d} />
      </div>
    </div>
  );
}

// ─── AI Node ─────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  idle:         "#6b7280",
  provisioning: "#3b82f6",
  ready:        "#22c55e",
  running:      "#6366f1",
  done:         "#22c55e",
  error:        "#ef4444",
};

export function AiNode({ data, selected, id }: NodeProps) {
  const d = data as {
    label?: string;
    description?: string;
    agentName?: string;
    status?: string;
    _toolCalls?: unknown[];
    _script?: string;
    _result?: string;
  } & Record<string,unknown>;
  const status = d.status ?? "idle";
  const dot = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  // Show (i) whenever there's any result — tool calls, script, or plain text response
  const hasScript = Boolean(d._toolCalls?.length || d._script || d._result);

  // Access setScriptModal lazily to avoid circular import issues
  const handleInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Dynamic import keeps nodes/index.tsx free of a direct store dependency
    import("@/store/canvasStore").then(({ useCanvasStore }) => {
      useCanvasStore.getState().setScriptModal(id);
    });
  };

  return (
    <div style={{ position: "relative", width: "100%" }} className={execClass(d)}>
      <StatusBar data={d} />
      <Handle type="target" position={Position.Top} className="node-handle" />
      <div
        className="ai-ux-gradient-frame"
        style={{ width: "100%", boxSizing: "border-box", ...ring(!!selected) }}
      >
        <div className="ai-ux-gradient-frame__glow" aria-hidden />
        <div className="ai-ux-gradient-frame__inner nf-ai">
          <div className="nf-ai__header">
            <span className="nf-ai__mark" aria-hidden>
              <i className="modus-icons modus-wc-icon--sm" style={{ color: "#fff", fontSize: 12 }}>ai_stars</i>
            </span>
            <span className="nf-node__label" style={{ flex: 1 }}>{d.label || "AI Node"}</span>
            {hasScript && (
              <button
                className="nf-ai__info-btn"
                onClick={handleInfoClick}
                title="View scripts & tool calls"
                aria-label="View scripts"
              >
                <i className="modus-icons" style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>info</i>
              </button>
            )}
            <span className="nf-ai__dot" style={{ background: dot }} title={status} />
          </div>
          <div className="nf-ai__sub">
            {d.agentName
              ? <><span className="nf-ai__agent-dot" />{d.agentName}</>
              : (d.description || "Click to configure")}
          </div>
          <ResultLine data={d} />
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="node-handle" />
    </div>
  );
}

// ─── Decision — diamond ───────────────────────────────────────────
export function DecisionNode({ data, selected }: NodeProps) {
  const d = data as { label?: string; trueLabel?: string; falseLabel?: string } & Record<string,unknown>;
  return (
    <div className={`nf-decision-wrapper ${execClass(d)}`} style={{ ...ring(!!selected) }}>
      <StatusBar data={d} />
      <Handle type="target" position={Position.Top} className="node-handle" />
      <Handle type="source" position={Position.Right} id="true" className="node-handle" />
      <Handle type="source" position={Position.Bottom} id="default" className="node-handle" />
      <Handle type="source" position={Position.Left} id="false" className="node-handle" />
      <div className="nf-decision">
        <div className="nf-decision__content">
          <span className="nf-decision__label">{d.label || "Decision"}</span>
          {(d.trueLabel || d.falseLabel) && (
            <span className="nf-decision__sub">
              {d.trueLabel || "True"} / {d.falseLabel || "False"}
            </span>
          )}
          {(d.executionState as string) === "done" && d._result && (
            <span className="nf-decision__sub" style={{ color: "#4ade80", fontSize: 8 }}>
              {String(d._result)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Database / Store — cylinder ─────────────────────────────────
export function DatabaseNode({ data, selected }: NodeProps) {
  const d = data as {
    label?: string;
    entries?: { key: string; value: string }[];
    description?: string;
  } & Record<string,unknown>;
  const entries = d.entries ?? [];
  return (
    <div style={{ position: "relative", width: "100%" }} className={execClass(d)}>
      <StatusBar data={d} />
      <Handle type="target" position={Position.Top} className="node-handle" />
      <div className="nf-db" style={{ ...ring(!!selected) }}>
        <div className="nf-db__cap nf-db__cap--top" />
        <div className="nf-db__body">
          <div className="nf-node__icon-row">
            <span className="nf-db__badge">DB</span>
            <span className="nf-db__label">{d.label || "Data Store"}</span>
          </div>
          {entries.length > 0 ? (
            entries.slice(0, 3).map((e, i) => (
              <div key={i} className="nf-db__entry">
                <span style={{ color: "#a78bfa" }}>{e.key}</span>: {e.value || <em style={{ opacity: 0.4 }}>—</em>}
              </div>
            ))
          ) : (
            <div className="nf-db__placeholder">{d.description || "No data entries"}</div>
          )}
          {entries.length > 3 && (
            <div className="nf-db__placeholder">+{entries.length - 3} more…</div>
          )}
          <ResultLine data={d} />
        </div>
        <div className="nf-db__cap nf-db__cap--bottom" />
      </div>
      <Handle type="source" position={Position.Bottom} className="node-handle" />
    </div>
  );
}

// ─── Trigger — pill ───────────────────────────────────────────────
const TRIGGER_ICONS: Record<string, string> = {
  manual:    "play_circle",
  scheduled: "timer",
  event:     "bolt",
};
const TRIGGER_LABELS: Record<string, string> = {
  manual:    "Manual",
  scheduled: "Scheduled",
  event:     "On Event",
};

export function TriggerNode({ data, selected }: NodeProps) {
  const d = data as { label?: string; triggerType?: string } & Record<string,unknown>;
  const type = d.triggerType ?? "manual";
  const icon = TRIGGER_ICONS[type] ?? TRIGGER_ICONS.manual;
  const sub = TRIGGER_LABELS[type] ?? "Manual";

  return (
    <div style={{ position: "relative", width: "100%" }} className={execClass(d)}>
      <StatusBar data={d} />
      <div className="nf-trigger" style={{ ...ring(!!selected) }}>
        <span className="nf-trigger__icon">
          <i className="modus-icons" style={{ fontSize: 12 }}>{icon}</i>
        </span>
        <div className="nf-trigger__text">
          <span className="nf-trigger__label">{d.label || "Trigger"}</span>
          <span className="nf-trigger__sub">{sub}</span>
        </div>
      </div>
      <ResultLine data={d} />
      <Handle type="source" position={Position.Bottom} className="node-handle" />
    </div>
  );
}

// ─── Group / Frame — resizable container ─────────────────────────
export function GroupNode({ data, selected }: NodeProps) {
  const d = data as { label?: string };
  return (
    <div className="nf-group">
      <NodeResizer
        minWidth={160}
        minHeight={120}
        isVisible={!!selected}
        lineStyle={{ borderColor: "var(--modus-wc-color-primary)" }}
        handleStyle={{ borderColor: "var(--modus-wc-color-primary)", background: "var(--modus-wc-color-base-page)" }}
      />
      <span className="nf-group__label">{d.label || "Frame"}</span>
    </div>
  );
}

// ─── Assumption — distribution input variant ──────────────────────
export function AssumptionNode({ data, selected }: NodeProps) {
  const d = data as {
    label?: string;
    distribution?: string;
    min?: number;
    max?: number;
    mostLikely?: number;
  } & Record<string,unknown>;
  const dist = d.distribution ?? "triangular";
  const hasRange = d.min != null && d.max != null;

  return (
    <div className={`relative ${execClass(d)}`}>
      <StatusBar data={d} />
      <div className="nf-node nf-node--assumption" style={{ ...ring(!!selected) }}>
        <Handle type="source" position={Position.Bottom} className="node-handle" />
        <div className="nf-node__icon-row">
          <span className="nf-node__type-badge nf-node__type-badge--purple">~</span>
          <span className="nf-node__label">{d.label || "Assumption"}</span>
        </div>
        {hasRange ? (
          <div className="nf-assumption__range">
            {d.min} → {d.mostLikely != null ? `${d.mostLikely}` : "?"} → {d.max}
          </div>
        ) : (
          <div className="nf-node__placeholder">Set min / max</div>
        )}
        <div className="nf-assumption__dist">{dist}</div>
        <ResultLine data={d} />
      </div>
    </div>
  );
}

// ─── Loop — resizable iterator container ─────────────────────────
export function LoopNode({ data, selected }: NodeProps) {
  const d = data as { label?: string; maxIterations?: number };
  return (
    <div className="nf-loop">
      <NodeResizer
        minWidth={200}
        minHeight={150}
        isVisible={!!selected}
        lineStyle={{ borderColor: "#60a5fa" }}
        handleStyle={{ borderColor: "#60a5fa", background: "var(--modus-wc-color-base-page)" }}
      />
      <Handle type="target" position={Position.Top} className="node-handle" />
      <div className="nf-loop__header">
        <i className="modus-icons" style={{ fontSize: 12, color: "#60a5fa" }}>refresh</i>
        <span className="nf-loop__label">{d.label || "Loop"}</span>
        <span className="nf-loop__badge">× {d.maxIterations ?? 10}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="node-handle" />
    </div>
  );
}

// ─── Connector — cross-workflow section bridge ───────────────────────────
export function ConnectorNode({ data, selected }: NodeProps) {
  const d = data as {
    label?: string;
    description?: string;
    agentId?: string;
    sectionName?: string;
  } & Record<string, unknown>;
  const hasAi = Boolean((d.agentId as string)?.trim());

  return (
    <div style={{ position: "relative", width: "100%" }} className={execClass(d)}>
      <StatusBar data={d} />
      <Handle type="target" position={Position.Top} className="node-handle" />
      <div className={`nf-connector ${hasAi ? "nf-connector--ai" : ""}`} style={{ ...ring(!!selected) }}>
        <div className="nf-connector__header">
          <span className="nf-connector__icon">
            <i className="modus-icons" style={{ fontSize: 13 }}>
              {hasAi ? "ai_stars" : "arrow_forward"}
            </i>
          </span>
          <span className="nf-connector__label">{d.label || "Connector"}</span>
          {hasAi && <span className="nf-connector__ai-badge">AI</span>}
        </div>
        {d.sectionName && (
          <div className="nf-connector__target">
            <i className="modus-icons" style={{ fontSize: 10, opacity: 0.6 }}>arrow_forward</i>
            <span className="nf-connector__target-name">{d.sectionName as string}</span>
          </div>
        )}
        {d.description && (
          <div className="nf-connector__desc">{d.description as string}</div>
        )}
        <ResultLine data={d} />
      </div>
      <Handle type="source" position={Position.Bottom} className="node-handle" />
    </div>
  );
}
