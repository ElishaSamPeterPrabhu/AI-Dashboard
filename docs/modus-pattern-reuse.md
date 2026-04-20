# Modus Pattern Reuse Map

This document maps every major AI Dashboard surface to a specific Modus AI pattern or component from the `modus-blueprint` codebase. The goal is zero custom AI UX design — assemble from catalog.

---

## Source Locations

- AI Patterns catalog: `/Users/eprabhu/Desktop/Projects/modus-blueprint/src/components/patterns/AIPatterns.ts`
- AI UX Patterns catalog: `/Users/eprabhu/Desktop/Projects/modus-blueprint/src/components/patterns/AIUxPatterns.ts`
- Pattern content (detailed specs): `/Users/eprabhu/Desktop/Projects/modus-blueprint/src/components/pattern-content/`
- Reusable components:
  - `ModusAssistant.tsx` — full Trimble Assist iframe embed with TID auth
  - `AiUxFollowUpChipRow.tsx` — follow-up action chips
  - `AiUxGradientFrame` (in `AiUxSpecCard.tsx`) — AI gradient border
  - `AiUxPatternPreviews.tsx` — canvas preview components for all AI UX atoms

---

## Surface → Pattern Map

### Empty Canvas / New Workflow

| Element | Modus Pattern | Notes |
|---|---|---|
| Large prompt input | `ai-ux-initial-cta` (Prompt Initial CTA) | "What would you like to plan?" open-ended text area |
| Template suggestions below CTA | `ai-ux-suggestion` (Suggestion) | "Plan a feature", "Estimate a project", "Construction schedule" chips |
| First-time nudge to try AI | `ai-ux-nudge` (Nudge) | Appears once if canvas is empty after 30s |

---

### AI Node — Body

| Element | Modus Pattern | Implementation |
|---|---|---|
| Gradient border indicating AI nature | `AiUxGradientFrame` (CSS class from `AiUxGradientFrame.css`) | Applied as a wrapper div around the React Flow node |
| AI label / disclosure | `ai-ux-disclosure` (Disclosure) | Small "AI" badge in top-left corner of every AI node |
| Status badge | `ai-loading-processing` (AI Loading & Processing) | Shimmer / spinner from Modus `ModusWcLoader` during provisioning and running states |
| Confidence range bar on outputs | `ai-confidence-indicators` (AI Confidence Indicators) | Modus badge color + horizontal bar for P10–P90 range |
| Bound-agent chip | `ai-ux-disclosure` (Disclosure) | Agent name + avatar chip; click → deep link to Agent Studio |

---

### AI Node — Running State

| Element | Modus Pattern | Implementation |
|---|---|---|
| Pulsing halo | `ai-loading-processing` | CSS animation on node border while `status === "running"` |
| Token / latency meter | `ai-loading-processing` | Mini counter below the agent chip; values from AG UI metadata events |
| Tool-call ticker | `ai-ux-inline-action` (Inline Action) | Chips showing each tool name called; clicking highlights the edge |
| Follow-up chip row after run | `AiUxFollowUpChipRow` | "Explain this", "Re-run with different inputs", "Add to report" chips |

---

### AI Node — Expandable Trace

| Element | Modus Pattern | Implementation |
|---|---|---|
| Reasoning trace accordion | `ai-explanation-interfaces` (AI Explanation Interfaces) | `ModusWcAccordion` showing full AG UI event log |
| Source citations (RAG nodes) | `ai-ux-sources` (Sources) | Citations from `search_knowledge_base` tool results |
| References list | `ai-ux-references` (References) | KB chunks that matched the query |

---

### AI Node — Config Panel

| Element | Modus Pattern | Implementation |
|---|---|---|
| Description textarea | `ai-ux-prompt` (Prompt) | Open-ended input with AI magic wand icon (triggers re-provisioning on save) |
| Parameter constraints | `ai-ux-parameters` (Parameters) | Named fields for quota limits, timeout, output schema constraints |
| Source/KB attachment | `ai-ux-sources` (Sources) | Picker for Knowledge Library connections |
| Model selector | `ai-model-selection` (AI Model Selection) | Dropdown matching Studio's model picker UX |
| Agent binding selector | `ai-ux-references` (References) | "Bind existing agent" list with autocomplete search |
| Quota usage sparkline | `ai-confidence-indicators` | Recharts sparkline showing token/run usage vs limits |

---

### Node Palette

| Element | Modus Pattern | Implementation |
|---|---|---|
| "Trimble Built-Ins" group header | `ai-ux-disclosure` (Disclosure) | Section labeled "Trimble AI Built-in Tools" |
| Draggable built-in tool chips | `ai-ux-inline-action` (Inline Action) | Drag onto an AI node to enable the built-in |
| Suggested nodes based on workflow content | `ai-smart-suggestions` (AI Smart Suggestions) | After adding certain nodes, suggest complementary ones |

---

### Execute Mode — Pre-Run

| Element | Modus Pattern | Implementation |
|---|---|---|
| Data consent modal (first run with real MCP) | `ai-data-consent` (AI Data Consent) | `ModusWcModal` listing what data will be sent where |
| Disclaimer in footer | `ai-ux-disclaimer` (Disclaimer) | "AI results may contain errors. Verify critical estimates." |
| Safety check for destructive actions | `ai-safety-controls` (AI Safety Controls) | Confirm modal before any hard-delete or external write |

---

### Execute Mode — During Run

| Element | Modus Pattern | Implementation |
|---|---|---|
| Node loading state | `ai-loading-processing` | `ModusWcLoader` inline in node + pulse animation |
| AI-generated content streaming into node | `ai-content-generation` (AI Content Generation) | Text streams in character-by-character from AG UI events |
| Workflow branch routing indicator | `ai-workflow-automation` (AI Workflow Automation) | Animated edge activation showing which branches are active |
| Human-in-the-loop pause point | `ai-human-handoff` (AI-Human Handoff) | If a node is flagged as requiring review, pauses and prompts user |

---

### Execute Mode — After Run

| Element | Modus Pattern | Implementation |
|---|---|---|
| Result summary on node | `ai-ux-summary` (Summary) | Key points list below the output value |
| Follow-up action chips | `AiUxFollowUpChipRow` | "Explain this", "Re-run", "Compare scenarios" |
| Error recovery | `ai-error-handling` (AI Error Handling) | Modus alert with retry option and error description |
| Scenario comparison | `ai-recommendation-systems` (AI Recommendation Systems) | Side-by-side table with winner highlighted per metric |

---

### Chatbot Panel

| Element | Modus Pattern | Implementation |
|---|---|---|
| Launcher button | `ai-ux-floating-agent-chat` (Floating Agent Chat) | FAB in bottom-right; same pattern as modus-blueprint's `ModusAssistant` launcher |
| Chat panel | `ai-chat-interface` (AI Chat Interface) | Full `ModusAssistant.tsx` component from modus-blueprint |
| Suggested prompts | `ai-ux-suggestion` (Suggestion) | Conversation starters rendered as chips |
| Follow-up after agent reply | `AiUxFollowUpChipRow` | `AI_UX_DEFAULT_PRIMARY_CHIPS` from `AiUxFollowUpChipRow.tsx` |
| Diff overlay on canvas | `ai-collaborative-editing` (AI Collaborative Editing) | Accept/reject badges on pending nodes/edges |
| Accept/reject buttons | `ai-human-handoff` (AI-Human Handoff) | [Accept all] [Reject all] bar |

---

### Adaptive / Personalization

| Element | Modus Pattern | Implementation |
|---|---|---|
| Recently used node types surfaced first in palette | `ai-personalization` (AI Personalization) | Sorted by usage frequency per user (localStorage) |
| Suggested next node after connecting | `ai-predictive-input` (AI Predictive Input) | Inline suggestion: "Add a Chart node to visualize this output?" |
| Training feedback on AI node results | `ai-training-feedback` (AI Training Feedback) | Thumbs up/down on node results; feeds back to agent memory (future) |

---

## Components Lifted Directly

These components are copied (not reimported from modus-blueprint) into the AI Dashboard codebase to avoid a cross-project dependency:

| Component | Source file | Used in |
|---|---|---|
| `ModusAssistant` | `modus-assistant/ModusAssistant.tsx` + `ModusAssistant.css` | Chatbot panel |
| `AiUxFollowUpChipRow` | `pattern-previews/ai-ux/AiUxFollowUpChipRow.tsx` | Post-run follow-up chips on AI nodes and chatbot |
| `AiUxGradientFrame` CSS | `pattern-previews/ai-ux/AiUxGradientFrame.css` | AI node border |
| `AiUxSpecCard` | `pattern-previews/ai-ux/AiUxSpecCard.tsx` | AI node config panel spec card |

Update strategy: when modus-blueprint ships changes to these components, copy the updated source into AI Dashboard. Pin the modus-blueprint commit hash in `docs/open-questions.md` for tracking.
