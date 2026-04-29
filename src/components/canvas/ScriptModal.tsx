import React from "react";
import { createPortal } from "react-dom";
import { useCanvasStore } from "@/store/canvasStore";
import type { ToolCallRecord } from "@/types/agent";

export default function ScriptModal() {
  const { scriptModalNodeId, setScriptModal, nodes } = useCanvasStore();

  if (!scriptModalNodeId) return null;

  const node = nodes.find((n) => n.id === scriptModalNodeId);
  if (!node) return null;

  const d = node.data as Record<string, unknown>;
  const toolCalls = (d._toolCalls as ToolCallRecord[] | undefined) ?? [];
  const mainScript = d._script as string | undefined;
  const fullResult = d._result as string | undefined;
  const label = (d.label as string) || "AI Node";

  const visibleToolCalls = toolCalls.filter(
    (tc) => tc.script?.trim() && typeof tc.result !== "object"
  );
  const hasScripts = Boolean(mainScript || visibleToolCalls.length > 0);

  const close = () => setScriptModal(null);

  return createPortal(
    <div
      className="nf-script-modal-overlay"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={`Agent output for ${label}`}
    >
      <div
        className="nf-script-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="nf-script-modal__header">
          <div className="nf-script-modal__title-row">
            <i className="modus-icons" style={{ fontSize: 16, color: "var(--modus-wc-color-primary)" }}>
              {hasScripts ? "code" : "chat"}
            </i>
            <span className="nf-script-modal__title">
              {hasScripts ? `Scripts — ${label}` : `Agent Response — ${label}`}
            </span>
          </div>
          <button className="nf-script-modal__close" onClick={close} aria-label="Close">
            <i className="modus-icons" style={{ fontSize: 16 }}>close</i>
          </button>
        </div>

        {/* Body */}
        <div className="nf-script-modal__body">
          {/* Full agent response text — always shown when present */}
          {fullResult && (
            <div className="nf-script-modal__formula-chip" style={{ background: "var(--modus-wc-color-base-200)" }}>
              <span className="nf-script-modal__formula-label" style={{ color: "var(--modus-wc-color-base-content-low-contrast)" }}>
                Agent response
              </span>
              <p style={{
                margin: 0, fontSize: 12, lineHeight: 1.6,
                color: "var(--modus-wc-color-base-content)",
                fontFamily: "system-ui, sans-serif",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {fullResult}
              </p>
            </div>
          )}

          {/* Scripts section */}
          {hasScripts && (
            <>
              {mainScript && (
                <div className="nf-script-modal__formula-chip">
                  <span className="nf-script-modal__formula-label">Primary formula</span>
                  <pre className="nf-script-modal__code nf-script-modal__code--highlight">{mainScript}</pre>
                </div>
              )}

              {visibleToolCalls.map((tc, i) => (
                <div key={tc.id} className="nf-script-modal__card">
                  <div className="nf-script-modal__card-header">
                    <span className="nf-script-modal__step">Step {i + 1}</span>
                    {tc.description && (
                      <span className="nf-script-modal__desc">{tc.description}</span>
                    )}
                  </div>
                  <pre className="nf-script-modal__code">{tc.script}</pre>
                  <div className="nf-script-modal__result-row">
                    <span className="nf-script-modal__result-label">Result</span>
                    <code className="nf-script-modal__result-val">
                      {typeof tc.result === "object"
                        ? JSON.stringify(tc.result)
                        : String(tc.result ?? "—")}
                    </code>
                  </div>
                </div>
              ))}
            </>
          )}

          {!fullResult && !hasScripts && (
            <p className="nf-script-modal__empty">No output available for this node.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
