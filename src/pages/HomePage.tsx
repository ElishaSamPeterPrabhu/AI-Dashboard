import { useNavigate } from "react-router-dom";
import {
  ModusWcTypography,
  ModusWcButton,
  ModusWcCard,
  ModusWcIcon,
  ModusWcBadge,
} from "@trimble-oss/moduswebcomponents-react";
import { useAppStore } from "@/store/appStore";

export default function HomePage() {
  const navigate = useNavigate();
  const { projects, addProject, addWorkflow } = useAppStore();

  const handleQuickStart = (prompt: string) => {
    const p = addProject("My Project");
    const wf = addWorkflow(p.id, prompt);
    if (wf) navigate(`/projects/${p.id}/workflows/${wf.id}`);
  };

  const STARTER_PROMPTS = [
    { label: "Plan a feature cost estimation workflow", icon: "calculate" },
    { label: "Build a construction schedule risk simulation", icon: "calendar_today" },
    { label: "Create a capacity planning workflow", icon: "people" },
    { label: "Set up a build-vs-buy decision workflow", icon: "balance" },
  ];

  const totalWorkflows = projects.reduce((n, p) => n + p.workflows.length, 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[var(--modus-wc-color-base-page)]">
      <div className="max-w-4xl mx-auto w-full px-6 py-10 flex flex-col gap-10">

        {/* ── Hero CTA ────────────────────────────────── */}
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="ai-ux-gradient-frame inline-block">
            <div className="ai-ux-gradient-frame__glow" aria-hidden />
            <div className="ai-ux-gradient-frame__inner px-8 py-6 flex flex-col items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="ai-ux-agent-mark-static" aria-hidden>
                  <ModusWcIcon name="ai_stars" size="md" decorative customClass="text-white" />
                </div>
                <ModusWcTypography
                  hierarchy="h4"
                  size="xl"
                  weight="bold"
                  label="AI Dashboard"
                  customClass="m-0 text-[var(--modus-wc-color-base-content)]"
                />
              </div>
              <ModusWcTypography
                hierarchy="p"
                size="md"
                label="Plan it visually. Press Execute. Watch your Trimble agents simulate it."
                customClass="m-0 text-[var(--modus-wc-color-base-content-low-contrast)] max-w-md"
              />
              <div className="flex gap-3 flex-wrap justify-center">
                <ModusWcButton
                  variant="filled"
                  color="primary"
                  size="md"
                  onButtonClick={() => {
                    const p = addProject("New Project");
                    const wf = addWorkflow(p.id, "Untitled Workflow");
                    if (wf) navigate(`/projects/${p.id}/workflows/${wf.id}`);
                  }}
                >
                  <ModusWcIcon slot="start" name="add" size="sm" decorative />
                  New workflow
                </ModusWcButton>
                {totalWorkflows > 0 && (
                  <ModusWcButton
                    variant="outlined"
                    color="secondary"
                    size="md"
                    onButtonClick={() => navigate(`/projects/${projects[0].id}`)}
                  >
                    Open recent
                  </ModusWcButton>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Starter suggestions ─────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <ModusWcIcon name="ai_stars" size="sm" decorative customClass="text-[var(--modus-wc-color-primary)]" />
            <ModusWcTypography
              hierarchy="p"
              size="sm"
              weight="semibold"
              label="Start with a template"
              customClass="m-0 text-[var(--modus-wc-color-base-content)]"
            />
          </div>
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {STARTER_PROMPTS.map(({ label, icon }) => (
              <li key={label}>
                <ModusWcButton
                  variant="filled"
                  color="tertiary"
                  size="sm"
                  customClass="w-full !h-auto justify-start"
                  onButtonClick={() => handleQuickStart(label)}
                >
                  <ModusWcIcon slot="start" name={icon} size="sm" decorative />
                  <span className="text-left font-normal">{label}</span>
                </ModusWcButton>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Recent projects ──────────────────────────── */}
        {projects.length > 0 && (
          <div className="flex flex-col gap-3">
            <ModusWcTypography
              hierarchy="p"
              size="sm"
              weight="semibold"
              label="Recent projects"
              customClass="m-0 text-[var(--modus-wc-color-base-content)]"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {projects.map((project) => (
                <ModusWcCard
                  key={project.id}
                  customClass="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <div className="flex items-start gap-3 p-4">
                    <span
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-white text-sm font-bold flex-shrink-0 mt-0.5"
                      style={{ background: project.color ?? "#0063a3" }}
                    >
                      {project.name.charAt(0)}
                    </span>
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <ModusWcTypography
                        hierarchy="p"
                        size="sm"
                        weight="semibold"
                        label={project.name}
                        customClass="m-0 text-[var(--modus-wc-color-base-content)] truncate"
                      />
                      {project.description && (
                        <ModusWcTypography
                          hierarchy="p"
                          size="xs"
                          label={project.description}
                          customClass="m-0 text-[var(--modus-wc-color-base-content-low-contrast)] truncate"
                        />
                      )}
                      <ModusWcBadge
                        text={`${project.workflows.length} workflow${project.workflows.length !== 1 ? "s" : ""}`}
                        color="secondary"
                        size="sm"
                        customClass="mt-1 w-fit"
                      />
                    </div>
                  </div>
                </ModusWcCard>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
