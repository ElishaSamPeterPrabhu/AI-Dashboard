import { useParams, useNavigate } from "react-router-dom";
import {
  ModusWcTypography,
  ModusWcButton,
  ModusWcCard,
  ModusWcIcon,
  ModusWcBadge,
} from "@trimble-oss/moduswebcomponents-react";
import { useAppStore } from "@/store/appStore";
import { badgeColorForProjectId } from "@/utils/projectBadgeColor";

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { projects, addWorkflow } = useAppStore();

  const project = projects.find((p) => p.id === projectId);
  if (!project) return (
    <div className="flex items-center justify-center h-full">
      <ModusWcTypography hierarchy="p" size="md" label="Project not found." customClass="text-[var(--modus-wc-color-base-content-low-contrast)] m-0" />
    </div>
  );

  const handleAddWorkflow = () => {
    const wf = addWorkflow(project.id, `Workflow ${project.workflows.length + 1}`);
    if (wf) navigate(`/projects/${project.id}/workflows/${wf.id}`);
  };

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[var(--modus-wc-color-base-page)]">
      <div className="max-w-4xl mx-auto w-full px-6 py-8 flex flex-col gap-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <ModusWcBadge
              color={badgeColorForProjectId(project.id)}
              size="lg"
              variant="counter"
              customClass="flex-shrink-0"
              aria-hidden
            >
              {project.name.charAt(0).toUpperCase()}
            </ModusWcBadge>
            <div className="flex flex-col gap-1">
              <ModusWcTypography hierarchy="h4" size="xl" weight="bold" label={project.name} customClass="m-0 text-[var(--modus-wc-color-base-content)]" />
              {project.description && (
                <ModusWcTypography hierarchy="p" size="sm" label={project.description} customClass="m-0 text-[var(--modus-wc-color-base-content-low-contrast)]" />
              )}
            </div>
          </div>
          <ModusWcButton variant="filled" color="primary" size="sm" onButtonClick={handleAddWorkflow}>
            <ModusWcIcon slot="start" name="add" size="sm" decorative />
            New workflow
          </ModusWcButton>
        </div>

        {/* Workflows */}
        {project.workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <ModusWcIcon name="schema" size="lg" decorative customClass="text-[var(--modus-wc-color-base-300)]" />
            <ModusWcTypography hierarchy="p" size="md" label="No workflows yet" customClass="m-0 text-[var(--modus-wc-color-base-content-low-contrast)]" />
            <ModusWcButton variant="filled" color="primary" size="sm" onButtonClick={handleAddWorkflow}>
              Create your first workflow
            </ModusWcButton>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {project.workflows.map((wf) => (
              <ModusWcCard
                key={wf.id}
                customClass="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/projects/${project.id}/workflows/${wf.id}`)}
              >
                <div className="flex items-start gap-3 p-4">
                  <ModusWcBadge color="tertiary" variant="outlined" size="md" customClass="flex-shrink-0" aria-hidden>
                    <ModusWcIcon name="schema" size="sm" decorative customClass="text-[var(--modus-wc-color-primary)]" />
                  </ModusWcBadge>
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <ModusWcTypography hierarchy="p" size="sm" weight="semibold" label={wf.name} customClass="m-0 text-[var(--modus-wc-color-base-content)] truncate" />
                    {wf.description && (
                      <ModusWcTypography hierarchy="p" size="xs" label={wf.description} customClass="m-0 text-[var(--modus-wc-color-base-content-low-contrast)] truncate" />
                    )}
                    <ModusWcTypography hierarchy="p" size="xs" label={`Updated ${formatDate(wf.updatedAt)}`} customClass="m-0 text-[var(--modus-wc-color-base-content-low-contrast)]" />
                  </div>
                  <ModusWcBadge color="secondary" size="sm" customClass="flex-shrink-0">
                    Plan
                  </ModusWcBadge>
                </div>
              </ModusWcCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
