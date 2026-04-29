import React from "react";
import { ModusWcIcon } from "@trimble-oss/moduswebcomponents-react";

interface PaletteItem {
  type: string;
  label: string;
  icon: string;
  description: string;
  accent?: string; // optional accent color for icon bg
  isAI?: boolean;
  isSpecial?: boolean; // diamond, cylinder etc — custom icon rendering
  specialIcon?: React.ReactNode;
}

const GROUPS: { title: string; items: PaletteItem[] }[] = [
  {
    title: "Canvas",
    items: [
      { type: "sticky", label: "Sticky", icon: "comment", description: "Free-form note" },
      { type: "group",  label: "Frame",  icon: "crop_square",   description: "Container / group nodes" },
    ],
  },
  {
    title: "Flow",
    items: [
      {
        type: "trigger", label: "Trigger", icon: "play_circle",
        description: "Workflow entry point", accent: "#06b6d422",
      },
      { type: "process",  label: "Process",  icon: "settings",     description: "Named workflow step" },
      {
        type: "decision", label: "Decision", icon: "flowchart",
        description: "Branch / condition", accent: "#f59e0b22",
        isSpecial: true,
        specialIcon: (
          <span style={{
            display: "inline-block",
            width: 14, height: 14,
            transform: "rotate(45deg)",
            border: "1.5px solid #f59e0b",
            borderRadius: 2,
            flexShrink: 0,
          }} aria-hidden />
        ),
      },
      { type: "loop", label: "Loop", icon: "refresh", description: "Repeat child nodes", accent: "#3b82f622" },
    ],
  },
  {
    title: "Input",
    items: [
      { type: "input",      label: "Input",      icon: "text_input", description: "Typed value (run context)" },
      {
        type: "assumption", label: "Assumption", icon: "tune",
        description: "Probability distribution for simulation", accent: "#a855f722",
      },
      {
        type: "database",   label: "Database",  icon: "server_round",
        description: "Data store / key-value context", accent: "#8b5cf622",
        isSpecial: true,
        specialIcon: (
          <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, flexShrink: 0 }}>
            <span style={{ width: 14, height: 4, borderRadius: "50%", border: "1.5px solid #8b5cf6", background: "#1e1b33" }} />
            <span style={{ width: 14, height: 6, borderLeft: "1.5px solid #8b5cf6", borderRight: "1.5px solid #8b5cf6", background: "transparent" }} />
            <span style={{ width: 14, height: 4, borderRadius: "50%", border: "1.5px solid #8b5cf6", background: "#1a1728" }} />
          </span>
        ),
      },
      { type: "calculator", label: "Calculator", icon: "calculate",  description: "Deterministic formula (no LLM)" },
    ],
  },
  {
    title: "AI",
    items: [
      { type: "ai", label: "AI Node", icon: "ai_stars", description: "Backed by a Trimble Agent", isAI: true },
    ],
  },
  {
    title: "Output",
    items: [
      { type: "output", label: "Result", icon: "check_circle", description: "Displays a result value" },
      { type: "chart",  label: "Chart",  icon: "bar_graph",    description: "Inline chart" },
    ],
  },
  {
    title: "Connect",
    items: [
      {
        type: "connector", label: "Connector", icon: "arrow_forward",
        description: "Pass data to another section", accent: "#0891b222",
      },
    ],
  },
];

interface NodePaletteProps {
  onDragStart: (e: React.DragEvent, nodeType: string) => void;
}

export default function NodePalette({ onDragStart }: NodePaletteProps) {
  return (
    <div className="flex flex-col gap-2.5 pt-1.5 pb-3 px-2 overflow-y-auto h-full">
      {GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-0.5">
          <p
            className="m-0 px-1 mb-1 text-[10px] font-semibold tracking-widest uppercase"
            style={{ color: "var(--modus-wc-color-base-content-low-contrast)", fontFamily: "system-ui" }}
          >
            {group.title}
          </p>

          {group.items.map((item) => (
            <div
              key={item.type}
              draggable
              title={item.description}
              onDragStart={(e) => onDragStart(e, item.type)}
              className="flex items-center gap-2 px-1.5 py-1 rounded-md cursor-grab active:cursor-grabbing select-none"
              style={{ transition: "background 120ms" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--modus-wc-color-base-200)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              {/* Icon area */}
              <span
                className="flex-shrink-0 flex items-center justify-center rounded"
                style={{
                  width: 20, height: 20,
                  background: item.isAI
                    ? "conic-gradient(from 200deg, #00d7c0 0deg, #1f78ff 112deg, #4a00ff 168deg, #b018b4 252deg, #ff2092 300deg, #00d7c0 360deg)"
                    : (item.accent ?? "var(--modus-wc-color-base-200)"),
                }}
              >
                {item.isAI ? (
                  <i className="modus-icons" style={{ color: "#fff", fontSize: 11 }}>ai_stars</i>
                ) : item.isSpecial && item.specialIcon ? (
                  item.specialIcon
                ) : (
                  <ModusWcIcon
                    name={item.icon}
                    size="sm"
                    decorative
                    customClass="text-[var(--modus-wc-color-base-content)]"
                  />
                )}
              </span>

              {/* Label */}
              <span style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--modus-wc-color-base-content)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "system-ui, sans-serif",
              }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
