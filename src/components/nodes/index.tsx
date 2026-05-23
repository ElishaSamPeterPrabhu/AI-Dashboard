import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
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

/**
 * Shows text truncated to 1 line with ellipsis on the canvas node.
 * A small "⋯" button opens a portal dialog with the full text when the
 * content is long, multiline, or visually clamped by the node width.
 */
function ExpandableNodeText({
  title,
  text,
  variant = "default",
  expandThreshold = 30,
}: {
  title: string;
  text: string;
  variant?: "default" | "mono" | "result" | "aiSub";
  /** Character count above which the expand button is always shown. */
  expandThreshold?: number;
}) {
  const dlgTitleId = useId();
  const previewRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const trimmed = text.trim();

  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el || !trimmed) {
      setOverflowing(false);
      return undefined;
    }
    const measure = () => {
      setOverflowing(
        el.scrollHeight > el.clientHeight + 1 ||
          el.scrollWidth > el.clientWidth + 1
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [trimmed]);

  if (!trimmed) return null;

  const needsExpand =
    trimmed.includes("\n") ||
    trimmed.length > expandThreshold ||
    overflowing;

  return (
    <>
      <div className={`nf-expand-row nf-expand-row--${variant}`}>
        <div
          ref={previewRef}
          className={`nf-expand-preview nf-expand-preview--${variant}${
            !needsExpand ? " nf-expand-preview--dense" : ""
          }`}
          title={!needsExpand ? trimmed : undefined}
        >
          {trimmed}
        </div>
        {needsExpand && (
          <button
            type="button"
            className="nf-expand-more"
            onClick={(ev) => {
              ev.stopPropagation();
              ev.preventDefault();
              setOpen(true);
            }}
            aria-label={`View full ${title}`}
            title={`View full ${title}`}
          >
            &#8943;
          </button>
        )}
      </div>
      {open &&
        createPortal(
          <div
            className="nf-node-text-modal-overlay"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div className="nf-node-text-modal" role="dialog" aria-labelledby={dlgTitleId} aria-label={title}>
              <div className="nf-node-text-modal__head">
                <span id={dlgTitleId}>{title}</span>
                <button
                  type="button"
                  className="nf-node-text-modal__close"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  &#10005;
                </button>
              </div>
              <pre className="nf-node-text-modal__pre">{trimmed}</pre>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}


/** Execution result line — green chip when done, clamped when long */
function ExecResultChip({ data }: { data: Record<string, unknown> }) {
  const state = (data.executionState as ExecState) ?? "idle";
  // _result may be a number or object — always stringify before using as text
  const raw = data._result;
  const result = raw != null ? String(raw).trim() : "";
  if (state !== "done" || !result) return null;
  return (
    <div className="nf-result-slot">
      <ExpandableNodeText title="Execution result" text={result} variant="result" />
    </div>
  );
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
        <ExecResultChip data={d} />
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
        <Handle type="target" position={Position.Top} className="node-handle" />
        <Handle type="source" position={Position.Bottom} className="node-handle" />
        <div className="nf-node__icon-row">
          <span className="nf-node__type-badge nf-node__type-badge--blue">IN</span>
          <span className="nf-node__label">{d.label || "Input"}</span>
        </div>
        {d.value ? (
          <ExpandableNodeText title="Input value" text={String(d.value)} variant="mono" />
        ) : (
          <div className="nf-node__placeholder">No value set</div>
        )}
        <ExecResultChip data={d} />
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
        {d.formula &&
          (String(d.formula).length > 72 || String(d.formula).includes("\n") ? (
            <ExpandableNodeText title="Formula" text={String(d.formula)} variant="mono" />
          ) : (
            <div className="nf-node__mono">{d.formula}</div>
          ))}
        <ExecResultChip data={d} />
        <Handle type="source" position={Position.Bottom} className="node-handle" />
      </div>
    </div>
  );
}

// ─── Output / Result ─────────────────────────────────────────────
export function OutputNode({ data, selected }: NodeProps) {
  const d = data as { label?: string; value?: unknown; _result?: unknown } & Record<string, unknown>;
  const execState = (d.executionState as ExecState) ?? "idle";

  const resultStr = d._result != null && String(d._result).trim() !== "" ? String(d._result).trim() : "";
  const valStr = d.value != null && String(d.value).trim() !== "" ? String(d.value).trim() : "";

  // Single line: after run, executor sets both value and _result to the same string — show once.
  const displayText =
    execState === "done" && resultStr
      ? resultStr
      : resultStr || valStr;
  const variant: "default" | "result" = execState === "done" && resultStr ? "result" : "default";

  return (
    <div className={`relative ${execClass(d)}`}>
      <StatusBar data={d} />
      <div className="nf-node nf-node--output" style={{ ...ring(!!selected) }}>
        <Handle type="target" position={Position.Top} className="node-handle" />
        {/* Source handle allows output nodes to feed into a connector (multi-lane merge) */}
        <Handle type="source" position={Position.Bottom} className="node-handle" />
        <div className="nf-node__icon-row">
          <span className="nf-node__type-badge nf-node__type-badge--green">OUT</span>
          <span className="nf-node__label">{d.label || "Result"}</span>
        </div>
        {displayText ? (
          <ExpandableNodeText
            title={d.label?.trim() || "Output value"}
            text={displayText}
            variant={variant}
            expandThreshold={18}
          />
        ) : (
          <div className="nf-node__placeholder">Awaiting value</div>
        )}
      </div>
    </div>
  );
}

// ─── Chart ───────────────────────────────────────────────────────
const CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#a78bfa"];

/** Bar chart icon — SVG so it works inside React Flow (Modus ligature icons often fail on canvas). */
function ChartIconSvg() {
  return (
    <svg className="nf-chart-icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="1" y="7" width="3" height="6" rx="0.5" fill="currentColor" opacity={0.82} />
      <rect x="5.5" y="4" width="3" height="9" rx="0.5" fill="currentColor" />
      <rect x="10" y="6" width="3" height="7" rx="0.5" fill="currentColor" opacity={0.72} />
    </svg>
  );
}

function ChartVisualization({
  chartType,
  chartData,
  compact,
}: {
  chartType: string;
  chartData: Array<{ name: string; value: number }>;
  compact: boolean;
}) {
  const isPie = chartType === "pie";
  const h = compact ? 100 : 380;
  const nameMax = compact ? 8 : 24;
  const tickFmt = (v: string) =>
    v.length > nameMax ? `${v.slice(0, nameMax - 1)}…` : v;

  if (isPie) {
    return (
      <ResponsiveContainer width="100%" height={compact ? 118 : 340}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy={compact ? "48%" : "45%"}
            outerRadius={compact ? 38 : 118}
            label={false}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Legend
            wrapperStyle={{ fontSize: compact ? 9 : 11, lineHeight: "16px" }}
            formatter={(v: string) => tickFmt(v)}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, padding: "4px 8px" }}
            formatter={(v: number) => v.toLocaleString()}
          />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart
        data={chartData}
        margin={
          compact
            ? { top: 4, right: 4, left: -28, bottom: 0 }
            : { top: 12, right: 16, left: 8, bottom: 8 }
        }
      >
        <XAxis dataKey="name" tick={{ fontSize: compact ? 8 : 11 }} tickFormatter={tickFmt} interval={0} />
        <YAxis
          tick={{ fontSize: compact ? 8 : 11 }}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
        />
        <Tooltip
          contentStyle={{ fontSize: 11, padding: "4px 8px" }}
          formatter={(v: number) => v.toLocaleString()}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Chart node ──────────────────────────────────────────────────
export function ChartNode({ data, selected }: NodeProps) {
  const d = data as {
    label?: string;
    chartType?: string;
    _chartData?: Array<{ name: string; value: number }>;
  } & Record<string, unknown>;

  const dlgTitleId = useId();
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!modalOpen) return undefined;
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  const chartType = (d.chartType ?? "bar").toLowerCase();
  const chartData = (d._chartData as Array<{ name: string; value: number }> | undefined) ?? [];
  const hasData = chartData.length > 0;
  const execState = (d.executionState as ExecState) ?? "idle";
  const showChart = hasData && execState === "done";
  const modalTitle = `${d.label?.trim() || "Chart"} (${chartType})`;

  return (
    <div className={`relative ${execClass(d)}`}>
      <StatusBar data={d} />
      <div className="nf-node nf-node--chart" style={{ ...ring(!!selected), minWidth: 180 }}>
        <Handle type="target" position={Position.Top} className="node-handle" />
        <div className="nf-node__icon-row">
          <span className="nf-node__icon nf-node__icon--neutral" aria-hidden>
            <ChartIconSvg />
          </span>
          <span className="nf-node__label">{d.label || "Chart"}</span>
          {d.chartType && (
            <span className="nf-node__sub" style={{ marginLeft: "auto", textTransform: "capitalize" }}>
              {d.chartType}
            </span>
          )}
          {showChart && (
            <button
              type="button"
              className="nf-expand-more"
              onClick={(ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                setModalOpen(true);
              }}
              aria-label="View larger chart"
              title="View larger chart"
            >
              &#8943;
            </button>
          )}
        </div>

        {showChart ? (
          <div className="nf-chart-node__preview" style={{ width: "100%", marginTop: 6 }}>
            <ChartVisualization chartType={chartType} chartData={chartData} compact />
          </div>
        ) : (
          <div className="nf-node__placeholder">
            {execState === "running" ? "Rendering…" : "Run to visualise"}
          </div>
        )}

        <Handle type="source" position={Position.Bottom} className="node-handle" />
      </div>
      {modalOpen &&
        createPortal(
          <div
            className="nf-node-text-modal-overlay"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setModalOpen(false);
            }}
          >
            <div
              className="nf-node-text-modal nf-node-text-modal--chart"
              role="dialog"
              aria-labelledby={dlgTitleId}
              aria-label={modalTitle}
            >
              <div className="nf-node-text-modal__head">
                <span id={dlgTitleId}>{modalTitle}</span>
                <button
                  type="button"
                  className="nf-node-text-modal__close"
                  aria-label="Close"
                  onClick={() => setModalOpen(false)}
                >
                  &#10005;
                </button>
              </div>
              <div className="nf-node-text-modal__chart-body">
                <ChartVisualization chartType={chartType} chartData={chartData} compact={false} />
              </div>
            </div>
          </div>,
          document.body
        )}
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
    <div style={{ position: "relative", width: "100%", minWidth: 0, maxWidth: "100%" }} className={execClass(d)}>
      <StatusBar data={d} />
      <Handle type="target" position={Position.Top} className="node-handle" />
      <div
        className="ai-ux-gradient-frame"
        style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", minWidth: 0, ...ring(!!selected) }}
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
            {d.agentName ? (
              <>
                <span className="nf-ai__agent-dot" />
                <span className="nf-ai__agent-name">{d.agentName}</span>
              </>
            ) : (
              <ExpandableNodeText
                title="AI instructions"
                text={d.description?.trim() || "Click to configure"}
                variant="aiSub"
              />
            )}
          </div>
          <ExecResultChip data={d} />
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
          <ExecResultChip data={d} />
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
      <ExecResultChip data={d} />
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
        <Handle type="target" position={Position.Top} className="node-handle" />
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
        <ExecResultChip data={d} />
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
        <ExecResultChip data={d} />
      </div>
      <Handle type="source" position={Position.Bottom} className="node-handle" />
    </div>
  );
}
