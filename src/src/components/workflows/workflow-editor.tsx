"use client";

/**
 * WorkflowEditor — Client component for creating and editing workflows (JV-11 + JV-22)
 *
 * Features:
 * - Create/edit workflow name and description
 * - Add, edit, reorder, and delete workflow steps
 * - Each step has: type, trigger timing, email content
 * - Assign workflows to workshops (JV-04 workshopCode linkage)
 * - Date-relative scheduling presets (JV-22)
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WorkflowTimeline } from "@/components/workflows/workflow-timeline";
import { WorkflowExecutions } from "@/components/workflows/workflow-executions";
import {
  STEP_TYPES,
  STEP_TYPE_LABELS,
  TRIGGER_TYPES,
  TRIGGER_TYPE_LABELS,
  OFFSET_PRESETS,
  HOUR_OFFSET_PRESETS,
  WORKFLOW_VARIABLES,
} from "@/lib/workflow-types";
import type { StepType, TriggerType, OffsetMode } from "@/lib/workflow-types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ============================================
// Types (serialized from server)
// ============================================

interface SerializedStep {
  id: string;
  workflowId: string;
  sortOrder: number;
  stepType: string;
  emailTemplateId: string | null;
  subject: string | null;
  body: string | null;
  customRecipients: string | null;
  triggerType: string;
  offsetDays: number | null;
  offsetHours: number | null;
  sendTimeOfDay: string | null;
  attachments: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  emailTemplate: { id: string; name: string; subject: string } | null;
}

interface SerializedAssignment {
  id: string;
  workflowId: string;
  workshopId: string;
  workshopCode: string;
  isActive: boolean;
  assignedBy: string;
  assignedAt: string;
  workshop: {
    id: string;
    title: string;
    workshopCode: string;
    eventDate: string;
    status: string;
  };
}

interface SerializedWorkflow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isTemplate: boolean;
  categoryId: string | null;
  workshopFormat: string | null;
  workflowPhase: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  steps: SerializedStep[];
  assignments: SerializedAssignment[];
}

interface EmailTemplateOption {
  id: string;
  name: string;
  subject: string;
  type: string;
}

interface WorkshopOption {
  id: string;
  title: string;
  workshopCode: string;
  eventDate: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface WorkflowEditorProps {
  workflow: SerializedWorkflow | null;
  emailTemplates: EmailTemplateOption[];
  workshops: WorkshopOption[];
  categories: CategoryOption[];
  isNew: boolean;
  isPreview?: boolean;
}

// ============================================
// Component
// ============================================

export function WorkflowEditor({
  workflow: initialWorkflow,
  emailTemplates,
  workshops,
  categories,
  isNew,
  isPreview = false,
}: WorkflowEditorProps) {
  const router = useRouter();

  // Workflow state
  const [name, setName] = useState(initialWorkflow?.name ?? "");
  const [description, setDescription] = useState(initialWorkflow?.description ?? "");
  const [isTemplate, setIsTemplate] = useState(initialWorkflow?.isTemplate ?? false);
  const [categoryId, setCategoryId] = useState<string>(initialWorkflow?.categoryId ?? "");
  const [workshopFormat, setWorkshopFormat] = useState<string>(initialWorkflow?.workshopFormat ?? "");
  const [workflowPhase, setWorkflowPhase] = useState<string>(initialWorkflow?.workflowPhase ?? "");
  const [steps, setSteps] = useState<SerializedStep[]>(initialWorkflow?.steps ?? []);
  const [assignments, setAssignments] = useState<SerializedAssignment[]>(
    initialWorkflow?.assignments ?? []
  );
  const [workflowId, setWorkflowId] = useState<string | null>(initialWorkflow?.id ?? null);

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [showNewStep, setShowNewStep] = useState(false);
  const [assignWorkshopId, setAssignWorkshopId] = useState("");
  const [showVariables, setShowVariables] = useState(false);
  const [activeTab, setActiveTab] = useState<"steps" | "timeline" | "executions">("steps");

  // ============================================
  // Save Workflow (create or update)
  // ============================================

  const saveWorkflow = useCallback(async () => {
    if (!name.trim()) {
      setError("Workflow name is required");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (isNew && !workflowId) {
        // Create new workflow
        const res = await fetch("/api/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            isTemplate,
            categoryId: categoryId || null,
            workshopFormat: workshopFormat || null,
            workflowPhase: workflowPhase || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create workflow");

        setWorkflowId(data.data.id);
        setSuccess("Workflow created! Now add steps below.");
        router.replace(`/admin/workflows/${data.data.id}`);
      } else if (workflowId) {
        // Update existing
        const res = await fetch(`/api/workflows/${workflowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            isTemplate,
            categoryId: categoryId || null,
            workshopFormat: workshopFormat || null,
            workflowPhase: workflowPhase || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update workflow");

        setSuccess("Workflow saved.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [name, description, isTemplate, categoryId, workshopFormat, workflowPhase, isNew, workflowId, router]);

  // ============================================
  // Step CRUD
  // ============================================

  const addStep = useCallback(
    async (stepData: {
      stepType: StepType;
      triggerType: TriggerType;
      subject?: string;
      body?: string;
      emailTemplateId?: string;
      offsetDays?: number;
      offsetHours?: number;
      sendTimeOfDay?: string | null;
      customRecipients?: string[];
    }) => {
      if (!workflowId) return;

      setSaving(true);
      setError(null);

      try {
        const res = await fetch(`/api/workflows/${workflowId}/steps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...stepData, sortOrder: steps.length }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to add step");

        setSteps((prev) => [...prev, data.data]);
        setShowNewStep(false);
        setSuccess("Step added.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add step");
      } finally {
        setSaving(false);
      }
    },
    [workflowId, steps.length]
  );

  const updateStep = useCallback(
    async (stepId: string, updateData: Record<string, unknown>) => {
      if (!workflowId) return;

      setSaving(true);
      setError(null);

      try {
        const res = await fetch(`/api/workflows/${workflowId}/steps/${stepId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update step");

        setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...data.data } : s)));
        setEditingStepId(null);
        setSuccess("Step updated.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update step");
      } finally {
        setSaving(false);
      }
    },
    [workflowId]
  );

  const deleteStep = useCallback(
    async (stepId: string) => {
      if (!workflowId || !confirm("Delete this step?")) return;

      try {
        const res = await fetch(`/api/workflows/${workflowId}/steps/${stepId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete step");

        setSteps((prev) => prev.filter((s) => s.id !== stepId));
        setSuccess("Step deleted.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete step");
      }
    },
    [workflowId]
  );

  // ============================================
  // Workshop Assignment
  // ============================================

  const assignWorkshop = useCallback(async () => {
    if (!workflowId || !assignWorkshopId) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/workflows/${workflowId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workshopId: assignWorkshopId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign workflow");

      setAssignments((prev) => [...prev, data.data]);
      setAssignWorkshopId("");
      setSuccess("Workflow assigned to workshop.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setSaving(false);
    }
  }, [workflowId, assignWorkshopId]);

  const unassignWorkshop = useCallback(
    async (assignmentId: string) => {
      if (!workflowId || !confirm("Remove this workflow from the workshop?")) return;

      try {
        const res = await fetch(`/api/workflows/${workflowId}/assign`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignmentId }),
        });
        if (!res.ok) throw new Error("Failed to unassign");

        setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
        setSuccess("Workshop unassigned.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to unassign");
      }
    },
    [workflowId]
  );

  // ============================================
  // Render
  // ============================================

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/workflows"
              className="text-muted-foreground hover:text-muted-foreground"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-foreground">
              {isPreview ? "Preview Workflow" : isNew && !workflowId ? "New Workflow" : "Edit Workflow"}
            </h1>
            {isPreview && <Badge variant="secondary">Read-only</Badge>}
          </div>
          <p className="text-muted-foreground mt-1">
            {isPreview
              ? "Review this workflow without making changes."
              : "Build automated email sequences for your workshops."}
          </p>
        </div>
        {!isPreview && (
          <button
            onClick={saveWorkflow}
            disabled={saving}
            className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Workflow"}
          </button>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-success/10 border border-success/20 rounded-lg p-3 text-sm text-success">
          {success}
        </div>
      )}

      {/* === Section 1: Workflow Details === */}
      <div className="bg-card rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Workflow Details</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="wf-name" className="block text-sm font-medium text-foreground">
              Name *
            </label>
            <input
              id="wf-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={isPreview}
              placeholder="e.g., Standard Pre-Event Sequence"
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="wf-desc" className="block text-sm font-medium text-foreground">
              Description
            </label>
            <input
              id="wf-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              readOnly={isPreview}
              placeholder="Brief description of this workflow's purpose"
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:ring-primary"
            />
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={isTemplate}
            onChange={(e) => setIsTemplate(e.target.checked)}
            disabled={isPreview}
            className="rounded border-border text-primary focus:ring-primary"
          />
          Save as feature template (reusable across workshops)
          {/* MR-37: Feature template tooltip (accessible via Radix Tooltip) */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="What is a feature template?"
                  className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-muted text-xs text-muted-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                >
                  ?
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                A feature template is a reusable workflow that can be automatically assigned to workshops based on category, format, and phase. When a new workshop is approved, any matching feature templates are automatically applied.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </label>

        {/* Auto-assignment filters for auto-build on approval */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-border">
          <div>
            <label htmlFor="wf-category" className="block text-sm font-medium text-muted-foreground">
              Category (auto-assign)
            </label>
            <select
              id="wf-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={isPreview}
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="">Any category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wf-format" className="block text-sm font-medium text-muted-foreground">
              Format (auto-assign)
            </label>
            <select
              id="wf-format"
              value={workshopFormat}
              onChange={(e) => setWorkshopFormat(e.target.value)}
              disabled={isPreview}
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="">Any format</option>
              <option value="IN_PERSON">In-Person</option>
              <option value="VIRTUAL">Virtual</option>
            </select>
          </div>
          <div>
            <label htmlFor="wf-phase" className="block text-sm font-medium text-muted-foreground">
              Phase (auto-assign)
            </label>
            <select
              id="wf-phase"
              value={workflowPhase}
              onChange={(e) => setWorkflowPhase(e.target.value)}
              disabled={isPreview}
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="">Not set</option>
              <option value="PRE_EVENT">Pre-Event</option>
              <option value="POST_EVENT">Post-Event</option>
            </select>
          </div>
        </div>
      </div>

      {/* === Section 2: Tabbed content (Steps / Timeline / Executions) === */}
      {workflowId && (
        <div className="bg-card rounded-lg shadow overflow-hidden">
          {/* Tab bar */}
          <div className="border-b flex">
            {(["steps", "timeline", "executions"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {tab === "steps" && `Steps (${steps.length})`}
                {tab === "timeline" && "Timeline"}
                {tab === "executions" && "Execution Status"}
              </button>
            ))}
          </div>

          <div className="p-6 space-y-4">
          {/* --- Steps tab --- */}
          {activeTab === "steps" && (
            <>
          <div className="flex items-center justify-end">
            <div className="flex gap-2">
              <button
                onClick={() => setShowVariables(!showVariables)}
                className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 border rounded-md"
              >
                {showVariables ? "Hide" : "Show"} Variables
              </button>
              {!isPreview && (
                <button
                  onClick={() => setShowNewStep(true)}
                  className="inline-flex rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  + Add Step
                </button>
              )}
            </div>
          </div>

          {/* Variable reference panel */}
          {showVariables && (
            <div className="bg-info/10 border border-info/20 rounded-lg p-4">
              <h4 className="text-sm font-medium text-info mb-2">
                Available Template Variables
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {Object.entries(WORKFLOW_VARIABLES).map(([variable, desc]) => (
                  <div key={variable} className="text-xs">
                    <code className="bg-primary/10 px-1 py-0.5 rounded text-primary">
                      {variable}
                    </code>{" "}
                    <span className="text-primary">— {desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step list */}
          {steps.length === 0 && !showNewStep && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No steps yet. Click &ldquo;+ Add Step&rdquo; to build your email sequence.
            </p>
          )}

          <div className="space-y-3">
            {steps.map((step, index) => (
              <StepCard
                key={step.id}
                step={step}
                index={index}
                isEditing={editingStepId === step.id}
                readOnly={isPreview}
                emailTemplates={emailTemplates}
                onEdit={() => setEditingStepId(step.id)}
                onCancelEdit={() => setEditingStepId(null)}
                onSave={(data) => updateStep(step.id, data)}
                onDelete={() => deleteStep(step.id)}
              />
            ))}
          </div>

          {/* New step form */}
          {showNewStep && !isPreview && (
            <NewStepForm
              emailTemplates={emailTemplates}
              onAdd={addStep}
              onCancel={() => setShowNewStep(false)}
              saving={saving}
            />
          )}
            </>
          )}

          {/* --- Timeline tab --- */}
          {activeTab === "timeline" && (
            <WorkflowTimeline steps={steps} />
          )}

          {/* --- Executions tab --- */}
          {activeTab === "executions" && (
            <WorkflowExecutions workflowId={workflowId} />
          )}
          </div>
        </div>
      )}

      {/* === Section 3: Workshop Assignments === */}
      {workflowId && (
        <div className="bg-card rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Assigned Workshops ({assignments.length})
          </h2>

          {/* Assignment form */}
          {!isPreview && (
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label htmlFor="assign-ws" className="block text-sm font-medium text-foreground mb-1">
                  Assign to Workshop
                </label>
                <select
                  id="assign-ws"
                  value={assignWorkshopId}
                  onChange={(e) => setAssignWorkshopId(e.target.value)}
                  className="block w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                >
                  <option value="">Select a workshop...</option>
                  {workshops
                    .filter((w) => !assignments.some((a) => a.workshopId === w.id))
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        [{w.workshopCode}] {w.title} —{" "}
                        {new Date(w.eventDate).toLocaleDateString("en-US", { timeZone: "UTC" })}
                      </option>
                    ))}
                </select>
              </div>
              <button
                onClick={assignWorkshop}
                disabled={!assignWorkshopId || saving}
                className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          )}

          {/* Current assignments */}
          {assignments.length > 0 && (
            <div className="divide-y divide-border">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <span className="font-medium text-foreground">
                      {assignment.workshop.title}
                    </span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      [{assignment.workshopCode}]
                    </span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      {new Date(assignment.workshop.eventDate).toLocaleDateString("en-US", { timeZone: "UTC" })}
                    </span>
                    <Badge variant="secondary" className="ml-2">
                      {assignment.workshop.status}
                    </Badge>
                  </div>
                  {!isPreview && (
                    <button
                      onClick={() => unassignWorkshop(assignment.id)}
                      className="text-sm text-destructive hover:text-destructive/80"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ============================================
// StepCard — displays a single workflow step
// ============================================

function StepCard({
  step,
  index,
  isEditing,
  readOnly,
  emailTemplates,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  step: SerializedStep;
  index: number;
  isEditing: boolean;
  readOnly: boolean;
  emailTemplates: EmailTemplateOption[];
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (data: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [stepType, setStepType] = useState(step.stepType);
  const [triggerType, setTriggerType] = useState(step.triggerType);
  const [offsetDays, setOffsetDays] = useState<number>(step.offsetDays ?? 0);
  const [offsetHours, setOffsetHours] = useState<number>(step.offsetHours ?? 0);
  const [sendTime, setSendTime] = useState(step.sendTimeOfDay ?? "");
  const [offsetMode, setOffsetMode] = useState<OffsetMode>(
    step.offsetHours && step.offsetHours !== 0 && (step.offsetDays ?? 0) === 0 && !step.sendTimeOfDay
      ? "hours"
      : "days"
  );
  const [subject, setSubject] = useState(step.subject ?? "");
  const [body, setBody] = useState(step.body ?? "");
  const [templateId, setTemplateId] = useState(step.emailTemplateId ?? "");

  // JV-12: File attachments for this step
  const [stepFiles, setStepFiles] = useState<{ id: string; filename: string; blobUrl?: string; contentType: string }[]>([]);
  const [availableFiles, setAvailableFiles] = useState<{ id: string; filename: string; contentType: string }[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  useEffect(() => {
    if (!isEditing) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingFiles(true);
    // Fetch files attached to this step and all available workshop files
    Promise.all([
      fetch(`/api/files?workflowStepId=${step.id}`).then((r) => r.json()),
      fetch("/api/files").then((r) => r.json()),
    ])
      .then(([stepData, allData]) => {
        if (stepData.data) setStepFiles(stepData.data);
        if (allData.data) {
          // Filter out files already attached to this step
          const stepFileIds = new Set((stepData.data || []).map((f: { id: string }) => f.id));
          setAvailableFiles(allData.data.filter((f: { id: string }) => !stepFileIds.has(f.id)));
        }
      })
      .finally(() => setLoadingFiles(false));
  }, [isEditing, step.id]);

  async function attachFile(fileId: string) {
    const res = await fetch(`/api/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowStepId: step.id }),
    });
    if (res.ok) {
      const attached = availableFiles.find((f) => f.id === fileId);
      if (attached) {
        setStepFiles((prev) => [...prev, { ...attached, blobUrl: "" }]);
        setAvailableFiles((prev) => prev.filter((f) => f.id !== fileId));
      }
    }
  }

  async function detachFile(fileId: string) {
    const res = await fetch(`/api/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowStepId: null }),
    });
    if (res.ok) {
      const detached = stepFiles.find((f) => f.id === fileId);
      if (detached) {
        setAvailableFiles((prev) => [...prev, { id: detached.id, filename: detached.filename, contentType: detached.contentType }]);
        setStepFiles((prev) => prev.filter((f) => f.id !== fileId));
      }
    }
  }

  const handleModeSwitch = (mode: OffsetMode) => {
    setOffsetMode(mode);
    if (mode === "days") {
      setOffsetDays(-1);
      setOffsetHours(0);
      setSendTime("09:00");
    } else {
      setOffsetDays(0);
      setOffsetHours(-1);
      setSendTime("");
    }
  };

  const timingLabel = formatTimingLabel(step);

  if (!isEditing) {
    return (
      <div className="border rounded-lg p-4 flex items-start justify-between hover:border-border transition-colors">
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-bold">
            {index + 1}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">
                {STEP_TYPE_LABELS[step.stepType as StepType] || step.stepType}
              </span>
              {!step.isActive && <Badge variant="outline">Disabled</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{timingLabel}</p>
            {step.subject && (
              <p className="text-sm text-muted-foreground mt-1">
                Subject: <span className="font-medium">{step.subject}</span>
              </p>
            )}
            {step.emailTemplate && (
              <p className="text-sm text-muted-foreground mt-0.5">
                Template: {step.emailTemplate.name}
              </p>
            )}
          </div>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="text-sm text-primary hover:text-primary/80"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="text-sm text-destructive hover:text-destructive/80"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    );
  }

  // Editing mode
  return (
    <div className="border-2 border-primary/30 rounded-lg p-4 space-y-3 bg-primary/5">
      <h4 className="font-medium text-foreground">Edit Step {index + 1}</h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground">Step Type</label>
          <select
            value={stepType}
            onChange={(e) => setStepType(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            {Object.entries(STEP_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Trigger</label>
          <select
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            {Object.entries(TRIGGER_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Timing fields for RELATIVE_TO_EVENT */}
      {triggerType === TRIGGER_TYPES.RELATIVE_TO_EVENT && (
        <div className="space-y-3">
          {/* Mode toggle */}
          <div className="inline-flex rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => handleModeSwitch("days")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                offsetMode === "days"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Days
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch("hours")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                offsetMode === "hours"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Hours
            </button>
          </div>

          {/* Fields based on mode */}
          {offsetMode === "days" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground">Timing</label>
                <select
                  value={offsetDays}
                  onChange={(e) => setOffsetDays(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
                >
                  {OFFSET_PRESETS.map((preset) => (
                    <option key={preset.days} value={preset.days}>
                      {preset.label}
                    </option>
                  ))}
                  <option value={-30}>30 days before</option>
                  <option value={60}>60 days after</option>
                  <option value={90}>90 days after</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">Send at</label>
                <input
                  type="time"
                  value={sendTime}
                  onChange={(e) => setSendTime(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-foreground">Timing</label>
              <select
                value={offsetHours}
                onChange={(e) => setOffsetHours(Number(e.target.value))}
                className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
              >
                {HOUR_OFFSET_PRESETS.map((preset) => (
                  <option key={preset.hours} value={preset.hours}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Email content */}
      <div>
        <label className="block text-sm font-medium text-foreground">
          Email Template (optional)
        </label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
        >
          <option value="">Custom content (no template)</option>
          {emailTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} — {t.subject}
            </option>
          ))}
        </select>
      </div>

      {!templateId && (
        <>
          <div>
            <label className="block text-sm font-medium text-foreground">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Your {{workshopTitle}} workshop is tomorrow!"
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">Body (HTML)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Hi {{registrantName}},&#10;&#10;Your workshop is coming up..."
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm font-mono"
            />
          </div>
        </>
      )}

      {/* JV-12: File Attachments */}
      <div className="border-t pt-3 mt-3">
        <label className="block text-sm font-medium text-foreground mb-2">
          File Attachments ({stepFiles.length})
        </label>
        {loadingFiles ? (
          <p className="text-xs text-muted-foreground">Loading files...</p>
        ) : (
          <>
            {stepFiles.length > 0 && (
              <div className="space-y-1 mb-2">
                {stepFiles.map((f) => (
                  <div key={f.id} className="flex items-center justify-between bg-muted rounded px-2 py-1 text-sm">
                    <span className="text-foreground truncate">{f.filename}</span>
                    <button
                      onClick={() => detachFile(f.id)}
                      className="text-xs text-destructive hover:text-destructive/80 ml-2"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            {availableFiles.length > 0 && (
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    attachFile(e.target.value);
                    e.target.value = "";
                  }
                }}
                defaultValue=""
                className="block w-full rounded-md border border-border px-3 py-1.5 text-sm"
              >
                <option value="">Attach a file...</option>
                {availableFiles.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.filename}
                  </option>
                ))}
              </select>
            )}
            {availableFiles.length === 0 && stepFiles.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No files uploaded yet. Upload files from the Files page first.
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={() =>
            onSave({
              stepType,
              triggerType,
              offsetDays: offsetMode === "hours" ? 0 : offsetDays,
              offsetHours: offsetMode === "days" ? 0 : offsetHours,
              sendTimeOfDay: offsetMode === "hours" ? null : (sendTime || "09:00"),
              subject: subject || null,
              body: body || null,
              emailTemplateId: templateId || null,
            })
          }
          className="inline-flex rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Save Changes
        </button>
        <button
          onClick={onCancelEdit}
          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border rounded-md"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ============================================
// NewStepForm — form for adding a new step
// ============================================

function NewStepForm({
  emailTemplates,
  onAdd,
  onCancel,
  saving,
}: {
  emailTemplates: EmailTemplateOption[];
  onAdd: (data: {
    stepType: StepType;
    triggerType: TriggerType;
    subject?: string;
    body?: string;
    emailTemplateId?: string;
    offsetDays?: number;
    offsetHours?: number;
    sendTimeOfDay?: string | null;
  }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [stepType, setStepType] = useState<StepType>(STEP_TYPES.EMAIL_ATTENDEES);
  const [triggerType, setTriggerType] = useState<TriggerType>(TRIGGER_TYPES.RELATIVE_TO_EVENT);
  const [offsetDays, setOffsetDays] = useState(-1);
  const [offsetHours, setOffsetHours] = useState(0);
  const [sendTime, setSendTime] = useState("09:00");
  const [offsetMode, setOffsetMode] = useState<OffsetMode>("days");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState("");

  const handleModeSwitch = (mode: OffsetMode) => {
    setOffsetMode(mode);
    if (mode === "days") {
      setOffsetDays(-1);
      setOffsetHours(0);
      setSendTime("09:00");
    } else {
      setOffsetDays(0);
      setOffsetHours(-1);
      setSendTime("");
    }
  };

  return (
    <div className="border-2 border-success/30 rounded-lg p-4 space-y-3 bg-success/5">
      <h4 className="font-medium text-foreground">New Step</h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground">Step Type *</label>
          <select
            value={stepType}
            onChange={(e) => setStepType(e.target.value as StepType)}
            className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            {Object.entries(STEP_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Trigger *</label>
          <select
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value as TriggerType)}
            className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            {Object.entries(TRIGGER_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {triggerType === TRIGGER_TYPES.RELATIVE_TO_EVENT && (
        <div className="space-y-3">
          {/* Mode toggle */}
          <div className="inline-flex rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => handleModeSwitch("days")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                offsetMode === "days"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Days
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch("hours")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                offsetMode === "hours"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Hours
            </button>
          </div>

          {/* Fields based on mode */}
          {offsetMode === "days" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground">Timing</label>
                <select
                  value={offsetDays}
                  onChange={(e) => setOffsetDays(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
                >
                  {OFFSET_PRESETS.map((preset) => (
                    <option key={preset.days} value={preset.days}>
                      {preset.label}
                    </option>
                  ))}
                  <option value={-30}>30 days before</option>
                  <option value={60}>60 days after</option>
                  <option value={90}>90 days after</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">Send at</label>
                <input
                  type="time"
                  value={sendTime}
                  onChange={(e) => setSendTime(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-foreground">Timing</label>
              <select
                value={offsetHours}
                onChange={(e) => setOffsetHours(Number(e.target.value))}
                className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
              >
                {HOUR_OFFSET_PRESETS.map((preset) => (
                  <option key={preset.hours} value={preset.hours}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground">
          Email Template (optional)
        </label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
        >
          <option value="">Write custom content</option>
          {emailTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} — {t.subject}
            </option>
          ))}
        </select>
      </div>

      {!templateId && (
        <>
          <div>
            <label className="block text-sm font-medium text-foreground">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Reminder: {{workshopTitle}} is tomorrow!"
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">Body (HTML)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Hi {{registrantName}},&#10;&#10;Just a reminder that your workshop is coming up..."
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm font-mono"
            />
          </div>
        </>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={() =>
            onAdd({
              stepType,
              triggerType,
              subject: subject || undefined,
              body: body || undefined,
              emailTemplateId: templateId || undefined,
              offsetDays: offsetMode === "hours" ? 0 : offsetDays,
              offsetHours: offsetMode === "days" ? 0 : offsetHours,
              sendTimeOfDay: offsetMode === "hours" ? null : (sendTime || "09:00"),
            })
          }
          disabled={saving}
          className="inline-flex rounded-md bg-success px-3 py-1.5 text-sm font-medium text-success-foreground hover:bg-success/90 disabled:opacity-50"
        >
          {saving ? "Adding..." : "Add Step"}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border rounded-md"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ============================================
// Helpers
// ============================================

function formatTimingLabel(step: SerializedStep): string {
  if (step.triggerType === TRIGGER_TYPES.ON_REGISTRATION) return "Sends on registration";
  if (step.triggerType === TRIGGER_TYPES.ON_APPROVAL) return "Sends on workshop approval";

  const days = step.offsetDays ?? 0;
  const hours = step.offsetHours ?? 0;

  if (days === 0 && hours === 0) return "Day of event";

  const parts: string[] = [];
  if (days !== 0) {
    const absDays = Math.abs(days);
    parts.push(`${absDays} day${absDays !== 1 ? "s" : ""} ${days < 0 ? "before" : "after"} event`);
  }
  if (hours !== 0) {
    const absHours = Math.abs(hours);
    parts.push(`${absHours}h ${hours < 0 ? "before" : "after"}`);
  }

  const timing = parts.join(", ");
  return step.sendTimeOfDay ? `${timing} at ${step.sendTimeOfDay}` : timing;
}
