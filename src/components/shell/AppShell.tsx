import React, { useState, useEffect } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import {
  ModusWcNavbar,
  ModusWcCard,
  ModusWcMenu,
  ModusWcMenuItem,
  ModusWcIcon,
  ModusWcTypography,
  ModusWcButton,
  ModusWcModal,
  ModusWcTextInput,
} from "@trimble-oss/moduswebcomponents-react";
import { useAppStore } from "@/store/appStore";

const MOBILE_BP = 768;

export default function AppShell() {
  const navigate = useNavigate();
  const { projectId, workflowId } = useParams();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Listen for the navbar's mainMenuOpenChange event at the document level
  // (avoids ref issues with Modus WC custom elements)
  useEffect(() => {
    const handler = () => setSidebarOpen((prev) => !prev);
    document.addEventListener("mainMenuOpenChange", handler);
    return () => document.removeEventListener("mainMenuOpenChange", handler);
  }, []);
  const [width, setWidth] = useState(window.innerWidth);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set(["p1"]));

  const { projects, addProject, addWorkflow } = useAppStore();
  const mobile = width < MOBILE_BP;

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Close on mobile when navigating
  useEffect(() => {
    if (mobile) setSidebarOpen(false);
  }, [mobile]);

  // Auto-expand the active project
  useEffect(() => {
    if (projectId) setExpandedProjects((s) => new Set([...s, projectId]));
  }, [projectId]);

  const closeAndNavigate = (to: string) => {
    setSidebarOpen(false);
    navigate(to);
  };

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;
    const p = addProject(newProjectName.trim(), newProjectDesc.trim() || undefined);
    setNewProjectOpen(false);
    setNewProjectName("");
    setNewProjectDesc("");
    navigate(`/projects/${p.id}`);
  };

  const handleAddWorkflow = (pid: string) => {
    const name = `Workflow ${(projects.find((p) => p.id === pid)?.workflows.length ?? 0) + 1}`;
    const wf = addWorkflow(pid, name);
    if (wf) closeAndNavigate(`/projects/${pid}/workflows/${wf.id}`);
  };

  const toggleProjectExpand = (pid: string) => {
    setExpandedProjects((s) => {
      const next = new Set(s);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-[var(--modus-wc-color-base-page)] overflow-hidden">

      {/* ── Navbar ──────────────────────────────────────── */}
      <ModusWcNavbar
        visibility={{ mainMenu: true, user: true, apps: true, notifications: true, search: false, help: false, ai: false, searchInput: false }}
        customClass="flex-shrink-0"
      >
        <div slot="start" className="flex items-center gap-2 pl-2">
          <div className="ai-ux-agent-mark-static" aria-hidden>
            <ModusWcIcon name="ai_stars" size="sm" decorative customClass="text-white" />
          </div>
          <ModusWcTypography
            hierarchy="h6" size="md" weight="bold" label="AI Dashboard"
            customClass="text-[var(--modus-wc-color-base-content)] m-0 hidden sm:block"
          />
        </div>
      </ModusWcNavbar>

      {/* ── Content area (full width always) ────────────── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Main page content — always full width */}
        <div className="h-full overflow-hidden">
          <Outlet />
        </div>
      </div>

      {/* ── Nav overlay — below navbar, does NOT cover it ── */}
      {/* Backdrop: starts below the 56px navbar */}
      <div
        className={`
          fixed left-0 right-0 bottom-0 z-[100] bg-black/50 backdrop-blur-[2px]
          transition-opacity duration-300
          ${sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
        `}
        style={{ top: 56 }}
        onClick={() => setSidebarOpen(false)}
        aria-hidden
      />

      {/* Card: starts 8px below the navbar bottom */}
      <div
        className={`
          fixed left-3 bottom-3 z-[110]
          flex flex-col
          transition-all duration-300 ease-out
          ${sidebarOpen
            ? "translate-x-0 opacity-100 pointer-events-auto"
            : "-translate-x-[calc(100%+1rem)] opacity-0 pointer-events-none"}
        `}
        style={{ top: 56 + 8, width: 256 }}
      >
        <ModusWcCard
          bordered
          customClass="h-full flex flex-col overflow-hidden !rounded-xl shadow-2xl"
        >
          <div className="flex flex-col h-full overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-3 pt-3 pb-1 flex-shrink-0">
              <ModusWcTypography
                hierarchy="p" size="xs" weight="semibold" label="PROJECTS"
                customClass="text-[var(--modus-wc-color-base-content-low-contrast)] m-0 tracking-wider"
              />
              <ModusWcButton
                size="sm" variant="borderless" color="secondary" shape="square"
                aria-label="New project"
                onButtonClick={() => setNewProjectOpen(true)}
              >
                <ModusWcIcon name="add" size="sm" decorative />
              </ModusWcButton>
            </div>

            {/* Scrollable project list */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
              <ModusWcMenu size="md">
                {projects.map((project) => {
                  const isExpanded = expandedProjects.has(project.id);
                  const isActiveProject = projectId === project.id;

                  return (
                    <React.Fragment key={project.id}>
                      <ModusWcMenuItem
                        label={project.name}
                        value={`project-${project.id}`}
                        selected={isActiveProject && !workflowId}
                        onItemSelect={() => {
                          toggleProjectExpand(project.id);
                          closeAndNavigate(`/projects/${project.id}`);
                        }}
                      >
                        <span
                          slot="start-icon"
                          className="flex items-center justify-center w-5 h-5 rounded text-white text-xs font-bold flex-shrink-0"
                          style={{ background: project.color ?? "#0063a3" }}
                          aria-hidden
                        >
                          {project.name.charAt(0).toUpperCase()}
                        </span>
                        <ModusWcIcon
                          slot="end-icon"
                          name={isExpanded ? "expand_less" : "expand_more"}
                          size="sm" decorative
                        />
                      </ModusWcMenuItem>

                      {isExpanded && (
                        <>
                          {project.workflows.map((wf) => (
                            <ModusWcMenuItem
                              key={wf.id}
                              label={wf.name}
                              value={`wf-${wf.id}`}
                              selected={workflowId === wf.id}
                              customClass="pl-8"
                              onItemSelect={() => closeAndNavigate(`/projects/${project.id}/workflows/${wf.id}`)}
                            >
                              <ModusWcIcon slot="start-icon" name="schema" size="sm" decorative />
                            </ModusWcMenuItem>
                          ))}
                          <ModusWcMenuItem
                            label="Add workflow"
                            value={`add-wf-${project.id}`}
                            customClass="pl-8 opacity-60 hover:opacity-100"
                            onItemSelect={() => handleAddWorkflow(project.id)}
                          >
                            <ModusWcIcon slot="start-icon" name="add" size="sm" decorative />
                          </ModusWcMenuItem>
                        </>
                      )}
                    </React.Fragment>
                  );
                })}
              </ModusWcMenu>
            </div>


          </div>
        </ModusWcCard>
      </div>

      {/* ── New Project Modal ─────────────────────────── */}
      {newProjectOpen && (
        <ModusWcModal
          open
          headerText="New Project"
          primaryButtonText="Create"
          secondaryButtonText="Cancel"
          onPrimaryButtonClick={handleCreateProject}
          onSecondaryButtonClick={() => { setNewProjectOpen(false); setNewProjectName(""); setNewProjectDesc(""); }}
          onOverlayClick={() => { setNewProjectOpen(false); setNewProjectName(""); setNewProjectDesc(""); }}
        >
          <div className="flex flex-col gap-4 py-2">
            <ModusWcTextInput
              label="Project name"
              placeholder="e.g. Product Planning"
              value={newProjectName}
              required
              onValueChange={(e: CustomEvent<string>) => setNewProjectName(e.detail)}
            />
            <ModusWcTextInput
              label="Description (optional)"
              placeholder="What is this project for?"
              value={newProjectDesc}
              onValueChange={(e: CustomEvent<string>) => setNewProjectDesc(e.detail)}
            />
          </div>
        </ModusWcModal>
      )}
    </div>
  );
}
